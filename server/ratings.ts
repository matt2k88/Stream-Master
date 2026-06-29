import { supabase } from "./supabase";

// ── Cert → numeric age normalisation ─────────────────────────────────────────
// Maps raw certification strings (from any country) to a numeric age boundary.
// age_int is used for parental-control filtering in Task 2.
const CERT_AGE: Record<string, number> = {
  // BBFC (UK)
  U: 0, PG: 8, "12A": 12, "12": 12, "15": 15, "18": 18, R18: 18,
  // MPAA (US)
  G: 0, "PG-13": 13, R: 17, "NC-17": 18,
  // US TV ratings
  "TV-Y": 0, "TV-Y7": 7, "TV-G": 0, "TV-PG": 8, "TV-14": 14, "TV-MA": 18,
  // Common European numeric
  "0": 0, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
  "11": 11, "12+": 12, "14": 14, "16": 16, "16+": 16, "18+": 18,
  // Generic
  ALL: 0, E: 0, T: 13,
};

const NOT_RATED = new Set(["NR", "Not Rated", "Unrated", "UR", ""]);

function normalizeCert(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const c = raw.trim();
  if (NOT_RATED.has(c)) return null;
  if (CERT_AGE[c] !== undefined) return CERT_AGE[c];
  const up = c.toUpperCase();
  if (CERT_AGE[up] !== undefined) return CERT_AGE[up];
  const num = c.match(/^(\d{1,2})\+?$/);
  if (num) {
    const n = parseInt(num[1], 10);
    if (n <= 25) return n;
  }
  return null;
}

// Prefer GB cert, then US, then any other country with a known cert.
const PREF = ["GB", "US"];

function pickBestCert(
  entries: { iso_3166_1?: string; certification?: string }[]
): { certification: string; age_int: number } | null {
  for (const country of PREF) {
    const e = entries.find(
      (e) => e.iso_3166_1 === country && e.certification && !NOT_RATED.has(e.certification.trim())
    );
    if (e?.certification) {
      const age = normalizeCert(e.certification);
      if (age !== null) return { certification: e.certification.trim(), age_int: age };
    }
  }
  for (const e of entries) {
    if (e.certification && !NOT_RATED.has(e.certification.trim())) {
      const age = normalizeCert(e.certification);
      if (age !== null) return { certification: e.certification.trim(), age_int: age };
    }
  }
  return null;
}

// ── OMDb fetch helper ─────────────────────────────────────────────────────────
// Primary cert source for the stream enricher: 1 call per title, 100k/day limit.
// Returns null when key not configured, title not found, or rating is N/A.
const MIN_OMDB_GAP_MS = 60; // ~16 calls/sec → well within 100k/day
let lastOmdbCallAt = 0;

async function omdbFetch(
  title: string,
  year: string | null
): Promise<{ certification: string; age_int: number } | null> {
  const key = (process.env.OMDB_API_KEY ?? "").trim();
  if (!key) return null;

  const gap = MIN_OMDB_GAP_MS - (Date.now() - lastOmdbCallAt);
  if (gap > 0) await sleep(gap);
  lastOmdbCallAt = Date.now();

  try {
    const params = new URLSearchParams({ apikey: key, t: title, plot: "short" });
    if (year) params.set("y", year);
    const r = await fetch(`https://www.omdbapi.com/?${params}`);
    if (!r.ok) return null;
    const d = await r.json();
    if (d?.Response !== "True" || !d?.Rated) return null;
    const cert = d.Rated.trim();
    const age = normalizeCert(cert); // reuses existing MPAA + TV cert map
    if (age === null) return null;   // "N/A", "Not Rated", "NR", etc.
    return { certification: cert, age_int: age };
  } catch {
    return null;
  }
}

// ── TMDB rate-limit gate ──────────────────────────────────────────────────────
// Shared across BOTH enrichers so they can't race each other over the 40/10s cap.
// Node is single-threaded: the check+set is race-safe across coroutines.
const MIN_TMDB_GAP_MS = 300; // ~3 calls/sec → well under TMDB's 40/10s cap
let lastTmdbCallAt = 0;

// Thrown by tmdbFetch when 429 retries are exhausted — lets the enricher
// loop distinguish "rate limited right now" from "title not found".
class TmdbRateLimitError extends Error {
  constructor() { super("TMDB_RATE_LIMITED"); this.name = "TmdbRateLimitError"; }
}

