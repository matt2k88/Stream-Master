import type { Express, Request, Response } from "express";
import { spawn } from "child_process";
import { Readable } from "node:stream";
import { writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { supabase } from "./supabase";

// ─── YouTube cookies (anti-bot bypass for Cloud Run) ────────────────────
// YouTube blocks datacenter IPs (Cloud Run, AWS, GCP) with a "Sign in to
// confirm you're not a bot" wall. Cookies from a logged-in browser session
// bypass it. User stores a Netscape-format cookies.txt as the YT_COOKIES_TXT
// secret; we write it to /tmp at startup and pass to yt-dlp / ytdl-core.

let COOKIES_FILE: string | null = null;
function initCookies() {
  const raw = process.env.YT_COOKIES_TXT;
  if (!raw || raw.trim().length === 0) {
    console.log("[music/cookies] no YT_COOKIES_TXT set — extractors will run unauthenticated");
    return;
  }
  try {
    const path = join(tmpdir(), "yt-cookies.txt");
    writeFileSync(path, raw, { mode: 0o600 });
    COOKIES_FILE = path;
    const parsedCount = parseCookiesTxtToHeader(raw).split(";").filter(Boolean).length;
    console.log(
      "[music/cookies] wrote cookies to",
      path,
      `(${raw.length} bytes, ${parsedCount} youtube cookies parsed)`,
    );
    if (parsedCount === 0) {
      console.warn(
        "[music/cookies] WARNING: 0 youtube.com cookies parsed — secret may be malformed or for the wrong domain",
      );
    }
  } catch (e: any) {
    console.warn("[music/cookies] failed to write cookies file:", e?.message);
  }
}
initCookies();

function parseCookiesTxtToHeader(txt: string): string {
  // Netscape cookies.txt → "name=value; name2=value2" for the youtube.com domain.
  // Lines starting with "#HttpOnly_" are valid cookie records (not comments) —
  // strip the prefix and parse normally. True comments (other "#" lines) are skipped.
  const pairs: string[] = [];
  for (const rawLine of txt.split(/\r?\n/)) {
    if (!rawLine) continue;
    let line = rawLine;
    if (line.startsWith("#HttpOnly_")) {
      line = line.slice("#HttpOnly_".length);
    } else if (line.startsWith("#")) {
      continue;
    }
    const parts = line.split("\t");
    if (parts.length < 7) continue;
    const domain = parts[0];
    if (!domain.includes("youtube.com")) continue;
    const name = parts[5];
    const value = parts[6];
    if (name && value) pairs.push(`${name}=${value}`);
  }
  return pairs.join("; ");
}

// ─── yt-dlp audio stream extractor ─────────────────────────────────────
// Resolves a YouTube videoId to a direct CDN audio URL. This bypasses
// the IFrame embed restrictions entirely (errors 150/152/153), which
// is why we can play Vevo/Topic uploads that the WebView refused.
// Direct URLs from googlevideo.com expire after ~6h, so cache for 5h.

const streamCache = new Map<string, { url: string; expiresAt: number }>();
const STREAM_TTL_MS = 5 * 60 * 60 * 1000;

// Try yt-dlp first (works on dev where the python binary is present). Returns
// null + logs the reason if the binary is missing / fails. The audio-proxy
// route falls back to a pure-JS extractor when this returns null.
function extractAudioUrlYtDlp(videoId: string): Promise<string | null> {
  return new Promise((resolve) => {
    const args = [
      "-f", "bestaudio[ext=m4a]/bestaudio",
      "-g",
      "--no-warnings",
      "--no-playlist",
      "--socket-timeout", "15",
    ];
    if (COOKIES_FILE && existsSync(COOKIES_FILE)) {
      args.push("--cookies", COOKIES_FILE);
    }
    args.push(`https://www.youtube.com/watch?v=${videoId}`);
    const binary = process.env.YT_DLP_PATH || "yt-dlp";
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (e: any) {
      console.warn("[music/ytdlp] spawn threw", videoId, e?.code, e?.message);
      resolve(null);
      return;
    }
    let out = "";
    let err = "";
    proc.stdout?.on("data", (d) => { out += d.toString(); });
    proc.stderr?.on("data", (d) => { err += d.toString(); });
    const timer = setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} resolve(null); }, 25000);
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) {
        const first = out.trim().split("\n")[0];
        if (first.startsWith("http")) return resolve(first);
      }
      console.warn("[music/ytdlp] failed", videoId, "exit=", code, "stderr=", err.slice(0, 300));
      resolve(null);
    });
    proc.on("error", (e: any) => {
      clearTimeout(timer);
      console.warn("[music/ytdlp] error", videoId, e?.code, e?.message);
      resolve(null);
    });
  });
}

