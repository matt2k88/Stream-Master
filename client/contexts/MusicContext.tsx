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
}

export type PlayState = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

interface MusicContextValue {
  // State
  current: MusicTrack | null;
  videoId: string | null;
  queue: MusicTrack[];
  queueIndex: number;
  playState: PlayState;
  position: number;        // seconds
  duration: number;        // seconds
  expanded: boolean;       // true while NowPlaying is visible
  fullscreen: boolean;     // true when video should fill the screen

  // Player commands (driven by MusicHost via setController)
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

  // Internal — registered by MusicHost so context can drive the WebView
  _registerController: (ctl: ControllerCmds | null) => void;
  // Internal — published by MusicHost on every WebView state event
  _onPlayerEvent: (e: PlayerEvent) => void;
}

export interface ControllerCmds {
  load: (videoId: string) => void;
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
    const url = new URL("/api/music/resolve", getApiUrl());
    const res = await fetch(url.toString(), {
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
  } catch {
    return [];
  }
}

async function resolveAlternateVideoIds(track: MusicTrack, badVideoId: string): Promise<string[]> {
  try {
    const url = new URL("/api/music/resolve/bad", getApiUrl());
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itunes_track_id: track.itunes_track_id,
        bad_video_id: badVideoId,
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
  } catch {
    return [];
  }
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<MusicTrack | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
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
  // Alternate YouTube video candidates for the current track so we can fall
  // through when one is unembeddable (YT error 150/153). videoCandidatesRef[0]
  // is the currently-loaded video; pop from the front on error.
  const videoCandidatesRef = useRef<string[]>([]);
  // Monotonic token: any in-flight resolve whose token != current is ignored.
  const playTokenRef = useRef(0);

  const _registerController = useCallback((ctl: ControllerCmds | null) => {
    controllerRef.current = ctl;
  }, []);

  // Restore last-known track (paused) on app start so the mini bar can resume.
  // Persists videoId too so resume() works without re-resolving. Guard with
  // playToken — if user starts playback before disk read resolves, abandon.
  useEffect(() => {
    const tokenAtStart = playTokenRef.current;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(LAST_TRACK_KEY);
        if (!raw) return;
        if (playTokenRef.current !== tokenAtStart) return;
        const parsed = JSON.parse(raw) as { track: MusicTrack; queue: MusicTrack[]; index: number; videoId?: string | null } | null;
        if (!parsed || !parsed.track) return;
        setCurrent(parsed.track);
        setQueue(parsed.queue ?? [parsed.track]);
        setQueueIndex(parsed.index ?? 0);
        queueRef.current = parsed.queue ?? [parsed.track];
        queueIndexRef.current = parsed.index ?? 0;
        setPlayState("paused");
        setDuration(parsed.track.duration_sec ?? 0);
        if (parsed.videoId) {
          setVideoId(parsed.videoId);
          // Load (but don't auto-play) so the user's first press of play resumes.
          // If controller mounts later, MusicHost picks up videoId via effect.
          controllerRef.current?.load(parsed.videoId);
        }
      } catch {}
    })();
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
    setVideoId(null);
    videoCandidatesRef.current = [];
    const vids = await resolveVideoIds(track);
    // Ignore stale resolves that completed after the user moved on.
    if (playTokenRef.current !== myToken) return;
    if (vids.length === 0) {
      setPlayState("error");
      return;
    }
    videoCandidatesRef.current = vids;
    const vid = vids[0];
    setVideoId(vid);
    controllerRef.current?.load(vid);
    try {
      AsyncStorage.setItem(LAST_TRACK_KEY, JSON.stringify({ track, queue: tracks, index, videoId: vid }));
    } catch {}
  }, []);

  const tryNextCandidate = useCallback(async () => {
    const track = currentRef.current;
    if (!track) return false;
    // Drop the failing first candidate
    const remaining = videoCandidatesRef.current.slice(1);
    let next = remaining[0];
    if (!next) {
      // Out of cached candidates — ask server for a fresh list excluding the bad pick
      const bad = videoCandidatesRef.current[0] ?? "";
      const fresh = await resolveAlternateVideoIds(track, bad);
      if (fresh.length === 0) return false;
      videoCandidatesRef.current = fresh;
      next = fresh[0];
    } else {
      videoCandidatesRef.current = remaining;
    }
    setVideoId(next);
    controllerRef.current?.load(next);
    return true;
  }, []);

  const reorderQueue = useCallback((from: number, to: number) => {
    const q = [...queueRef.current];
    if (from < 0 || from >= q.length || to < 0 || to >= q.length || from === to) return;
    const currIdx = queueIndexRef.current;
    const [item] = q.splice(from, 1);
    q.splice(to, 0, item);
    // Keep queueIndex pointing at the same currently-playing track
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

  const pause = useCallback(() => {
    controllerRef.current?.pause();
    setPlayState("paused");
  }, []);

  const resume = useCallback(() => {
    controllerRef.current?.play();
    setPlayState("playing");
  }, []);

  const seek = useCallback((seconds: number) => {
    controllerRef.current?.seek(seconds);
    setPosition(seconds);
  }, []);

  const next = useCallback(async () => {
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    if (q.length === 0 || idx + 1 >= q.length) return;
    await startTrackAt(q, idx + 1);
  }, [startTrackAt]);

  const previous = useCallback(async () => {
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    // If >3s in, restart current; else go back
    if (position > 3) {
      controllerRef.current?.seek(0);
      setPosition(0);
      return;
    }
    if (q.length === 0 || idx <= 0) {
      controllerRef.current?.seek(0);
      setPosition(0);
      return;
    }
    await startTrackAt(q, idx - 1);
  }, [position, startTrackAt]);

  const stop = useCallback(() => {
    controllerRef.current?.pause();
    setCurrent(null);
    setVideoId(null);
    setQueue([]);
    setQueueIndex(-1);
    queueRef.current = [];
    queueIndexRef.current = -1;
    setPlayState("idle");
    setPosition(0);
    setDuration(0);
    setExpanded(false);
  }, []);

  const _onPlayerEvent = useCallback((e: PlayerEvent) => {
    if (e.type === "state") {
      setPlayState(e.state);
      if (typeof e.position === "number" && !isNaN(e.position)) setPosition(e.position);
      if (typeof e.duration === "number" && !isNaN(e.duration) && e.duration > 0) setDuration(e.duration);
    } else if (e.type === "ended") {
      // Auto-advance
      const q = queueRef.current;
      const idx = queueIndexRef.current;
      if (q.length > 0 && idx + 1 < q.length) {
        startTrackAt(q, idx + 1);
      } else {
        setPlayState("ended");
      }
    } else if (e.type === "error") {
      // YT errors 150/153/101 mean the video can't be embedded. Try the next
      // candidate before giving up.
      (async () => {
        const ok = await tryNextCandidate();
        if (!ok) setPlayState("error");
      })();
    }
  }, [startTrackAt, tryNextCandidate]);

  const value = useMemo<MusicContextValue>(() => ({
    current, videoId, queue, queueIndex, playState, position, duration, expanded, fullscreen,
    playTrack, playQueue, pause, resume, next, previous, seek, stop, setExpanded, setFullscreen, reorderQueue,
    _registerController, _onPlayerEvent,
  }), [current, videoId, queue, queueIndex, playState, position, duration, expanded, fullscreen,
       playTrack, playQueue, pause, resume, next, previous, seek, stop, reorderQueue, _registerController, _onPlayerEvent]);

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}

export function useMusic() {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error("useMusic must be used within MusicProvider");
  return ctx;
}