// ── TMDB fetch helper ─────────────────────────────────────────────────────────
// Supports v3 API key (?api_key=) OR v4 Bearer token — whichever is available.
// Prefers TMDB_API_KEY (v3, short alphanumeric) over TMDB_READ_TOKEN (v4 JWT).
// Handles 429 explicitly: waits Retry-After (default 12s) then retries up to 3×.
async function tmdbFetch(path: string, retries = 3): Promise<any | null> {
  // Enforce minimum gap between any two TMDB calls (both enrichers share this)
  const gap = MIN_TMDB_GAP_MS - (Date.now() - lastTmdbCallAt);
  if (gap > 0) await sleep(gap);
  lastTmdbCallAt = Date.now();

  const v3Key   = (process.env.TMDB_API_KEY   ?? "").trim();
  const v4Token = (process.env.TMDB_READ_TOKEN ?? "").trim();
  if (!v3Key && !v4Token) return null;
  try {
    let url: string;
    const headers: Record<string, string> = { accept: "application/json" };
    if (v3Key) {
      const sep = path.includes("?") ? "&" : "?";
      url = `https://api.themoviedb.org/3${path}${sep}api_key=${v3Key}`;
    } else {
      url = `https://api.themoviedb.org/3${path}`;
      headers["Authorization"] = `Bearer ${v4Token}`;
    }
    const r = await fetch(url, { headers });
    if (r.status === 429) {
      if (retries <= 0) {
        // Signal to the caller that we're rate-limited — do NOT return null
        // (null means "title not found" and causes the item to be skipped forever).
        throw new TmdbRateLimitError();
      }
      const retryAfter = r.headers.get("retry-after");
      const waitMs = retryAfter
        ? Math.min(Math.max(parseInt(retryAfter, 10), 1) * 1000, 60_000)
        : 12_000;
      console.warn(`[ratings] TMDB 429 — waiting ${waitMs}ms (retry-after: ${retryAfter ?? "none"}, retries left: ${retries})`);
      await sleep(waitMs);
      return tmdbFetch(path, retries - 1);
    }
    if (!r.ok) return null;
    return r.json();
  } catch (e: any) {
    if (e instanceof TmdbRateLimitError) throw e; // must propagate — do not swallow
    return null;
  }
}

async function fetchMovieCert(tmdbId: number) {
  const data = await tmdbFetch(`/movie/${tmdbId}/release_dates`);
  if (!data?.results) return null;
  const entries: { iso_3166_1: string; certification: string }[] = [];
  for (const country of data.results) {
    for (const rel of country.release_dates ?? []) {
      if (rel.certification) entries.push({ iso_3166_1: country.iso_3166_1, certification: rel.certification });
    }
  }
  return pickBestCert(entries);
}

async function fetchTvCert(tmdbId: number) {
  const data = await tmdbFetch(`/tv/${tmdbId}/content_ratings`);
  if (!data?.results) return null;
  return pickBestCert(
    data.results.map((r: any) => ({ iso_3166_1: r.iso_3166_1, certification: r.rating }))
  );
}

// ── DB ops ────────────────────────────────────────────────────────────────────
export interface RatingResult {
  certification: string;
  age_int: number;
  source: string;
}

export async function getCachedRating(
  tmdbId: number,
  contentType: "movie" | "tv"
): Promise<RatingResult | null> {
  const { data } = await supabase
    .from("content_ratings")
    .select("certification, age_int, source")
    .eq("tmdb_id", tmdbId)
    .eq("content_type", contentType)
    .maybeSingle();
  return data ?? null;
}

async function storeRating(
  tmdbId: number,
  contentType: "movie" | "tv",
  cert: string,
  ageInt: number,
  source: string
): Promise<void> {
  await supabase.from("content_ratings").upsert(
    {
      tmdb_id: tmdbId,
      content_type: contentType,
      certification: cert,
      age_int: ageInt,
      source,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "content_type,tmdb_id" }
  );
}

// ── Public: get-or-fetch for a known TMDB ID (lazy path) ─────────────────────
// Called by the GET /api/content-ratings route when a user opens a movie/series.
// Returns immediately if cached; otherwise fetches TMDB cert, stores, returns.
export async function getOrFetchRating(
  tmdbId: number,
  contentType: "movie" | "tv",
  xtreamCert?: string | null
): Promise<RatingResult | null> {
  const cached = await getCachedRating(tmdbId, contentType);
  if (cached) return cached;

  // If the IPTV provider already supplied a cert, accept it without a TMDB call
  if (xtreamCert) {
    const age = normalizeCert(xtreamCert);
    if (age !== null) {
      await storeRating(tmdbId, contentType, xtreamCert.trim(), age, "xtream");
      return { certification: xtreamCert.trim(), age_int: age, source: "xtream" };
    }
  }

  // Fetch from TMDB certification endpoint
  const cert = contentType === "movie"
    ? await fetchMovieCert(tmdbId)
    : await fetchTvCert(tmdbId);

  if (cert) {
    await storeRating(tmdbId, contentType, cert.certification, cert.age_int, "tmdb");
    return { ...cert, source: "tmdb" };
  }
  return null;
}

