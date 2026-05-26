import type { Express } from "express";
import { supabase } from "./supabase";

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

function pickBestVideo(items: any[], targetSec: number | null): { videoId: string; title: string; channel: string } | null {
  // items is an array of { videoRenderer: { videoId, title.runs, lengthText.simpleText, ownerText.runs } }
  let best: { videoId: string; title: string; channel: string; durDelta: number } | null = null;
  for (const it of items) {
    const v = it?.videoRenderer;
    if (!v?.videoId) continue;
    const videoId = String(v.videoId);
    const title = (v?.title?.runs?.[0]?.text as string | undefined) ?? "";
    const channel = (v?.ownerText?.runs?.[0]?.text as string | undefined) ?? "";
    // Parse length like "3:42" or "1:02:15"
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
    if (!best || delta < best.durDelta) {
      best = { videoId, title, channel, durDelta: delta };
    }
  }
  return best ? { videoId: best.videoId, title: best.title, channel: best.channel } : null;
}

async function youtubeSearchFirst(query: string, targetSec: number | null): Promise<{ videoId: string; title: string; channel: string } | null> {
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
  if (end < 0) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(html.slice(jsonStart, end));
  } catch {
    return null;
  }
  // Walk to the primary results contents
  const contents = parsed?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ?? [];
  const items: any[] = [];
  for (const section of contents) {
    const list = section?.itemSectionRenderer?.contents;
    if (Array.isArray(list)) items.push(...list);
  }
  return pickBestVideo(items, targetSec);
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
  app.post("/api/music/resolve", async (req, res) => {
    const { itunes_track_id, title, artist, duration_sec } = req.body ?? {};
    if (!itunes_track_id || !title || !artist) {
      return res.status(400).json({ error: "itunes_track_id, title, artist required" });
    }
    try {
      // 1. Check cache
      const { data: cached } = await supabase
        .from("music_resolved_tracks")
        .select("video_id, channel, title")
        .eq("itunes_track_id", String(itunes_track_id))
        .maybeSingle();
      if (cached?.video_id) {
        return res.json({
          video_id: cached.video_id,
          channel: cached.channel ?? null,
          title: cached.title ?? null,
          cached: true,
        });
      }
      // 2. Live YouTube search
      const query = `${artist} ${title} official audio`;
      const result = await youtubeSearchFirst(query, typeof duration_sec === "number" ? duration_sec : null);
      if (!result) {
        return res.status(404).json({ error: "No YouTube match found" });
      }
      // 3. Cache (best-effort, never blocks response)
      supabase
        .from("music_resolved_tracks")
        .upsert(
          {
            itunes_track_id: String(itunes_track_id),
            video_id: result.videoId,
            channel: result.channel,
            title: result.title,
            resolved_at: new Date().toISOString(),
          },
          { onConflict: "itunes_track_id" },
        )
        .then(({ error }) => {
          if (error) console.warn("[music/resolve] cache upsert failed:", error.message);
        });
      res.json({ video_id: result.videoId, channel: result.channel, title: result.title, cached: false });
    } catch (e: any) {
      console.error("[music/resolve]", e?.message);
      res.status(500).json({ error: "Resolve failed" });
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
