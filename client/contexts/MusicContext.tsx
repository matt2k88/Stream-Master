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

async function resolveVideoId(track: MusicTrack): Promise<string | null> {
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
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.video_id === "string" ? data.video_id : null;
  } catch {
    return null;
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

  const controllerRef = useRef<ControllerCmds | null>(null);
  const queueRef = useRef<MusicTrack[]>([]);
  const queueIndexRef = useRef(-1);
  // Monotonic token: any in-flight resolve whose token != current is ignored.
  const playTokenRef = useRef(0);

  const _registerController = useCallback((ctl: ControllerCmds | null) => {
    controllerRef.current = ctl;
  }, []);

  // Restore last-known track (paused) on app start so the mini bar can resume.
  // Guard: capture playToken at effect start. If user starts playback before
  // restore resolves (token bumped), abandon the restore — otherwise we'd
  // overwrite the active track they just queued.
  useEffect(() => {
    const tokenAtStart = playTokenRef.current;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(LAST_TRACK_KEY);
        if (!raw) return;
        if (playTokenRef.current !== tokenAtStart) return; // user already played something
        const parsed = JSON.parse(raw) as { track: MusicTrack; queue: MusicTrack[]; index: number } | null;
        if (!parsed || !parsed.track) return;
        setCurrent(parsed.track);
        setQueue(parsed.queue ?? [parsed.track]);
        setQueueIndex(parsed.index ?? 0);
        queueRef.current = parsed.queue ?? [parsed.track];
        queueIndexRef.current = parsed.index ?? 0;
        setPlayState("paused");
        setDuration(parsed.track.duration_sec ?? 0);
      } catch {}
    })();
  }, []);

  const startTrackAt = useCallback(async (tracks: MusicTrack[], index: number) => {
    const track = tracks[index];
    if (!track) return;
    const myToken = ++playTokenRef.current;
    setCurrent(track);
    setQueue(tracks);
    setQueueIndex(index);
    queueRef.current = tracks;
    queueIndexRef.current = index;
    setPlayState("loading");
    setPosition(0);
    setDuration(track.duration_sec ?? 0);
    setVideoId(null);
    const vid = await resolveVideoId(track);
    // Ignore stale resolves that completed after the user moved on.
    if (playTokenRef.current !== myToken) return;
    if (!vid) {
      setPlayState("error");
      return;
    }
    setVideoId(vid);
    // Controller may not be mounted yet — MusicHost will pick up videoId via effect.
    controllerRef.current?.load(vid);
    // Persist last-played snapshot for next app launch
    try {
      AsyncStorage.setItem(LAST_TRACK_KEY, JSON.stringify({ track, queue: tracks, index }));
    } catch {}
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
      setPlayState("error");
    }
  }, [startTrackAt]);

  const value = useMemo<MusicContextValue>(() => ({
    current, videoId, queue, queueIndex, playState, position, duration, expanded,
    playTrack, playQueue, pause, resume, next, previous, seek, stop, setExpanded,
    _registerController, _onPlayerEvent,
  }), [current, videoId, queue, queueIndex, playState, position, duration, expanded,
       playTrack, playQueue, pause, resume, next, previous, seek, stop, _registerController, _onPlayerEvent]);

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}

export function useMusic() {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error("useMusic must be used within MusicProvider");
  return ctx;
}