// Pure-JS fallback (no subprocess, works in any Node runtime including Cloud
// Run where yt-dlp may not be on PATH). Picks the best audio-only format.
async function extractAudioUrlYtdlCore(videoId: string): Promise<string | null> {
  try {
    const ytdl = (await import("@distube/ytdl-core")).default;
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    };
    const cookiesRaw = process.env.YT_COOKIES_TXT;
    if (cookiesRaw) {
      const cookieHeader = parseCookiesTxtToHeader(cookiesRaw);
      if (cookieHeader) headers["Cookie"] = cookieHeader;
    }
    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`, {
      requestOptions: { headers },
    } as any);
    const audioFormats = info.formats.filter((f: any) => f.hasAudio && !f.hasVideo);
    if (audioFormats.length === 0) {
      console.warn("[music/ytdl-core] no audio formats", videoId);
      return null;
    }
    // Prefer m4a (AAC) → broadest native player support, then by bitrate.
    audioFormats.sort((a: any, b: any) => {
      const aM4a = (a.container === "mp4" || a.mimeType?.includes("mp4")) ? 1 : 0;
      const bM4a = (b.container === "mp4" || b.mimeType?.includes("mp4")) ? 1 : 0;
      if (aM4a !== bM4a) return bM4a - aM4a;
      return (b.audioBitrate ?? 0) - (a.audioBitrate ?? 0);
    });
    const pick = audioFormats[0];
    return typeof pick?.url === "string" ? pick.url : null;
  } catch (e: any) {
    console.warn("[music/ytdl-core] failed", videoId, e?.message);
    return null;
  }
}

async function extractAudioUrl(videoId: string): Promise<string | null> {
  const viaYtDlp = await extractAudioUrlYtDlp(videoId);
  if (viaYtDlp) return viaYtDlp;
  const viaYtdlCore = await extractAudioUrlYtdlCore(videoId);
  if (viaYtdlCore) return viaYtdlCore;
  return null;
}

// ─── iTunes catalog (search + curated rows) ─────────────────────────────
// Public, no API key, no auth. Rate-limited per IP (~20/min) — we cache
// search results in-memory for 1 hour to stay well under the limit.

type CacheEntry<T> = { data: T; expiresAt: number };
const cache = new Map<string, CacheEntry<any>>();
const TTL_MS = 60 * 60 * 1000;

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.data as T;
}
function cacheSet<T>(key: string, data: T) {
  cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
}

export interface ITunesTrack {
  itunes_track_id: string;
  title: string;
  artist: string;
  album: string | null;
  artwork_url: string | null;
  duration_sec: number | null;
  genre: string | null;
  preview_url: string | null;
}

function shapeITunesResults(raw: any): ITunesTrack[] {
  const out: ITunesTrack[] = [];
  for (const r of raw?.results ?? []) {
    if (!r?.trackId || r?.kind !== "song") continue;
    const artwork = (r.artworkUrl100 as string | undefined)
      ?.replace("100x100", "600x600") ?? null;
    out.push({
      itunes_track_id: String(r.trackId),
      title: String(r.trackName ?? "Unknown"),
      artist: String(r.artistName ?? "Unknown"),
      album: r.collectionName ? String(r.collectionName) : null,
      artwork_url: artwork,
      duration_sec: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : null,
      genre: r.primaryGenreName ? String(r.primaryGenreName) : null,
      preview_url: r.previewUrl ? String(r.previewUrl) : null,
    });
  }
  return out;
}

async function itunesSearch(term: string, limit = 30): Promise<ITunesTrack[]> {
  const key = `search:${term.toLowerCase()}:${limit}`;
  const cached = cacheGet<ITunesTrack[]>(key);
  if (cached) return cached;
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", term);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "UltraCast/3 Music" },
  });
  if (!res.ok) throw new Error(`iTunes search HTTP ${res.status}`);
  const json = await res.json();
  const shaped = shapeITunesResults(json);
  cacheSet(key, shaped);
  return shaped;
}

// ─── YouTube resolver (no API key) ───────────────────────────────────────
// Parses the public YouTube search results HTML and extracts the first
// matching video id. This works without an API key. Cached forever in
// Supabase so each track resolves at most once across all users.

// Channels that auto-upload from rights-holders (Sony/UMG/Warner/Vevo).
// These are responsible for the vast majority of error 150/152/153 embed
// failures. Filter them out at the ranking stage — lyric / audio re-uploads
// from independent channels almost always allow embedding.
// Soft-demote (don't exclude) rights-holder auto-upload channels.
// Embeddability is enforced downstream via isEmbeddable(), so demoting
// keeps these as last-resort candidates instead of removing the only
// match for niche tracks.
function channelPenalty(channel: string): number {
  const c = (channel || "").toLowerCase().trim();
  if (!c) return 0;
  if (c.endsWith(" - topic")) return 200;
  if (c.includes("vevo")) return 200;
  return 0;
}

function rankVideos(items: any[], targetSec: number | null): { videoId: string; title: string; channel: string }[] {
  // items is an array of { videoRenderer: { videoId, title.runs, lengthText.simpleText, ownerText.runs } }
  const ranked: { videoId: string; title: string; channel: string; durDelta: number; boost: number }[] = [];
  for (const it of items) {
    const v = it?.videoRenderer;
    if (!v?.videoId) continue;
    const videoId = String(v.videoId);
    const title = (v?.title?.runs?.[0]?.text as string | undefined) ?? "";
    const channel = (v?.ownerText?.runs?.[0]?.text as string | undefined) ?? "";
    const chanPenalty = channelPenalty(channel);
    const lenText = (v?.lengthText?.simpleText as string | undefined) ?? "";
    let durSec: number | null = null;
    if (lenText) {
      const parts = lenText.split(":").map((p) => parseInt(p, 10));
      if (parts.every((p) => !isNaN(p))) {
        durSec = parts.reduce((acc, p) => acc * 60 + p, 0);
      }
    }
    // Skip clearly-too-long results (>15 min) — usually full albums / hour mixes
    if (durSec != null && durSec > 15 * 60) continue;
    const delta = targetSec != null && durSec != null ? Math.abs(durSec - targetSec) : 0;
    // Prefer lyric / audio uploads — these are nearly always embeddable
    const lc = title.toLowerCase();
    let boost = 0;
    if (lc.includes("lyric")) boost -= 60;
    else if (lc.includes("audio")) boost -= 30;
    if (lc.includes("official video") || lc.includes("music video")) boost += 90;
    boost += chanPenalty;
    ranked.push({ videoId, title, channel, durDelta: delta, boost });
  }
  ranked.sort((a, b) => (a.durDelta + a.boost) - (b.durDelta + b.boost));
  // Dedupe by videoId
  const seen = new Set<string>();
  return ranked.filter((r) => (seen.has(r.videoId) ? false : (seen.add(r.videoId), true))).map(({ videoId, title, channel }) => ({ videoId, title, channel }));
}

// Probe a videoId via YouTube oEmbed — returns 200 only when the video
// exists AND allows third-party embedding. Returns false on 401/404/etc.
const embedProbeCache = new Map<string, { ok: boolean; at: number }>();
async function isEmbeddable(videoId: string): Promise<boolean> {
  const cached = embedProbeCache.get(videoId);
  if (cached && Date.now() - cached.at < 24 * 60 * 60 * 1000) return cached.ok;
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const ok = res.ok;
    embedProbeCache.set(videoId, { ok, at: Date.now() });
    return ok;
  } catch {
    return false;
  }
}

async function filterEmbeddable(
  candidates: { videoId: string; title: string; channel: string }[],
  maxKeep: number,
): Promise<{ videoId: string; title: string; channel: string }[]> {
  // Probe in parallel batches; stop once we have enough good ones.
  const out: { videoId: string; title: string; channel: string }[] = [];
  for (let i = 0; i < candidates.length && out.length < maxKeep; i += 5) {
    const batch = candidates.slice(i, i + 5);
    const oks = await Promise.all(batch.map((c) => isEmbeddable(c.videoId)));
    batch.forEach((c, j) => { if (oks[j]) out.push(c); });
  }
  return out;
}

async function youtubeSearchAll(query: string, targetSec: number | null): Promise<{ videoId: string; title: string; channel: string }[]> {
  const url = new URL("https://www.youtube.com/results");
  url.searchParams.set("search_query", query);
  // sp=EgIQAQ%3D%3D filters to videos only
  url.searchParams.set("sp", "EgIQAQ%3D%3D");
  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) return null;
  const html = await res.text();
  // The page bootstrap embeds JSON as `var ytInitialData = {...};`
  const marker = "var ytInitialData = ";
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const jsonStart = start + marker.length;
  // Find the closing `};` — JSON is followed by `;</script>`
  let depth = 0;
  let inStr = false;
  let escape = false;
  let end = -1;
  for (let i = jsonStart; i < html.length; i++) {
    const c = html[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end < 0) return [];
  let parsed: any;
  try {
    parsed = JSON.parse(html.slice(jsonStart, end));
  } catch {
    return [];
  }
  // Walk to the primary results contents
  const contents = parsed?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ?? [];
  const items: any[] = [];
  for (const section of contents) {
    const list = section?.itemSectionRenderer?.contents;
    if (Array.isArray(list)) items.push(...list);
  }
  return rankVideos(items, targetSec);
}

async function verifyPlaylistOwner(playlistId: string, profileId: string): Promise<boolean> {
  if (!playlistId || !profileId) return false;
  const { data } = await supabase
    .from("music_playlists")
    .select("profile_id")
    .eq("id", playlistId)
    .maybeSingle();
  return data?.profile_id === profileId;
}

async function verifyPlaylistTrackOwner(trackId: string, profileId: string): Promise<boolean> {
  if (!trackId || !profileId) return false;
  const { data } = await supabase
    .from("music_playlist_tracks")
    .select("playlist_id, music_playlists!inner(profile_id)")
    .eq("id", trackId)
    .maybeSingle();
  // Embedded join shape: music_playlists is an object when using !inner
  const owner = (data as any)?.music_playlists?.profile_id;
  return owner === profileId;
}

export function registerMusicRoutes(app: Express) {
  // ── Stream URL extractor (yt-dlp) ────────────────────────────────────
  // JSON endpoint kept for diagnostics. Returns the resolved (server-IP
  // locked) googlevideo URL. The client should NOT load this URL directly
  // — googlevideo URLs are signed with the requesting IP. Use the audio
  // proxy below instead.
  app.get("/api/music/stream/:videoId", async (req, res) => {
    const vid = String(req.params.videoId || "");
    if (!/^[A-Za-z0-9_-]{11}$/.test(vid)) {
      return res.status(400).json({ error: "Invalid videoId" });
    }
    const hit = streamCache.get(vid);
    if (hit && hit.expiresAt > Date.now()) {
      return res.json({ url: hit.url, cached: true });
    }
    try {
      const url = await extractAudioUrl(vid);
      if (!url) return res.status(502).json({ error: "Extraction failed" });
      streamCache.set(vid, { url, expiresAt: Date.now() + STREAM_TTL_MS });
      return res.json({ url, cached: false });
    } catch (e: any) {
      console.error("[music/stream]", e?.message);
      return res.status(502).json({ error: "Extraction error" });
    }
  });

  // ── Audio proxy ──────────────────────────────────────────────────────
  // expo-video / native players load this URL directly. We resolve the
  // googlevideo CDN URL (signed with OUR server IP), then proxy the bytes
  // back to the client. Forwards Range so seeking + progressive download
  // work. On 403 (URL expired or rotated) we re-extract once and retry.
  async function fetchUpstream(audioUrl: string, range?: string) {
    const headers: Record<string, string> = {
      "User-Agent":
        "com.google.android.apps.youtube.music/7.16.53 (Linux; U; Android 13)",
    };
    if (range) headers["Range"] = range;
    return fetch(audioUrl, { headers });
  }

  async function resolveFresh(vid: string): Promise<string | null> {
    const url = await extractAudioUrl(vid);
    if (!url) return null;
    streamCache.set(vid, { url, expiresAt: Date.now() + STREAM_TTL_MS });
    return url;
  }

  app.get("/api/music/audio/:videoId", async (req: Request, res: Response) => {
    const vid = String(req.params.videoId || "");
    if (!/^[A-Za-z0-9_-]{11}$/.test(vid)) {
      return res.status(400).end("bad videoId");
    }
    try {
      const hit = streamCache.get(vid);
      let upstreamUrl = hit && hit.expiresAt > Date.now() ? hit.url : null;
      if (!upstreamUrl) upstreamUrl = await resolveFresh(vid);
      if (!upstreamUrl) return res.status(502).end("extract failed");

      const range = req.headers.range as string | undefined;
      let upstream = await fetchUpstream(upstreamUrl, range);
      if (upstream.status === 403 || upstream.status === 410) {
        // Cached URL went stale (rotated / IP changed) — refresh once.
        streamCache.delete(vid);
        const fresh = await resolveFresh(vid);
        if (!fresh) return res.status(502).end("re-extract failed");
        upstream = await fetchUpstream(fresh, range);
      }
      if (!upstream.ok && upstream.status !== 206) {
        return res.status(upstream.status).end();
      }
      res.status(upstream.status);
      for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "cache-control", "last-modified", "etag"]) {
        const v = upstream.headers.get(h);
        if (v) res.setHeader(h, v);
      }
      if (!upstream.headers.get("accept-ranges")) res.setHeader("Accept-Ranges", "bytes");
      if (!upstream.body) return res.end();
      const nodeStream = Readable.fromWeb(upstream.body as any);
      nodeStream.on("error", () => { try { res.end(); } catch {} });
      req.on("close", () => { try { nodeStream.destroy(); } catch {} });
      nodeStream.pipe(res);
    } catch (e: any) {
      console.error("[music/audio]", vid, e?.message);
      if (!res.headersSent) res.status(502).end("proxy error");
      else try { res.end(); } catch {}
    }
  });

  // ── Search ───────────────────────────────────────────────────────────
  app.get("/api/music/search", async (req, res) => {
    const { q, limit } = req.query;
    if (!q || typeof q !== "string" || q.trim().length === 0) {
      return res.json({ results: [] });
    }
    try {
      const lim = Math.max(1, Math.min(50, Number(limit) || 30));
      const results = await itunesSearch(q.trim(), lim);
      res.json({ results });
    } catch (e: any) {
      console.error("[music/search]", e?.message);
      res.status(500).json({ error: "Search failed" });
    }
  });

  // ── Curated rows (search-based for MVP) ──────────────────────────────
  // Each row is just an iTunes search under the hood; the front-end
  // labels them however it likes.
  app.get("/api/music/browse", async (_req, res) => {
    const ROWS: { id: string; title: string; query: string }[] = [
      { id: "pop", title: "Top Pop", query: "Taylor Swift" },
      { id: "hiphop", title: "Hip-Hop Heat", query: "Drake" },
      { id: "rnb", title: "R&B Hits", query: "The Weeknd" },
      { id: "rock", title: "Rock Anthems", query: "Imagine Dragons" },
      { id: "country", title: "Country", query: "Morgan Wallen" },
      { id: "latin", title: "Latin", query: "Bad Bunny" },
      { id: "electronic", title: "Electronic", query: "Calvin Harris" },
      { id: "throwback", title: "Throwbacks", query: "Michael Jackson" },
    ];
    try {
      const rows = await Promise.all(
        ROWS.map(async (r) => {
          try {
            const tracks = await itunesSearch(r.query, 15);
            return { id: r.id, title: r.title, tracks };
          } catch {
            return { id: r.id, title: r.title, tracks: [] };
          }
        }),
      );
      res.json({ rows });
    } catch (e: any) {
      console.error("[music/browse]", e?.message);
      res.status(500).json({ error: "Browse failed" });
    }
  });

  // ── Resolve iTunes track → YouTube video ─────────────────────────────
  // Returns up to 5 candidates. Client plays the first; if YouTube refuses
  // it (error 150/153 — embedding disabled), client falls back to the next.
  // The `skip` query param can be used to force a fresh search (ignoring
  // the cached pick), e.g. when the cached video became unembeddable.
  app.post("/api/music/resolve", async (req, res) => {
    const { itunes_track_id, title, artist, duration_sec } = req.body ?? {};
    const skip = String(req.query.skip ?? "") === "1";
    if (!itunes_track_id || !title || !artist) {
      return res.status(400).json({ error: "itunes_track_id, title, artist required" });
    }
    try {
      // 1. Check cache (unless caller asked to skip a known-bad cached pick)
      if (!skip) {
        const { data: cached } = await supabase
          .from("music_resolved_tracks")
          .select("video_id, channel, title")
          .eq("itunes_track_id", String(itunes_track_id))
          .maybeSingle();
        if (cached?.video_id) {
          return res.json({
            video_id: cached.video_id,
            video_ids: [cached.video_id],
            channel: cached.channel ?? null,
            title: cached.title ?? null,
            cached: true,
          });
        }
      }
      // 2. Live YouTube search — broaden across a few query phrasings since
      // "official" results are often Vevo/Sony and block embedding.
      const queries = [
        `${artist} ${title} audio`,
        `${artist} ${title} lyrics`,
        `${artist} ${title}`,
      ];
      const all: { videoId: string; title: string; channel: string }[] = [];
      const seen = new Set<string>();
      for (const q of queries) {
        const r = await youtubeSearchAll(q, typeof duration_sec === "number" ? duration_sec : null);
        for (const c of r) {
          if (!seen.has(c.videoId)) {
            seen.add(c.videoId);
            all.push(c);
          }
        }
        if (all.length >= 15) break;
      }
      if (all.length === 0) {
        return res.status(404).json({ error: "No YouTube match found" });
      }
      // yt-dlp extracts audio directly from googlevideo CDN, so embed
      // restrictions no longer matter — every result is playable.
      const top = all.slice(0, 5);
      const pick = top[0];
      // 3. Cache the best pick (best-effort, never blocks response)
      supabase
        .from("music_resolved_tracks")
        .upsert(
          {
            itunes_track_id: String(itunes_track_id),
            video_id: pick.videoId,
            channel: pick.channel,
            title: pick.title,
            resolved_at: new Date().toISOString(),
          },
          { onConflict: "itunes_track_id" },
        )
        .then(({ error }) => {
          if (error) console.warn("[music/resolve] cache upsert failed:", error.message);
        });
      res.json({
        video_id: pick.videoId,
        video_ids: top.map((t) => t.videoId),
        channel: pick.channel,
        title: pick.title,
        cached: false,
      });
    } catch (e: any) {
      console.error("[music/resolve]", e?.message);
      res.status(500).json({ error: "Resolve failed" });
    }
  });

  // Mark a cached video_id as bad and refresh the cache with a new pick.
  app.post("/api/music/resolve/bad", async (req, res) => {
    const { itunes_track_id, bad_video_id, title, artist, duration_sec } = req.body ?? {};
    if (!itunes_track_id || !title || !artist) {
      return res.status(400).json({ error: "itunes_track_id, title, artist required" });
    }
    try {
      const queries = [
        `${artist} ${title} audio`,
        `${artist} ${title} lyrics`,
        `${artist} ${title}`,
      ];
      const all: { videoId: string; title: string; channel: string }[] = [];
      const seen = new Set<string>();
      seen.add(String(bad_video_id ?? ""));
      for (const q of queries) {
        const r = await youtubeSearchAll(q, typeof duration_sec === "number" ? duration_sec : null);
        for (const c of r) {
          if (!seen.has(c.videoId)) {
            seen.add(c.videoId);
            all.push(c);
          }
        }
        if (all.length >= 15) break;
      }
      const fresh = all.slice(0, 5);
      if (fresh.length === 0) return res.status(404).json({ error: "No alternate found" });
      const pick = fresh[0];
      supabase
        .from("music_resolved_tracks")
        .upsert(
          {
            itunes_track_id: String(itunes_track_id),
            video_id: pick.videoId,
            channel: pick.channel,
            title: pick.title,
            resolved_at: new Date().toISOString(),
          },
          { onConflict: "itunes_track_id" },
        )
        .then(() => {});
      res.json({
        video_id: pick.videoId,
        video_ids: fresh.slice(0, 5).map((t) => t.videoId),
        channel: pick.channel,
        title: pick.title,
      });
    } catch (e: any) {
      console.error("[music/resolve/bad]", e?.message);
      res.status(500).json({ error: "Failed" });
    }
  });

  // ── Playlists CRUD ───────────────────────────────────────────────────
  app.get("/api/music/playlists", async (req, res) => {
    const { profile_id } = req.query;
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    try {
      const { data, error } = await supabase
        .from("music_playlists")
        .select("id, name, created_at, updated_at")
        .eq("profile_id", profile_id as string)
        .order("updated_at", { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      // Also count tracks per playlist + grab first artwork
      const ids = (data ?? []).map((p) => p.id);
      let trackInfo: Record<string, { count: number; artwork: string | null }> = {};
      if (ids.length > 0) {
        const { data: trks } = await supabase
          .from("music_playlist_tracks")
          .select("playlist_id, artwork_url, position")
          .in("playlist_id", ids)
          .order("position", { ascending: true });
        for (const t of trks ?? []) {
          const e = trackInfo[t.playlist_id] ?? { count: 0, artwork: null };
          e.count++;
          if (!e.artwork && t.artwork_url) e.artwork = t.artwork_url;
          trackInfo[t.playlist_id] = e;
        }
      }
      const out = (data ?? []).map((p) => ({
        ...p,
        track_count: trackInfo[p.id]?.count ?? 0,
        cover_url: trackInfo[p.id]?.artwork ?? null,
      }));
      res.json({ playlists: out });
    } catch (e: any) {
      console.error("[music/playlists] GET", e?.message);
      res.status(500).json({ error: "Failed to fetch playlists" });
    }
  });

  app.post("/api/music/playlists", async (req, res) => {
    const { profile_id, name } = req.body ?? {};
    if (!profile_id || !name) return res.status(400).json({ error: "profile_id and name required" });
    try {
      const { data, error } = await supabase
        .from("music_playlists")
        .insert({ profile_id, name: String(name).trim().slice(0, 80) || "New Playlist" })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: "Failed to create playlist" });
    }
  });

  app.put("/api/music/playlists/:id", async (req, res) => {
    const { id } = req.params;
    const { name, profile_id } = req.body ?? {};
    if (!name || !profile_id) return res.status(400).json({ error: "name and profile_id required" });
    if (!(await verifyPlaylistOwner(id, profile_id))) return res.status(403).json({ error: "Forbidden" });
    try {
      const { data, error } = await supabase
        .from("music_playlists")
        .update({ name: String(name).trim().slice(0, 80), updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch {
      res.status(500).json({ error: "Failed to rename playlist" });
    }
  });

  app.delete("/api/music/playlists/:id", async (req, res) => {
    const { id } = req.params;
    const profile_id = (req.query.profile_id as string) || (req.body?.profile_id as string);
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    if (!(await verifyPlaylistOwner(id, profile_id))) return res.status(403).json({ error: "Forbidden" });
    try {
      const { error } = await supabase.from("music_playlists").delete().eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete playlist" });
    }
  });

  app.get("/api/music/playlists/:id/tracks", async (req, res) => {
    const { id } = req.params;
    const profile_id = req.query.profile_id as string;
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    if (!(await verifyPlaylistOwner(id, profile_id))) return res.status(403).json({ error: "Forbidden" });
    try {
      const { data, error } = await supabase
        .from("music_playlist_tracks")
        .select("*")
        .eq("playlist_id", id)
        .order("position", { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      res.json({ tracks: data ?? [] });
    } catch {
      res.status(500).json({ error: "Failed to fetch tracks" });
    }
  });

  app.post("/api/music/playlists/:id/tracks", async (req, res) => {
    const { id } = req.params;
    const { itunes_track_id, title, artist, album, artwork_url, duration_sec, profile_id } = req.body ?? {};
    if (!itunes_track_id || !title || !artist || !profile_id) {
      return res.status(400).json({ error: "itunes_track_id, title, artist, profile_id required" });
    }
    if (!(await verifyPlaylistOwner(id, profile_id))) return res.status(403).json({ error: "Forbidden" });
    try {
      // Compute next position
      const { data: existing } = await supabase
        .from("music_playlist_tracks")
        .select("position")
        .eq("playlist_id", id)
        .order("position", { ascending: false })
        .limit(1);
      const nextPos = (existing?.[0]?.position ?? -1) + 1;
      const { data, error } = await supabase
        .from("music_playlist_tracks")
        .insert({
          playlist_id: id,
          position: nextPos,
          itunes_track_id: String(itunes_track_id),
          title,
          artist,
          album: album ?? null,
          artwork_url: artwork_url ?? null,
          duration_sec: typeof duration_sec === "number" ? duration_sec : null,
        })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      // Bump playlist updated_at
      await supabase
        .from("music_playlists")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", id);
      res.json(data);
    } catch (e: any) {
      console.error("[music/playlists/tracks] POST", e?.message);
      res.status(500).json({ error: "Failed to add track" });
    }
  });

  // Reorder all tracks in a playlist by supplying the new id sequence.
  app.put("/api/music/playlists/:id/tracks/order", async (req, res) => {
    const { id } = req.params;
    const { profile_id, track_ids } = req.body ?? {};
    if (!profile_id || !Array.isArray(track_ids)) {
      return res.status(400).json({ error: "profile_id and track_ids[] required" });
    }
    if (!(await verifyPlaylistOwner(id, profile_id))) return res.status(403).json({ error: "Forbidden" });
    try {
      // Two-pass to avoid the unique-position issue: bump everything by a large
      // offset, then write final positions.
      const OFFSET = 100000;
      for (let i = 0; i < track_ids.length; i++) {
        await supabase.from("music_playlist_tracks")
          .update({ position: OFFSET + i })
          .eq("id", track_ids[i])
          .eq("playlist_id", id);
      }
      for (let i = 0; i < track_ids.length; i++) {
        await supabase.from("music_playlist_tracks")
          .update({ position: i })
          .eq("id", track_ids[i])
          .eq("playlist_id", id);
      }
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to reorder tracks" });
    }
  });

  app.delete("/api/music/playlist-tracks/:trackId", async (req, res) => {
    const { trackId } = req.params;
    const profile_id = (req.query.profile_id as string) || (req.body?.profile_id as string);
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    if (!(await verifyPlaylistTrackOwner(trackId, profile_id))) return res.status(403).json({ error: "Forbidden" });
    try {
      const { error } = await supabase.from("music_playlist_tracks").delete().eq("id", trackId);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to remove track" });
    }
  });
}
