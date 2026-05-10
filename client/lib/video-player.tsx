import React, { useRef, useReducer, useEffect } from "react";
import { View, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { VLCPlayer } from "react-native-vlc-media-player";

export type SubtitleTrack = {
  id: string;
  language: string;
  label?: string;
};

export type AudioTrack = {
  id: string;
  language: string;
  label?: string;
};

type StatusEvent =
  | { status: "loading"; error?: undefined }
  | { status: "readyToPlay"; error?: undefined }
  | { status: "error"; error: { message: string } };

type EventMap = {
  statusChange: StatusEvent;
  playingChange: { isPlaying: boolean };
  timeUpdate: { currentTime: number };
  availableSubtitleTracksChange: { availableSubtitleTracks: SubtitleTrack[] };
  availableAudioTracksChange: { availableAudioTracks: AudioTrack[] };
  playToEnd: undefined;
};

type Listener = (payload: any) => void;

class VideoPlayerImpl {
  uri: string;
  paused: boolean = false;
  muted: boolean = false;
  loop: boolean = false;
  released: boolean = false;
  timeUpdateEventInterval: number = 1;

  _currentTime: number = 0;
  _duration: number = 0;
  _playing: boolean = false;
  _audioTrack: AudioTrack | null = null;
  _subtitleTrack: SubtitleTrack | null = null;
  _subtitleTouched: boolean = false;
  _audioTouched: boolean = false;

  _vlcRef: any = null;
  _onChange: (() => void) | null = null;
  _listeners: Map<keyof EventMap, Set<Listener>> = new Map();
  _sourceVersion: number = 0;

  constructor(uri: string) {
    this.uri = uri;
  }

  get currentTime(): number {
    return this._currentTime;
  }
  set currentTime(v: number) {
    this._currentTime = v;
    if (this._duration > 0 && this._vlcRef && !this.released) {
      const frac = Math.max(0, Math.min(1, v / this._duration));
      try {
        this._vlcRef.seek(frac);
      } catch {}
    }
  }

  get duration(): number {
    return this._duration;
  }
  get playing(): boolean {
    return this._playing;
  }

  get audioTrack(): AudioTrack | null {
    return this._audioTrack;
  }
  set audioTrack(v: AudioTrack | null) {
    this._audioTrack = v;
    this._audioTouched = true;
    this._notify();
  }

  get subtitleTrack(): SubtitleTrack | null {
    return this._subtitleTrack;
  }
  set subtitleTrack(v: SubtitleTrack | null) {
    this._subtitleTrack = v;
    this._subtitleTouched = true;
    this._notify();
  }

  play(): void {
    if (this.released) return;
    this.paused = false;
    this._notify();
  }

  pause(): void {
    if (this.released) return;
    this.paused = true;
    this._notify();
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    this.paused = true;
    this._vlcRef = null;
    this._notify();
    this._listeners.clear();
    this._onChange = null;
  }

  replace(url: string): void {
    if (this.released) return;
    // Drop the old VLC ref BEFORE bumping the version so any in-flight
    // callbacks from the detached instance can no longer reach into the
    // player state. The `key={_sourceVersion}` change unmounts the old
    // <VLCPlayer> and React clears the ref on the next commit.
    this._vlcRef = null;
    this.uri = url;
    this._currentTime = 0;
    this._duration = 0;
    this._playing = false;
    this._audioTrack = null;
    this._subtitleTrack = null;
    this._audioTouched = false;
    this._subtitleTouched = false;
    this._sourceVersion += 1;
    this.paused = false;
    this._emit("statusChange", { status: "loading" });
    this._notify();
  }

  addListener<K extends keyof EventMap>(
    event: K,
    fn: (payload: EventMap[K]) => void,
  ): { remove: () => void } {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(fn as Listener);
    return {
      remove: () => {
        this._listeners.get(event)?.delete(fn as Listener);
      },
    };
  }

  _emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this._listeners.get(event);
    if (!set) return;
    set.forEach((fn) => {
      try {
        fn(payload);
      } catch {}
    });
  }

  _notify(): void {
    this._onChange?.();
  }
}

export type VideoPlayer = VideoPlayerImpl;

export function useVideoPlayer(
  uri: string,
  setup?: (p: VideoPlayer) => void,
): VideoPlayer {
  const ref = useRef<VideoPlayerImpl | null>(null);
  if (!ref.current) {
    ref.current = new VideoPlayerImpl(uri);
    try {
      setup?.(ref.current);
    } catch {}
  }
  return ref.current;
}

function contentFitToResizeMode(fit?: string): "contain" | "cover" | "fill" {
  switch (fit) {
    case "cover":
      return "cover";
    case "fill":
      return "fill";
    case "contain":
    default:
      return "contain";
  }
}