// ── Bulk enrichment: name-based TMDB search (background job) ─────────────────
// Triggered once after DataContext sync. The server searches TMDB by title,
// looks up the cert, and stores it. Items already rated are skipped.
// Rate: ~300ms per item → stays within TMDB's 40 req/10s limit (2 calls/item).

interface QueueItem {
  id: string;
  name: string;
  year: string | null;
  type: "movie" | "tv";
}

const queuedKeys = new Set<string>();
let enrichQueue: QueueItem[] = [];
let enrichRunning = false;

export const enrichStats = {
  queued: 0,
  processed: 0,
  failed: 0,
  skipped: 0,
  running: false,
  startedAt: null as string | null,
  completedAt: null as string | null,
};

function parseName(raw: string): { name: string; year: string | null } {
  let s = raw.trim();

  // Strip IPTV provider prefixes: "UK | ", "US: ", "AR | ", "FR - " etc.
  // Matches 2-5 upper-case letters (or digits) followed by a separator and space.
  s = s.replace(/^[A-Z0-9]{2,5}\s*[\|:\-]\s+/g, "");

  // Strip bracketed quality/format tags: [HD], (FHD), (4K), [1080p] etc.
  s = s.replace(/\s*[\[\(]\s*(4K|FHD|HD|720p|1080p|2160p|UHD|SDR|HDR|HEVC|H\.?265|H\.?264|DV|DUBBED|SUBBED|ENG|MULTI)\s*[\]\)]/gi, "");

  // Strip pipe-separated quality tags at end: "Name | FHD", "Name |HD"
  s = s.replace(/\s*\|\s*(4K|FHD|HD|720p|1080p|2160p|UHD|SDR|HDR|HEVC|H\.?265|H\.?264|DV|DUBBED|SUBBED|ENG|MULTI)\s*$/gi, "");

  // Strip standalone quality tags at end of string (whole word only).
  s = s.replace(/\s+\b(4K|FHD|720p|1080p|2160p|UHD|SDR|HEVC|DUBBED|SUBBED|MULTI)\b\s*$/gi, "");

  // Strip trailing pipes and brackets left behind, collapse multiple spaces.
  s = s.replace(/\s*\|\s*$/, "").replace(/\s{2,}/g, " ").trim();

  // Extract trailing year.
  const m = s.match(/^(.+?)\s*[\[\(](\d{4})[\]\)]\s*$/);
  return m ? { name: m[1].trim(), year: m[2] } : { name: s, year: null };
}

export function startBulkEnrich(
  rawItems: { id: string; name: string; type: "movie" | "tv" }[]
): { queued: number; already_queued: number } {
  let added = 0;
  let already = 0;
  for (const raw of rawItems) {
    if (!raw.name?.trim()) continue;
    const key = `${raw.type}:${raw.name.toLowerCase().trim()}`;
    if (queuedKeys.has(key)) { already++; continue; }
    const { name, year } = parseName(raw.name);
    queuedKeys.add(key);
    enrichQueue.push({ id: raw.id, name, year, type: raw.type });
    added++;
  }
  enrichStats.queued += added;
  if (!enrichRunning && enrichQueue.length > 0) {
    runEnricher().catch((e) => console.error("[ratings] enricher error:", e?.message));
  }
  return { queued: added, already_queued: already };
}

// Per-item sleep for the bulk enricher.  tmdbFetch already enforces MIN_TMDB_GAP_MS
// between every individual TMDB call; this adds a small extra gap between items
// so DB calls don't pile up.
const INTERVAL_MS = 100;

async function runEnricher(): Promise<void> {
  if (enrichRunning) return;
  enrichRunning = true;
  enrichStats.running = true;
  enrichStats.startedAt = new Date().toISOString();
  enrichStats.completedAt = null;
  console.log(`[ratings] bulk enricher started — ${enrichQueue.length} items in queue`);

  while (enrichQueue.length > 0) {
    const item = enrichQueue.shift()!;
    try {
      await processItem(item);
    } catch (e: any) {
      console.warn(`[ratings] failed "${item.name}":`, e?.message);
      enrichStats.failed++;
    }
    await sleep(INTERVAL_MS);
  }

  enrichRunning = false;
  enrichStats.running = false;
  enrichStats.completedAt = new Date().toISOString();
  console.log(
    `[ratings] bulk enricher done — processed: ${enrichStats.processed}, ` +
    `skipped: ${enrichStats.skipped}, failed: ${enrichStats.failed}`
  );
}

