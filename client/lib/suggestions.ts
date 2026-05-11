// Genre-based "Suggested for You" engine.
//
// We don't pull from TMDB at suggest-time — that would mean dozens of
// network calls to enrich items the user might never tap. Instead we
// use what's already in the user's library:
//
//   1. Each VOD/Series stream carries a `category_id`. Categories carry a
//      human-readable `category_name` (often "VOD - Horror", "Comedy 2024",
//      "Action FR", etc.) — provided by the Xtream panel.
//   2. We extract a normalised genre keyword from each category name
//      (horror, comedy, action, ...). If a category has no detectable
//      genre, it's skipped.
//   3. We walk the active profile's watch history (movies or series),
//      look up each watched stream's category, count genres, and take
//      the top 3.
//   4. We then collect every library item whose category matches one
//      of those top-3 genres, drop the already-watched ones, sort by
//      provider rating (which is typically the cached IMDb/TMDB score),
//      and return the top N.
//
// Result: a fast, fully-offline suggestion list of "highest-rated
// horror/comedy/action you can actually press play on right now" that
// adapts as the user keeps watching.

import type { VodStream, Series } from "./xtream-api";
import type { RecentlyWatched } from "../components/RecentlyWatchedCard";

export type SuggestableType = "movies" | "series";
export type SuggestionItem = VodStream | Series;

export type Category = { category_id: string; category_name: string };

export type SuggestionResult<T extends SuggestionItem> = {
  items: T[];
  /** Detected top genres (lower-case, e.g. ["horror","comedy"]). */
  topGenres: string[];
  /** True when there's no watch history to base suggestions on. */
  isEmpty: boolean;
};

// Order matters: longer / more specific phrases first so "science fiction"
// wins over "fiction", "rom com" wins over "comedy", etc.
const GENRE_KEYWORDS: Array<{ genre: string; patterns: string[] }> = [
  { genre: "sci-fi",      patterns: ["sci-fi", "sci fi", "scifi", "science fiction", "science-fiction"] },
  { genre: "rom-com",     patterns: ["rom com", "rom-com", "romcom", "romantic comedy"] },
  { genre: "horror",      patterns: ["horror", "scary", "terror", "slasher"] },
  { genre: "comedy",      patterns: ["comedy", "comedies", "sitcom", "funny", "stand up", "stand-up", "standup"] },
  { genre: "action",      patterns: ["action"] },
  { genre: "thriller",    patterns: ["thriller", "suspense"] },
  { genre: "drama",       patterns: ["drama", "dramas", "dramatic"] },
  { genre: "romance",     patterns: ["romance", "romantic", "romantica"] },
  { genre: "fantasy",     patterns: ["fantasy", "fantastico"] },
  { genre: "animation",   patterns: ["animation", "animated", "anime", "cartoon", "cartoons"] },
  { genre: "kids",        patterns: ["kids", "children", "family", "family-friendly"] },
  { genre: "crime",       patterns: ["crime", "mafia", "gangster", "noir"] },
  { genre: "mystery",     patterns: ["mystery", "detective", "whodunit"] },
  { genre: "adventure",   patterns: ["adventure"] },
  { genre: "war",         patterns: ["war", "military", "battle"] },
  { genre: "western",     patterns: ["western"] },
  { genre: "musical",     patterns: ["musical", "music"] },
  { genre: "documentary", patterns: ["documentary", "docu", "documentaries", "docs"] },
  { genre: "biography",   patterns: ["biography", "biopic", "biographical"] },
  { genre: "history",     patterns: ["history", "historical"] },
  { genre: "sport",       patterns: ["sport", "sports"] },
  { genre: "reality",     patterns: ["reality"] },
];

/** Detects a single genre keyword from a free-text string. Returns null if none match.
 *
 * Xtream providers use every imaginable separator — spaces, hyphens,
 * underscores, pipes, slashes, dots, colons, parens. We collapse all of
 * those into single spaces before searching so a lookup like "action"
 * matches "Action_2025", "VOD/Action", "Action.HD", "Action(EN)" etc.
 */
