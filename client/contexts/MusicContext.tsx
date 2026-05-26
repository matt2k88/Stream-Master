import React, { createContext, useContext, useState, useCallback, useRef, ReactNode, useMemo, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";

const LAST_TRACK_KEY = "@uc:music:last";

export interface MusicTrack {
  itunes_track_id: string;
  title: string;
  artist: string;
  album: string | null;
  artwork_url: string | null;
  duration_sec: number | null;
  preview_url?: string | null;
}

export type PlayState = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

interface MusicContextValue {
  current: MusicTrack | null;
  audioUrl: string | null;
  isPreview: boolean;
  queue: MusicTrack[];
  queueIndex: number;
  playState: PlayState;
  position: number;
  duration: number;
  expanded: boolean;
  fullscreen: boolean;

  playTrack: (track: MusicTrack, queue?: MusicTrack[]) => Promise<void>;
  playQueue: (tracks: MusicTrack[], startIndex?: number) => Promise<void>;
  pause: () => void;
  resume: () => void;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (seconds: number) => void;
  stop: () => void;
  setExpanded: (v: boolean) => void;
  setFullscreen: (v: boolean) => void;
  reorderQueue: (from: number, to: number) => void;

  // Wired by MusicHost so context can drive the audio player
  _registerController: (ctl: ControllerCmds | null) => void;
  _onPlayerEvent: (e: PlayerEvent) => void;
  _refreshAudioUrl: () => Promise<void>;
}

export interface ControllerCmds {
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
}

export type PlayerEvent =
  | { type: "state"; state: PlayState; position: number; duration: number }
  | { type: "ended" }
  | { type: "error" };

const MusicContext = createContext<MusicContextValue | undefined>(undefined);

async function resolveVideoIds(track: MusicTrack): Promise<string[]> {
  try {
    const res = await fetch(new URL("/api/music/resolve", getApiUrl()).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itunes_track_id: track.itunes_track_id,
        title: track.title,
        artist: track.artist,
        duration_sec: track.duration_sec,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data?.video_ids) && data.video_ids.length > 0) return data.video_ids;
    if (typeof data?.video_id === "string") return [data.video_id];
    return [];
  } catch { return []; }
}

async function resolveAlternateVideoIds(track: MusicTrack, badId: string): Promise<string[]> {
  try {
    const res = await fetch(new URL("/api/music/resolve/bad", getApiUrl()).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itunes_track_id: track.itunes_track_id,
        bad_video_id: badId,
        title: track.title,
        artist: track.artist,
        duration_sec: track.duration_sec,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data?.video_ids) && data.video_ids.length > 0) return data.video_ids;
    return [];
  } catch { return []; }
}