async function processItem(item: QueueItem): Promise<void> {
  const q = encodeURIComponent(item.name);
  const yearParam = item.year
    ? item.type === "movie"
      ? `&primary_release_year=${item.year}`
      : `&first_air_date_year=${item.year}`
    : "";
  const path = item.type === "movie"
    ? `/search/movie?query=${q}${yearParam}&include_adult=false`
    : `/search/tv?query=${q}${yearParam}&include_adult=false`;

  const searchData = await tmdbFetch(path);
  const top = searchData?.results?.[0];
  if (!top?.id) { enrichStats.skipped++; return; }

  const tmdbId = Number(top.id);
  const existing = await getCachedRating(tmdbId, item.type);
  if (existing) { enrichStats.skipped++; return; }

  const cert = item.type === "movie"
    ? await fetchMovieCert(tmdbId)
    : await fetchTvCert(tmdbId);

  if (cert) {
    await storeRating(tmdbId, item.type, cert.certification, cert.age_int, "tmdb_search");
    enrichStats.processed++;
  } else {
    enrichStats.skipped++;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Server-side stream enricher ───────────────────────────────────────────────
// Client sends the full library names once after sync.  The server processes
// them here at 250ms/item using TMDB name search, storing certs in
// stream_ratings keyed by stream_id.  Client never needs to batch getVodInfo.

interface StreamEnrichItem {
  stream_id: number;
  type: "movie" | "tv";
  name: string;
  year: string | null;
}

const streamEnrichQueue: StreamEnrichItem[] = [];
const streamQueuedKeys = new Set<string>();
let streamEnrichRunning = false;

export const streamEnrichStats = {
  queued: 0,
  processed: 0,
  already_rated: 0,  // already had a DB entry — instant skip
  no_match: 0,       // neither OMDb nor TMDB could identify the title
  failed: 0,
  running: false,
  paused: false,
  pausedUntil: 0,
};
export function streamEnrichQueueLength(): number { return streamEnrichQueue.length; }

export function startStreamEnrich(
  items: { stream_id: number; type: "movie" | "tv"; name: string; year?: string | null }[]
): { queued: number; already_queued: number } {
  let added = 0, already = 0;
  for (const item of items) {
    const key = `${item.type}:${item.stream_id}`;
    if (streamQueuedKeys.has(key)) { already++; continue; }
    streamQueuedKeys.add(key);
    const { name, year } = parseName(item.name);
    streamEnrichQueue.push({ stream_id: item.stream_id, type: item.type, name, year: item.year ?? year });
    added++;
  }
  streamEnrichStats.queued += added;
  if (!streamEnrichRunning && streamEnrichQueue.length > 0) {
    runStreamEnricher();
  }
  return { queued: added, already_queued: already };
}

async function runStreamEnricher(): Promise<void> {
  if (streamEnrichRunning) return;
  streamEnrichRunning = true;
  streamEnrichStats.running = true;
  console.log(`[stream-enrich] starting — ${streamEnrichQueue.length} items`);

  // Preload all already-rated stream_ids into memory so we avoid one Supabase
  // round-trip per item (~250ms each) and can do the skip check in O(1).
  const ratedSet = new Set<string>();
  try {
    const [movies, tv] = await Promise.all([
      fetchAllStreamRatings("movie"),
      fetchAllStreamRatings("tv"),
    ]);
    for (const r of movies) ratedSet.add(`movie:${r.stream_id}`);
    for (const r of tv)    ratedSet.add(`tv:${r.stream_id}`);
    console.log(`[stream-enrich] preloaded ${ratedSet.size} already-rated entries`);
  } catch (e: any) {
    console.warn("[stream-enrich] preload warning — falling back to per-item lookup:", e?.message);
  }

  // PAUSE_MS: how long to back off when TMDB sustains rate-limiting us.
  // After tmdbFetch exhausts its own per-request retries (3×, each waiting
  // Retry-After), a global pause gives the quota window time to reset.
  const RATE_LIMIT_PAUSE_MS = 60_000;
  // How many consecutive rate-limit exhaustions before we trigger a global pause.
  const CONSECUTIVE_LIMIT = 2;

  let logEvery = 0;
  let consecutiveRateLimits = 0;

  while (streamEnrichQueue.length > 0) {
    const item = streamEnrichQueue.shift()!;
    const rkey = `${item.type}:${item.stream_id}`;
    try {
      if (ratedSet.has(rkey)) { streamEnrichStats.already_rated++; consecutiveRateLimits = 0; continue; }

      // ── Step 1: OMDb (primary) ────────────────────────────────────────────
      // 1 call per item, 100k/day — fast and generous.
      let cert: { certification: string; age_int: number } | null =
        await omdbFetch(item.name, item.year ?? null);
      let source = "omdb";

      // ── Step 2: TMDB fallback (when OMDb misses or key not set) ──────────
      if (!cert) {
        source = "tmdb_search";
        const q = encodeURIComponent(item.name);
        const yearMovie = item.year ? `&primary_release_year=${item.year}` : "";
        const yearTv    = item.year ? `&first_air_date_year=${item.year}` : "";

        let top: any = null;
        let resolvedType: "movie" | "tv" = item.type;

        if (item.type === "movie") {
          const d = await tmdbFetch(`/search/movie?query=${q}${yearMovie}&include_adult=false`);
          top = d?.results?.[0];
          if (!top?.id) {
            const d2 = await tmdbFetch(`/search/tv?query=${q}${yearTv}&include_adult=false`);
            top = d2?.results?.[0];
            if (top?.id) resolvedType = "tv";
          }
        } else {
          const d = await tmdbFetch(`/search/tv?query=${q}${yearTv}&include_adult=false`);
          top = d?.results?.[0];
          if (!top?.id) {
            const d2 = await tmdbFetch(`/search/movie?query=${q}${yearMovie}&include_adult=false`);
            top = d2?.results?.[0];
            if (top?.id) resolvedType = "movie";
          }
        }

        if (top?.id) {
          const tmdbId = Number(top.id);
          cert = resolvedType === "movie"
            ? await fetchMovieCert(tmdbId)
            : await fetchTvCert(tmdbId);
          if (cert) {
            // Also cache in the tmdb_ratings table for future cross-stream reuse.
            await storeRating(tmdbId, item.type, cert.certification, cert.age_int, "tmdb_search");
            await storeStreamRating(item.stream_id, item.type, cert.certification, cert.age_int, "tmdb_search", tmdbId);
          }
        }
      }

      if (cert && source === "omdb") {
        await storeStreamRating(item.stream_id, item.type, cert.certification, cert.age_int, "omdb");
      }

      if (cert) {
        ratedSet.add(rkey);
        streamEnrichStats.processed++;
        consecutiveRateLimits = 0;
        if (++logEvery % 10 === 1) {
          console.log(`[stream-enrich] ✓ ${item.name} → ${cert.certification} (age ${cert.age_int}) [${source}] [total ${streamEnrichStats.processed}, remaining ${streamEnrichQueue.length}]`);
        }
      } else {
        streamEnrichStats.no_match++;
        consecutiveRateLimits = 0;
      }
    } catch (e: any) {
      if (e instanceof TmdbRateLimitError) {
        // Push item back to front so it's retried after the pause, not lost.
        streamEnrichQueue.unshift(item);
        consecutiveRateLimits++;

        if (consecutiveRateLimits >= CONSECUTIVE_LIMIT) {
          // Sustained rate limit — back off globally before continuing.
          const pauseUntil = Date.now() + RATE_LIMIT_PAUSE_MS;
          streamEnrichStats.paused = true;
          streamEnrichStats.pausedUntil = pauseUntil;
          console.warn(
            `[stream-enrich] sustained rate limit (${consecutiveRateLimits} consecutive) — pausing ${RATE_LIMIT_PAUSE_MS / 1000}s. ` +
            `Queue: ${streamEnrichQueue.length} remaining.`
          );
          await sleep(RATE_LIMIT_PAUSE_MS);
          streamEnrichStats.paused = false;
          streamEnrichStats.pausedUntil = 0;
          consecutiveRateLimits = 0;
          console.log(`[stream-enrich] resuming after rate-limit pause`);
        } else {
          // First/second consecutive — tmdbFetch already waited Retry-After;
          // a short extra gap before retrying the same item.
          await sleep(5_000);
        }
      } else {
        // Genuine error (network, parse, etc.) — skip this item and move on.
        streamEnrichStats.failed++;
        consecutiveRateLimits = 0;
        console.warn(`[stream-enrich] stream_id ${item.stream_id}:`, e?.message);
      }
    }
    // No explicit sleep between items — tmdbFetch enforces MIN_TMDB_GAP_MS.
  }

  streamEnrichRunning = false;
  streamEnrichStats.running = false;
  streamEnrichStats.paused = false;
  streamEnrichStats.pausedUntil = 0;
  console.log(`[stream-enrich] done — processed: ${streamEnrichStats.processed}, already_rated: ${streamEnrichStats.already_rated}, no_match: ${streamEnrichStats.no_match}, failed: ${streamEnrichStats.failed}`);
}

// ── Stream-ratings (keyed by stream_id + content_type) ────────────────────────
// Powers parental controls. Client enricher sends batches; we resolve certs and
// store so DataContext can build a Map<stream_id, {certification, age_int}>.

export interface StreamBatchItem {
  stream_id: number;
  content_type: "movie" | "tv";
  tmdb_id?: number | null;
  mpaa_rating?: string | null;
  name?: string | null;
  year?: string | null;
}

export interface StreamBatchResult {
  stream_id: number;
  certification: string;
  age_int: number;
}

async function getStreamRating(
  streamId: number,
  contentType: "movie" | "tv"
): Promise<{ certification: string; age_int: number } | null> {
  const { data } = await supabase
    .from("stream_ratings")
    .select("certification, age_int")
    .eq("stream_id", streamId)
    .eq("content_type", contentType)
    .maybeSingle();
  return data ?? null;
}

async function storeStreamRating(
  streamId: number,
  contentType: "movie" | "tv",
  cert: string,
  ageInt: number,
  source: string,
  tmdbId?: number | null
): Promise<void> {
  await supabase.from("stream_ratings").upsert(
    {
      stream_id: streamId,
      content_type: contentType,
      certification: cert,
      age_int: ageInt,
      source,
      ...(tmdbId ? { tmdb_id: tmdbId } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stream_id,content_type" }
  );
}

export async function fetchAllStreamRatings(
  contentType: "movie" | "tv"
): Promise<{ stream_id: number; certification: string; age_int: number }[]> {
  // Supabase default page size is 1000. Paginate to get all rows.
  const PAGE = 1000;
  const all: { stream_id: number; certification: string; age_int: number }[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("stream_ratings")
      .select("stream_id, certification, age_int")
      .eq("content_type", contentType)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function processStreamBatch(
  items: StreamBatchItem[]
): Promise<StreamBatchResult[]> {
  const results: StreamBatchResult[] = [];
  for (const item of items) {
    try {
      const r = await processOneStreamItem(item);
      if (r) results.push({ stream_id: item.stream_id, ...r });
    } catch (e: any) {
      console.warn(`[stream-ratings] stream_id ${item.stream_id}:`, e?.message);
    }
  }
  return results;
}

async function processOneStreamItem(
  item: StreamBatchItem
): Promise<{ certification: string; age_int: number } | null> {
  const { stream_id, content_type, tmdb_id, mpaa_rating, name, year } = item;

  const existing = await getStreamRating(stream_id, content_type);
  if (existing) return existing;

  // Xtream-provided rating — no TMDB call needed
  if (mpaa_rating) {
    const age = normalizeCert(mpaa_rating);
    if (age !== null) {
      await storeStreamRating(stream_id, content_type, mpaa_rating.trim(), age, "xtream", tmdb_id ?? null);
      return { certification: mpaa_rating.trim(), age_int: age };
    }
  }

  // Exact TMDB ID → one cert lookup
  if (tmdb_id) {
    const cached = await getCachedRating(tmdb_id, content_type);
    if (cached) {
      await storeStreamRating(stream_id, content_type, cached.certification, cached.age_int, "tmdb_cache", tmdb_id);
      return { certification: cached.certification, age_int: cached.age_int };
    }
    const cert = content_type === "movie"
      ? await fetchMovieCert(tmdb_id)
      : await fetchTvCert(tmdb_id);
    if (cert) {
      await storeRating(tmdb_id, content_type, cert.certification, cert.age_int, "tmdb");
      await storeStreamRating(stream_id, content_type, cert.certification, cert.age_int, "tmdb", tmdb_id);
      return cert;
    }
  }

  // Name search — offloaded to background so batch response stays fast
  if (name?.trim()) {
    setImmediate(() => {
      nameSearchStreamEnrich({
        stream_id,
        content_type,
        name: name.trim(),
        year: year ?? null,
      }).catch(() => {});
    });
  }

  return null;
}

// ── vod_ratings enricher ──────────────────────────────────────────────────────
// Reads rows from the vod_ratings table (status='pending'), looks up the cert
// via OMDb (primary) then TMDB (fallback), writes results back to vod_ratings,
// and also syncs into stream_ratings so the existing client code still works.

interface VodRatingRow {
  id: string;
  stream_id: string;
  content_type: string; // "movie" | "series"
  name: string;
  status: string;
}

export const vodEnrichStats = {
  processed: 0,
  not_found: 0,
  failed: 0,
  running: false,
};

let vodEnrichRunning = false;

// Extracts a clean title + year from raw IPTV names.
// Handles: "Title (2020)", "Title [2020]", "Title - 2020", "UK | Title HD"
function parseVodName(raw: string): { name: string; year: string | null } {
  let s = raw.trim();

  // Strip IPTV country/quality prefixes: "UK | ", "US: ", "AR | " etc.
  s = s.replace(/^[A-Z0-9]{2,5}\s*[\|:\-]\s+/g, "");

  // Strip bracketed quality tags: [HD], (FHD), [1080p], (4K) etc.
  s = s.replace(/\s*[\[\(]\s*(4K|FHD|HD|720p|1080p|2160p|UHD|SDR|HDR|HEVC|H\.?265|H\.?264|DV|DUBBED|SUBBED|ENG|MULTI)\s*[\]\)]/gi, "");

  // Strip standalone quality/lang tags at end.
  s = s.replace(/\s+\b(4K|FHD|720p|1080p|2160p|UHD|SDR|HEVC|DUBBED|SUBBED|MULTI|HD)\b\s*$/gi, "");

  // Strip trailing pipes left behind.
  s = s.replace(/\s*\|\s*$/, "").replace(/\s{2,}/g, " ").trim();

  // Extract year from "(2020)" or "[2020]" at end.
  let m = s.match(/^(.+?)\s*[\[\(](\d{4})[\]\)]\s*$/);
  if (m) return { name: m[1].trim(), year: m[2] };

  // Extract year from " - 2020" at end (common in vod_ratings name column).
  m = s.match(/^(.+?)\s*-\s*(\d{4})\s*$/);
  if (m) return { name: m[1].trim(), year: m[2] };

  return { name: s, year: null };
}

// Update a vod_ratings row and optionally sync into stream_ratings.
async function updateVodRatingRow(
  id: string,
  streamId: string,
  contentType: string,
  patch: Record<string, any>
): Promise<void> {
  await supabase
    .from("vod_ratings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);

  // Sync a successful rating into stream_ratings so the app's parental
  // controls work without any client-side changes.
  if (patch.status === "rated" && patch.rated && patch.min_age !== null) {
    const streamIdNum = parseInt(streamId, 10);
    const srType: "movie" | "tv" = contentType === "series" ? "tv" : "movie";
    if (!isNaN(streamIdNum)) {
      await storeStreamRating(
        streamIdNum,
        srType,
        patch.rated,
        patch.min_age,
        "vod_ratings"
      );
    }
  }
}

export async function startVodEnricher(): Promise<{ ok: boolean; message: string }> {
  if (vodEnrichRunning) return { ok: false, message: "Already running" };
  vodEnrichRunning = true;
  vodEnrichStats.running = true;
  vodEnrichStats.processed = 0;
  vodEnrichStats.not_found = 0;
  vodEnrichStats.failed = 0;

  runVodEnricher().catch((e) => {
    console.error("[vod-enrich] fatal error:", e?.message);
    vodEnrichRunning = false;
    vodEnrichStats.running = false;
  });

  return { ok: true, message: "VOD enricher started" };
}

async function runVodEnricher(): Promise<void> {
  const BATCH = 50;
  let totalProcessed = 0;
  console.log("[vod-enrich] starting — reading pending rows from vod_ratings");

  while (true) {
    // Fetch next batch of pending rows.
    const { data: rows, error } = await supabase
      .from("vod_ratings")
      .select("id, stream_id, content_type, name, status")
      .eq("status", "pending")
      .limit(BATCH);

    if (error) {
      console.error("[vod-enrich] DB fetch error:", error.message);
      break;
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows as VodRatingRow[]) {
      try {
        const { name: cleanName, year } = parseVodName(row.name);
        if (!cleanName) {
          await updateVodRatingRow(row.id, row.stream_id, row.content_type, {
            status: "not_found",
          });
          vodEnrichStats.not_found++;
          continue;
        }

        // ── Step 1: OMDb (primary) ──────────────────────────────────────────
        const omdbKey = (process.env.OMDB_API_KEY ?? "").trim();
        let cert: { certification: string; age_int: number } | null = null;
        let omdbTitle: string | null = null;
        let matchedYear: string | null = year;

        if (omdbKey) {
          const gap = MIN_OMDB_GAP_MS - (Date.now() - lastOmdbCallAt);
          if (gap > 0) await sleep(gap);
          lastOmdbCallAt = Date.now();

          const params = new URLSearchParams({ apikey: omdbKey, t: cleanName, plot: "short" });
          if (year) params.set("y", year);
          try {
            const r = await fetch(`https://www.omdbapi.com/?${params}`);
            if (r.ok) {
              const d = await r.json();
              if (d?.Response === "True" && d?.Rated) {
                const age = normalizeCert(d.Rated.trim());
                if (age !== null) {
                  cert = { certification: d.Rated.trim(), age_int: age };
                  omdbTitle = d.Title ?? null;
                  matchedYear = d.Year ?? year;
                }
              }
            }
          } catch { /* network error — fall through to TMDB */ }
        }

        // ── Step 2: TMDB fallback ───────────────────────────────────────────
        if (!cert) {
          const srType: "movie" | "tv" = row.content_type === "series" ? "tv" : "movie";
          const q = encodeURIComponent(cleanName);
          const yearParam = year
            ? srType === "movie" ? `&primary_release_year=${year}` : `&first_air_date_year=${year}`
            : "";
          try {
            const d = await tmdbFetch(
              srType === "movie"
                ? `/search/movie?query=${q}${yearParam}&include_adult=false`
                : `/search/tv?query=${q}${yearParam}&include_adult=false`
            );
            const top = d?.results?.[0];
            if (top?.id) {
              const tmdbId = Number(top.id);
              cert = srType === "movie"
                ? await fetchMovieCert(tmdbId)
                : await fetchTvCert(tmdbId);
              if (cert) {
                await storeRating(tmdbId, srType, cert.certification, cert.age_int, "tmdb_search");
              }
            }
          } catch (e: any) {
            if (e instanceof TmdbRateLimitError) {
              // Back off 30s and retry this row.
              console.warn("[vod-enrich] TMDB rate limit — pausing 30s");
              await sleep(30_000);
            }
          }
        }

        if (cert) {
          await updateVodRatingRow(row.id, row.stream_id, row.content_type, {
            status: "rated",
            rated: cert.certification,
            age_certification: cert.certification,
            min_age: cert.age_int,
            omdb_title: omdbTitle,
            year: matchedYear,
          });
          vodEnrichStats.processed++;
          totalProcessed++;
          if (totalProcessed % 50 === 1) {
            console.log(
              `[vod-enrich] ✓ ${cleanName} → ${cert.certification} (age ${cert.age_int}) | processed: ${totalProcessed}`
            );
          }
        } else {
          await updateVodRatingRow(row.id, row.stream_id, row.content_type, {
            status: "not_found",
          });
          vodEnrichStats.not_found++;
        }
      } catch (e: any) {
        console.warn(`[vod-enrich] error on row ${row.id}:`, e?.message);
        await supabase
          .from("vod_ratings")
          .update({ status: "error", error: e?.message ?? "unknown", updated_at: new Date().toISOString() })
          .eq("id", row.id);
        vodEnrichStats.failed++;
      }
    }
  }

  vodEnrichRunning = false;
  vodEnrichStats.running = false;
  console.log(
    `[vod-enrich] done — processed: ${vodEnrichStats.processed}, not_found: ${vodEnrichStats.not_found}, failed: ${vodEnrichStats.failed}`
  );
}

async function nameSearchStreamEnrich(item: {
  stream_id: number;
  content_type: "movie" | "tv";
  name: string;
  year: string | null;
}): Promise<void> {
  const { stream_id, content_type, name, year } = item;
  const q = encodeURIComponent(name);
  const yearParam = year
    ? content_type === "movie"
      ? `&primary_release_year=${year}`
      : `&first_air_date_year=${year}`
    : "";
  const path =
    content_type === "movie"
      ? `/search/movie?query=${q}${yearParam}&include_adult=false`
      : `/search/tv?query=${q}${yearParam}&include_adult=false`;

  const searchData = await tmdbFetch(path);
  const top = searchData?.results?.[0];
  if (!top?.id) return;

  const tmdbId = Number(top.id);
  const existing = await getStreamRating(stream_id, content_type);
  if (existing) return;

  const cert =
    content_type === "movie"
      ? await fetchMovieCert(tmdbId)
      : await fetchTvCert(tmdbId);
  if (cert) {
    await storeRating(tmdbId, content_type, cert.certification, cert.age_int, "tmdb_search");
    await storeStreamRating(stream_id, content_type, cert.certification, cert.age_int, "tmdb_search", tmdbId);
    enrichStats.processed++;
  }
}