export function detectGenre(text: string | undefined | null): string | null {
  if (!text) return null;
  // Normalise separators → single spaces, pad both ends so word-boundary
  // checks at start/end work uniformly.
  const haystack = ` ${text.toLowerCase().replace(/[_|\-/.,:()\[\]\\]+/g, " ").replace(/\s+/g, " ").trim()} `;
  for (const { genre, patterns } of GENRE_KEYWORDS) {
    for (const p of patterns) {
      if (haystack.includes(` ${p} `)) return genre;
    }
  }
  return null;
}

/** Detect ALL matching genres from a free-text string (e.g. Series.genre
 *  "Action, Adventure, Sci-Fi" → ["action","adventure","sci-fi"]). */
function detectGenresAll(text: string | undefined | null): string[] {
  if (!text) return [];
  const haystack = ` ${text.toLowerCase().replace(/[_|\-/.,:()\[\]\\]+/g, " ").replace(/\s+/g, " ").trim()} `;
  const found = new Set<string>();
  for (const { genre, patterns } of GENRE_KEYWORDS) {
    for (const p of patterns) {
      if (haystack.includes(` ${p} `)) { found.add(genre); break; }
    }
  }
  return Array.from(found);
}

/** Pull genres straight off an item's own metadata. Series carry a real
 *  `genre` field ("Action, Crime, Drama") from the Xtream panel; movies
 *  often don't (the genre lives in the per-movie VodInfo response which
 *  we don't bulk-fetch). For both we also probe `name` as a last
 *  resort — many providers prefix titles like "[ACTION] Movie Name". */
function itemGenres(it: any): string[] {
  const out = new Set<string>();
  for (const g of detectGenresAll(it?.genre)) out.add(g);
  // Don't fall back to `name` — too many false positives ("The Comedy of
  // Errors" tagging a drama as comedy). Genre field only.
  return Array.from(out);
}

/** Extract a 4-digit year from various date formats (YYYY-MM-DD, YYYY,
 *  unix-timestamp-as-string for Xtream's `added`, etc.). Returns 0 if
 *  no plausible year can be found. */
function itemYear(it: any): number {
  // Series.releaseDate is "YYYY-MM-DD"
  const rel = String(it?.releaseDate ?? it?.release_date ?? "");
  const ym = rel.match(/(\d{4})/);
  if (ym) {
    const y = parseInt(ym[1], 10);
    if (y >= 1900 && y <= 2100) return y;
  }
  // VodStream.added is a unix epoch string ("1701420000"). That's the
  // date the provider added it to their library — a usable proxy for
  // "recent" content when no real release year exists.
  const added = Number(it?.added);
  if (isFinite(added) && added > 0) {
    const y = new Date(added * 1000).getUTCFullYear();
    if (y >= 1990 && y <= 2100) return y;
  }
  return 0;
}

/** Parse Xtream's rating string into a 0–10 number. Returns 0 if missing/invalid. */
function parseRating(r: unknown): number {
  if (r == null) return 0;
  const n = typeof r === "number" ? r : parseFloat(String(r));
  if (!isFinite(n) || n <= 0) return 0;
  // Some providers store 0–5, some 0–10. Anything ≤5 we double so they
  // sort sensibly against 0–10 entries in the same list.
  return n <= 5 ? n * 2 : n;
}

/**
 * Build a "Suggested for you" list of streams.
 *
 * @param type        "movies" or "series"
 * @param items       Full library list for this type (vodStreams or seriesList)
 * @param categories  Category list for this type (vodCategories or seriesCategories)
 * @param watched     The active profile's full watch history (all types — we filter)
 * @param limit       How many items to return (default 20)
 * @param countOnly   When true, skip the candidate sort (cheap path for
 *                    pill-button counts on large catalogues — the sort is
 *                    O(n log n) over potentially thousands of items).
 */