async function fetchAudioUrl(videoId: string, refresh = false): Promise<string | null> {
  try {
    const u = new URL("/api/music/audio", getApiUrl());
    u.searchParams.set("video_id", videoId);
    if (refresh) u.searchParams.set("refresh", "1");
    const res = await fetch(u.toString());
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.url === "string" ? data.url : null;
  } catch { return null; }
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<MusicTrack | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [playState, setPlayState] = useState<PlayState>("idle");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const controllerRef = useRef<ControllerCmds | null>(null);
  const queueRef = useRef<MusicTrack[]>([]);
  const queueIndexRef = useRef(-1);
  const currentRef = useRef<MusicTrack | null>(null);
  const currentVideoIdRef = useRef<string | null>(null);
  const playTokenRef = useRef(0);
  const refreshInFlightRef = useRef(false);

  const _registerController = useCallback((ctl: ControllerCmds | null) => {
    controllerRef.current = ctl;
  }, []);

  // Restore last-known track on launch (paused). Only applies if the user
  // hasn't already started playing something — guards against the async
  // AsyncStorage read landing AFTER an active playback call and clobbering
  // it with stale state.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(LAST_TRACK_KEY);
        if (!raw) return;
        if (currentRef.current || playTokenRef.current !== 0) return;
        const parsed = JSON.parse(raw) as { track: MusicTrack; queue: MusicTrack[]; index: number } | null;
        if (!parsed?.track) return;
        if (currentRef.current || playTokenRef.current !== 0) return;
        setCurrent(parsed.track);
        currentRef.current = parsed.track;
        setQueue(parsed.queue ?? [parsed.track]);
        setQueueIndex(parsed.index ?? 0);
        queueRef.current = parsed.queue ?? [parsed.track];
        queueIndexRef.current = parsed.index ?? 0;
        setPlayState("paused");
        setDuration(parsed.track.duration_sec ?? 0);
      } catch {}
    })();
  }, []);

  // Try a list of videoIds in order, returning the first that yields an
  // audio URL. Tracks the chosen videoId for refresh-on-expire.
  const tryVideoIds = useCallback(async (videoIds: string[], myToken: number): Promise<string | null> => {
    for (const vid of videoIds) {
      if (playTokenRef.current !== myToken) return null;
      const url = await fetchAudioUrl(vid);
      if (playTokenRef.current !== myToken) return null;
      if (url) {
        currentVideoIdRef.current = vid;
        return url;
      }
    }
    return null;
  }, []);

  const startTrackAt = useCallback(async (tracks: MusicTrack[], index: number) => {
    const track = tracks[index];
    if (!track) return;
    const myToken = ++playTokenRef.current;
    setCurrent(track);
    currentRef.current = track;
    setQueue(tracks);
    setQueueIndex(index);
    queueRef.current = tracks;
    queueIndexRef.current = index;
    setPlayState("loading");
    setPosition(0);
    setDuration(track.duration_sec ?? 0);
    setAudioUrl(null);
    setIsPreview(false);
    currentVideoIdRef.current = null;
    refreshInFlightRef.current = false;

    // 1. Get YouTube candidate list
    const vids = await resolveVideoIds(track);
    if (playTokenRef.current !== myToken) return;

    // 2. Try to extract audio URL from each candidate
    let url = vids.length > 0 ? await tryVideoIds(vids, myToken) : null;
    if (playTokenRef.current !== myToken) return;

    // 3. If all candidates failed, ask for alternates
    if (!url && vids.length > 0) {
      const alts = await resolveAlternateVideoIds(track, vids[0]);
      if (playTokenRef.current !== myToken) return;
      if (alts.length > 0) url = await tryVideoIds(alts, myToken);
      if (playTokenRef.current !== myToken) return;
    }

    // 4. Last resort: iTunes 30s preview
    if (!url && track.preview_url) {
      url = track.preview_url;
      setIsPreview(true);
    }

    if (!url) {
      setPlayState("error");
      return;
    }

    setAudioUrl(url);
    try {
      AsyncStorage.setItem(LAST_TRACK_KEY, JSON.stringify({ track, queue: tracks, index }));
    } catch {}
  }, [tryVideoIds]);

  // Force a fresh audio URL for the current videoId. Called by MusicHost
  // when the player errors mid-stream (likely URL expired). Guarded by an
  // in-flight ref so back-to-back error events don't trigger overlapping
  // refresh storms.
  const _refreshAudioUrl = useCallback(async () => {
    const vid = currentVideoIdRef.current;
    if (!vid) return;
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    const myToken = playTokenRef.current;
    try {
      const fresh = await fetchAudioUrl(vid, true);
      if (playTokenRef.current !== myToken) return;
      if (fresh) {
        setAudioUrl(fresh);
      } else if (currentRef.current?.preview_url) {
        setAudioUrl(currentRef.current.preview_url);
        setIsPreview(true);
      } else {
        setPlayState("error");
      }
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []);

  const reorderQueue = useCallback((from: number, to: number) => {
    const q = [...queueRef.current];
    if (from < 0 || from >= q.length || to < 0 || to >= q.length || from === to) return;
    const currIdx = queueIndexRef.current;
    const [item] = q.splice(from, 1);
    q.splice(to, 0, item);
    let newIdx = currIdx;
    if (currIdx === from) newIdx = to;
    else if (from < currIdx && to >= currIdx) newIdx = currIdx - 1;
    else if (from > currIdx && to <= currIdx) newIdx = currIdx + 1;
    queueRef.current = q;
    queueIndexRef.current = newIdx;
    setQueue(q);
    setQueueIndex(newIdx);
  }, []);

  const playTrack = useCallback(async (track: MusicTrack, q?: MusicTrack[]) => {
    const tracks = q && q.length > 0 ? q : [track];
    const idx = Math.max(0, tracks.findIndex((t) => t.itunes_track_id === track.itunes_track_id));
    await startTrackAt(tracks, idx === -1 ? 0 : idx);
  }, [startTrackAt]);

  const playQueue = useCallback(async (tracks: MusicTrack[], startIndex = 0) => {
    if (tracks.length === 0) return;
    await startTrackAt(tracks, Math.max(0, Math.min(tracks.length - 1, startIndex)));
  }, [startTrackAt]);

  const pause = useCallback(() => { controllerRef.current?.pause(); setPlayState("paused"); }, []);
  const resume = useCallback(() => { controllerRef.current?.play(); setPlayState("playing"); }, []);
  const seek = useCallback((s: number) => { controllerRef.current?.seek(s); setPosition(s); }, []);

  const next = useCallback(async () => {
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    if (q.length === 0 || idx + 1 >= q.length) return;
    await startTrackAt(q, idx + 1);
  }, [startTrackAt]);

  const previous = useCallback(async () => {
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    if (position > 3) { controllerRef.current?.seek(0); setPosition(0); return; }
    if (q.length === 0 || idx <= 0) { controllerRef.current?.seek(0); setPosition(0); return; }
    await startTrackAt(q, idx - 1);
  }, [position, startTrackAt]);

  const stop = useCallback(() => {
    controllerRef.current?.pause();
    setCurrent(null); setAudioUrl(null); setIsPreview(false);
    setQueue([]); setQueueIndex(-1);
    queueRef.current = []; queueIndexRef.current = -1;
    currentVideoIdRef.current = null;
    setPlayState("idle"); setPosition(0); setDuration(0);
    setExpanded(false);
  }, []);

  const _onPlayerEvent = useCallback((e: PlayerEvent) => {
    if (e.type === "state") {
      setPlayState(e.state);
      if (typeof e.position === "number" && !isNaN(e.position)) setPosition(e.position);
      if (typeof e.duration === "number" && !isNaN(e.duration) && e.duration > 0) setDuration(e.duration);
    } else if (e.type === "ended") {
      const q = queueRef.current;
      const idx = queueIndexRef.current;
      if (q.length > 0 && idx + 1 < q.length) startTrackAt(q, idx + 1);
      else setPlayState("ended");
    } else if (e.type === "error") {
      // Stream may have expired — try fresh URL
      _refreshAudioUrl();
    }
  }, [startTrackAt, _refreshAudioUrl]);

  const value = useMemo<MusicContextValue>(() => ({
    current, audioUrl, isPreview, queue, queueIndex, playState, position, duration, expanded, fullscreen,
    playTrack, playQueue, pause, resume, next, previous, seek, stop, setExpanded, setFullscreen, reorderQueue,
    _registerController, _onPlayerEvent, _refreshAudioUrl,
  }), [current, audioUrl, isPreview, queue, queueIndex, playState, position, duration, expanded, fullscreen,
       playTrack, playQueue, pause, resume, next, previous, seek, stop, reorderQueue, _registerController, _onPlayerEvent, _refreshAudioUrl]);

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}

export function useMusic() {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error("useMusic must be used within MusicProvider");
  return ctx;
}
