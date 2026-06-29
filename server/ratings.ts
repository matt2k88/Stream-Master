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

// ── TMDB fetch helper ─────────────────────────────────────────────────────────
async function tmdbFetch(path: string): Promise<any | null> {
  const token = process.env.TMDB_READ_TOKEN;
  if (!token) return null;
  try {
    const r = await fetch(`https://api.themoviedb.org/3${path}`, {
      headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
    });
    if (!r.ok) return null;
    return r.json();
  } catch {
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
  const m = raw.match(/^(.+?)\s*\((\d{4})\)\s*$/);
  return m ? { name: m[1].trim(), year: m[2] } : { name: raw.trim(), year: null };
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

// 300ms between items: 2 TMDB calls per item = ~6.6 calls/second, safely
// under TMDB's 40 req/10s cap.
const INTERVAL_MS = 300;

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
  const { data } = await supabase
    .from("stream_ratings")
    .select("stream_id, certification, age_int")
    .eq("content_type", contentType);
  return data ?? [];
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