interface VideoViewProps {
  player: VideoPlayer;
  style?: StyleProp<ViewStyle>;
  contentFit?: "contain" | "cover" | "fill";
  nativeControls?: boolean;
  allowsFullscreen?: boolean;
  allowsPictureInPicture?: boolean;
}

export function VideoView({ player, style, contentFit }: VideoViewProps) {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  const vlcRef = useRef<any>(null);
  const p = player as VideoPlayerImpl;

  useEffect(() => {
    p._onChange = () => forceUpdate();
    return () => {
      if (p._onChange) p._onChange = null;
    };
  }, [p]);

  if (p.released) {
    return <View style={style} />;
  }

  // Capture the source version this render is bound to. Every event handler
  // closes over `boundVersion` and ignores callbacks if the player has since
  // replace()'d to a newer source — protects against stale events from a
  // detached VLC instance racing with the active one (common during live
  // auto-reconnect / channel-switch loops).
  const boundVersion = p._sourceVersion;
  const isStale = () => p.released || p._sourceVersion !== boundVersion;

  const bindRef = (r: any) => {
    if (p._sourceVersion !== boundVersion) return;
    vlcRef.current = r;
    p._vlcRef = r;
  };

  const audioTrackProp = p._audioTouched && p._audioTrack
    ? parseInt(p._audioTrack.id, 10)
    : undefined;

  const textTrackProp = p._subtitleTouched
    ? p._subtitleTrack
      ? parseInt(p._subtitleTrack.id, 10)
      : -1
    : undefined;

  return (
    <View style={style}>
      <VLCPlayer
        key={p._sourceVersion}
        ref={bindRef}
        source={{ uri: p.uri }}
        style={StyleSheet.absoluteFill}
        paused={p.paused}
        muted={p.muted}
        repeat={p.loop}
        autoplay={!p.paused}
        resizeMode={contentFitToResizeMode(contentFit)}
        progressUpdateInterval={Math.max(
          250,
          Math.round((p.timeUpdateEventInterval || 1) * 1000),
        )}
        {...(audioTrackProp !== undefined ? { audioTrack: audioTrackProp } : {})}
        {...(textTrackProp !== undefined ? { textTrack: textTrackProp } : {})}
        onLoadStart={() => {
          if (isStale()) return;
          p._emit("statusChange", { status: "loading" });
        }}
        onLoad={(e: any) => {
          if (isStale()) return;
          if (typeof e?.duration === "number" && e.duration > 0) {
            p._duration = e.duration / 1000;
          }
          const subs: SubtitleTrack[] = (e?.textTracks || [])
            .filter((t: any) => typeof t?.id === "number" && t.id >= 0)
            .map((t: any) => ({
              id: String(t.id),
              language: t.name || "",
              label: t.name || "",
            }));
          const auds: AudioTrack[] = (e?.audioTracks || [])
            .filter((t: any) => typeof t?.id === "number" && t.id >= 0)
            .map((t: any) => ({
              id: String(t.id),
              language: t.name || "",
              label: t.name || "",
            }));
          p._emit("availableSubtitleTracksChange", {
            availableSubtitleTracks: subs,
          });
          p._emit("availableAudioTracksChange", {
            availableAudioTracks: auds,
          });
          p._emit("statusChange", { status: "readyToPlay" });
        }}
        onPlaying={(e: any) => {
          if (isStale()) return;
          if (e?.duration && typeof e.duration === "number" && e.duration > 0) {
            p._duration = e.duration / 1000;
          }
          if (!p._playing) {
            p._playing = true;
            p._emit("playingChange", { isPlaying: true });
          }
        }}
        onProgress={(e: any) => {
          if (isStale()) return;
          if (typeof e?.currentTime === "number") {
            p._currentTime = e.currentTime / 1000;
            p._emit("timeUpdate", { currentTime: p._currentTime });
          }
          if (typeof e?.duration === "number" && e.duration > 0) {
            p._duration = e.duration / 1000;
          }
        }}
        onPaused={() => {
          if (isStale()) return;
          if (p._playing) {
            p._playing = false;
            p._emit("playingChange", { isPlaying: false });
          }
        }}
        onStopped={() => {
          if (isStale()) return;
          if (p._playing) {
            p._playing = false;
            p._emit("playingChange", { isPlaying: false });
          }
        }}
        onEnd={() => {
          if (isStale()) return;
          p._emit("playToEnd", undefined);
        }}
        onError={(e: any) => {
          if (isStale()) return;
          p._emit("statusChange", {
            status: "error",
            error: { message: e?.message || "Playback failed" },
          });
        }}
        onBuffering={() => {
          if (isStale()) return;
          if (!p._playing) {
            p._emit("statusChange", { status: "loading" });
          }
        }}
      />
    </View>
  );
}
