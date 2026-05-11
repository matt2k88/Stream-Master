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

/** Detects a single genre keyword from a category name. Returns null if none match.
 *
 * Xtream providers use every imaginable separator — spaces, hyphens,
 * underscores, pipes, slashes, dots, colons, parens. We collapse all of
 * those into single spaces before searching so a lookup like "action"
 * matches "Action_2025", "VOD/Action", "Action.HD", "Action(EN)" etc.
 */
export function detectGenre(categoryName: string | undefined | null): string | null {
  if (!categoryName) return null;
  // Normalise separators → single spaces, pad both ends so word-boundary
  // checks at start/end work uniformly.
  const haystack = ` ${categoryName.toLowerCase().replace(/[_|\-/.,:()\[\]\\]+/g, " ").replace(/\s+/g, " ").trim()} `;
  for (const { genre, patterns } of GENRE_KEYWORDS) {
    for (const p of patterns) {
      if (haystack.includes(` ${p} `)) return genre;
    }
  }
  return null;
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

  // Walk watch history filtered to this section, count genres + collect
  // already-watched ids so we don't suggest them back.
  const wantedContentType = type === "movies" ? "movie" : "series";
  const watchedIds = new Set<string>();
  const genreCount = new Map<string, number>();
  for (const e of watched) {
    if (e.content_type !== wantedContentType) continue;
    const k = String(
      type === "movies" ? e.stream_id : (e.series_id ?? e.stream_id),
    );
    if (!k) continue;
    watchedIds.add(k);
    const it = itemById.get(k);
    if (!it) continue;
    const g = catGenre.get(String((it as any).category_id));
    if (!g) continue;
    genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
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

  // Collect candidates whose category genre is in the top 3 and that
  // the user hasn't already watched.
  const candidates: T[] = [];
  for (const it of items) {
    const cid = String((it as any).category_id);
    const g = catGenre.get(cid);
    if (!g || !topGenreSet.has(g)) continue;
    if (watchedIds.has(idKey(it))) continue;
    candidates.push(it);
  }

  // Cheap path: caller only needs the count for a pill badge — skip the
  // full sort. We still apply `limit` so the count never exceeds what the
  // list view will actually render.
  if (countOnly) {
    return {
      items: candidates.slice(0, limit),
      topGenres,
      isEmpty: false,
    };
  }

  // Sort by rating desc; ties broken by name for stable output.
  candidates.sort((a, b) => {
    const ra = parseRating((a as any).rating ?? (a as any).rating_5based);
    const rb = parseRating((b as any).rating ?? (b as any).rating_5based);
    if (rb !== ra) return rb - ra;
    return String((a as any).name).localeCompare(String((b as any).name));
  });

  return {
    items: candidates.slice(0, limit),
    topGenres,
    isEmpty: false,
  };
}
