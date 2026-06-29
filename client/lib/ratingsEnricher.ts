/**
 * One-time background enrichment: resolves age certificates for every movie and
 * series in the user's IPTV library and stores them in the server's
 * stream_ratings table (keyed by stream_id) ready for parental controls.
 *
 * Strategy
 * ─────────
 * 1. For each VodStream, check undocumented extra fields (tmdb_id / mpaa_rating)
 *    that some providers include in the stream list — no API call needed.
 * 2. For streams without those fields, call getVodInfo() in batches of 5
 *    concurrently to obtain the exact TMDB ID and/or mpaa_rating.
 * 3. For series, check embedded fields then fall back to server-side name search.
 * 4. Push batches of enriched items to POST /api/stream-ratings/batch.
 *    The server fetches the cert from TMDB (or normalises the mpaa_rating) and
 *    stores it in stream_ratings.  It returns the cert so the client can update
 *    the local map immediately without waiting for the next sync.
 * 5. An AsyncStorage watermark means the enricher resumes where it left off if
 *    the app is restarted before it finishes.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { xtreamApi, VodStream, Series } from "@/lib/xtream-api";

export interface StreamRating {
  certification: string;
  age_int: number;
}

export interface EnrichProgress {
  total: number;
  done: number;
  running: boolean;
}

interface BatchItem {
  stream_id: number;
  content_type: "movie" | "tv";
  tmdb_id?: number | null;
  mpaa_rating?: string | null;
  name: string;
  year?: string | null;
}

interface BatchResult {
  stream_id: number;
  certification: string;
  age_int: number;
}

const MOVIE_WM_KEY = "ratings_enricher_v3_movie_wm";
const SERIES_WM_KEY = "ratings_enricher_v3_series_wm";
const VOD_BATCH = 5;     // concurrent getVodInfo calls
const SERIES_BATCH = 50; // series embedded-check only — no heavy API calls
const FLUSH_EVERY = 25;  // push to server every N items
const DELAY_MS = 150;    // pause between getVodInfo batches

// ── helpers ───────────────────────────────────────────────────────────────────

function toNum(v: unknown): number | null {
  if (v == null || v === "" || v === "0" || v === 0) return null;
  const n = Number(v);
  return isNaN(n) || n <= 0 ? null : n;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s && s !== "0" ? s : null;
}

function parseName(raw: string): { name: string; year: string | null } {
  const m = raw.match(/^(.+?)\s*\((\d{4})\)\s*$/);
  return m ? { name: m[1].trim(), year: m[2] } : { name: raw.trim(), year: null };
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function pushBatch(
  items: BatchItem[],
  apiBase: string,
  signal: AbortSignal
): Promise<BatchResult[]> {
  if (items.length === 0 || signal.aborted) return [];
  try {
    const url = new URL("/api/stream-ratings/batch", apiBase).toString();
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
      signal,
    });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

// ── main export ───────────────────────────────────────────────────────────────

export async function runRatingsEnricher(
  vodStreams: VodStream[],
  seriesList: Series[],
  apiBase: string,
  onProgress: (p: EnrichProgress) => void,
  onRatingsUpdate: (ratings: Map<number, StreamRating>) => void,
  signal: AbortSignal
): Promise<void> {
  const total = vodStreams.length + seriesList.length;
  let done = 0;

  const report = (running: boolean) =>
    onProgress({ total, done, running });

  const applyResults = (results: BatchResult[]) => {
    const map = new Map<number, StreamRating>();
    for (const r of results) {
      if (r.certification)
        map.set(r.stream_id, {
          certification: r.certification,
          age_int: r.age_int,
        });
    }
    if (map.size > 0) onRatingsUpdate(map);
  };

  report(true);

  // ── Phase 1: Movies ────────────────────────────────────────────────────────
  const movieWmStr = await AsyncStorage.getItem(MOVIE_WM_KEY);
  const movieStart = movieWmStr
    ? Math.min(parseInt(movieWmStr, 10), vodStreams.length)
    : 0;
  done = movieStart;
  report(true);

  let buf: BatchItem[] = [];

  const flush = async () => {
    if (buf.length === 0) return;
    const results = await pushBatch(buf, apiBase, signal);
    applyResults(results);
    buf = [];
  };

  for (let i = movieStart; i < vodStreams.length; i += VOD_BATCH) {
    if (signal.aborted) break;

    const batch = vodStreams.slice(i, i + VOD_BATCH);
    const hasEmbedded: BatchItem[] = [];
    const needVodInfo: VodStream[] = [];

    for (const s of batch) {
      const a = s as any;
      const tmdbId = toNum(a.tmdb_id ?? a.tmdb);
      const mpaa = str(a.mpaa_rating ?? a.age);
      if (tmdbId || mpaa) {
        const { name, year } = parseName(s.name);
        hasEmbedded.push({
          stream_id: s.stream_id,
          content_type: "movie",
          tmdb_id: tmdbId,
          mpaa_rating: mpaa,
          name,
          year,
        });
      } else {
        needVodInfo.push(s);
      }
    }

    buf.push(...hasEmbedded);

    // Concurrent getVodInfo for streams without embedded fields
    if (needVodInfo.length > 0 && !signal.aborted) {
      const results = await Promise.allSettled(
        needVodInfo.map((s) => xtreamApi.getVodInfo(s.stream_id))
      );
      for (let j = 0; j < needVodInfo.length; j++) {
        const r = results[j];
        const s = needVodInfo[j];
        const { name, year } = parseName(s.name);
        let tmdbId: number | null = null;
        let mpaa: string | null = null;
        if (r.status === "fulfilled" && r.value.info) {
          const inf = r.value.info;
          tmdbId = toNum(inf.tmdb_id);
          mpaa = str(inf.mpaa_rating ?? inf.age);
        }
        // Always push — server can fall back to TMDB name search if no tmdb_id
        buf.push({
          stream_id: s.stream_id,
          content_type: "movie",
          tmdb_id: tmdbId,
          mpaa_rating: mpaa,
          name,
          year,
        });
      }
    }

    done += batch.length;
    report(true);

    if (buf.length >= FLUSH_EVERY) await flush();

    try {
      await AsyncStorage.setItem(MOVIE_WM_KEY, String(i + VOD_BATCH));
    } catch {}

    if (!signal.aborted) await sleep(DELAY_MS);
  }

  await flush();
  try { await AsyncStorage.removeItem(MOVIE_WM_KEY); } catch {}

  // ── Phase 2: Series ────────────────────────────────────────────────────────
  const seriesWmStr = await AsyncStorage.getItem(SERIES_WM_KEY);
  const seriesStart = seriesWmStr
    ? Math.min(parseInt(seriesWmStr, 10), seriesList.length)
    : 0;

  for (let i = seriesStart; i < seriesList.length; i += SERIES_BATCH) {
    if (signal.aborted) break;

    const batch = seriesList.slice(i, i + SERIES_BATCH);
    for (const s of batch) {
      const a = s as any;
      const tmdbId = toNum(a.tmdb_id ?? a.tmdb);
      const mpaa = str(a.mpaa_rating ?? a.age);
      const { name, year } = parseName(s.name);
      buf.push({
        stream_id: s.series_id,
        content_type: "tv",
        tmdb_id: tmdbId,
        mpaa_rating: mpaa,
        name,
        year,
      });
    }

    done += batch.length;
    report(true);

    if (buf.length >= FLUSH_EVERY) await flush();

    try {
      await AsyncStorage.setItem(SERIES_WM_KEY, String(i + SERIES_BATCH));
    } catch {}

    if (!signal.aborted) await sleep(DELAY_MS);
  }

  await flush();
  try { await AsyncStorage.removeItem(SERIES_WM_KEY); } catch {}

  report(false);
}