export function computeSuggestions<T extends SuggestionItem>(args: {
  type: SuggestableType;
  items: T[];
  categories: Category[];
  watched: RecentlyWatched[];
  limit?: number;
  countOnly?: boolean;
}): SuggestionResult<T> {
  const { type, items, categories, watched, limit = 20, countOnly = false } = args;

  // Map category_id → genre (skip categories with no detectable genre).
  const catGenre = new Map<string, string>();
  for (const c of categories) {
    const g = detectGenre(c.category_name);
    if (g) catGenre.set(String(c.category_id), g);
  }

  // Build an id → item lookup for fast watched→item resolution.
  const idKey = (it: T): string =>
    String((it as any).stream_id ?? (it as any).series_id ?? "");
  const itemById = new Map<string, T>();
  for (const it of items) itemById.set(idKey(it), it);

  // Resolve all genres for an item — prefer the item's own metadata
  // (Series.genre is reliable), fall back to its category name. This
  // catches the "Recently Added" case where a movie sits in a generic
  // "VOD - 2025 4K" category that has no genre keyword: the item's own
  // metadata still tells us what it is.
  const genresFor = (it: T): string[] => {
    const own = itemGenres(it);
    if (own.length > 0) return own;
    const fromCat = catGenre.get(String((it as any).category_id));
    return fromCat ? [fromCat] : [];
  };

  // Walk watch history filtered to this section, count genres + collect
  // already-watched ids + average release year (for year-proximity boost).
  const wantedContentType = type === "movies" ? "movie" : "series";
  const watchedIds = new Set<string>();
  const genreCount = new Map<string, number>();
  let yearSum = 0;
  let yearN = 0;
  for (const e of watched) {
    if (e.content_type !== wantedContentType) continue;
    const k = String(
      type === "movies" ? e.stream_id : (e.series_id ?? e.stream_id),
    );
    if (!k) continue;
    watchedIds.add(k);
    const it = itemById.get(k);
    if (!it) continue;
    for (const g of genresFor(it)) {
      genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
    }
    const y = itemYear(it);
    if (y > 0) { yearSum += y; yearN++; }
  }

  if (genreCount.size === 0) {
    return { items: [], topGenres: [], isEmpty: watchedIds.size === 0 };
  }

  // Top 3 genres by watch count.
  const topGenres = Array.from(genreCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g]) => g);
  const topGenreSet = new Set(topGenres);
  const avgYear = yearN > 0 ? yearSum / yearN : 0;

  // Collect candidates whose detected genre(s) overlap the top 3 and
  // that the user hasn't already watched. Track how many of the top
  // genres each candidate matches so multi-genre hits rank above
  // single-genre ones.
  const candidates: Array<{ it: T; genreHits: number }> = [];
  for (const it of items) {
    if (watchedIds.has(idKey(it))) continue;
    const gs = genresFor(it);
    let hits = 0;
    for (const g of gs) if (topGenreSet.has(g)) hits++;
    if (hits === 0) continue;
    candidates.push({ it, genreHits: hits });
  }

  // Cheap path: caller only needs the count for a pill badge — skip the
  // full sort. We still apply `limit` so the count never exceeds what the
  // list view will actually render.
  if (countOnly) {
    return {
      items: candidates.slice(0, limit).map((c) => c.it),
      topGenres,
      isEmpty: false,
    };
  }

  // Composite score: rating (primary) + small year-proximity boost
  // (items released near the user's average watched year get a bump,
  // capped at +1.5). Multi-genre hits get a +0.5 bump per extra match.
  // The end result: a Sci-Fi/Action 2024 movie outranks a Sci-Fi 1985
  // movie when the user's average watched year is ~2022, but a
  // 9.5-rated 2018 movie still beats a 6.5-rated 2024 one.
  const scoreFor = (c: { it: T; genreHits: number }): number => {
    const r = parseRating((c.it as any).rating ?? (c.it as any).rating_5based);
    let yearBoost = 0;
    if (avgYear > 0) {
      const y = itemYear(c.it);
      if (y > 0) {
        const diff = Math.abs(y - avgYear);
        // Full +1.5 at perfect match, decays to 0 at ~15 years apart.
        yearBoost = Math.max(0, 1.5 - diff / 10);
      }
    }
    const multiGenreBoost = (c.genreHits - 1) * 0.5;
    return r + yearBoost + multiGenreBoost;
  };

  candidates.sort((a, b) => {
    const sa = scoreFor(a);
    const sb = scoreFor(b);
    if (sb !== sa) return sb - sa;
    return String((a.it as any).name).localeCompare(String((b.it as any).name));
  });

  return {
    items: candidates.slice(0, limit).map((c) => c.it),
    topGenres,
    isEmpty: false,
  };
}
