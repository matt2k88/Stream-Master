// Compatibility shim that re-exports `useVideoPlayer` and `<VideoView>` with
// the same API surface as `expo-video`, but backed by libVLC via
// `react-native-vlc-media-player`. PlayerScreen / LivePreviewScreen /
// IntroOverlay continue to import from "@/lib/video-player" — they don't
// know or care that the engine swapped underneath.
//
// Why VLC?
//   * Decodes literally every codec & container that matters for IPTV out
//     of the box: H.264/H.265, AC3/EAC3, DTS, MPEG-2 audio + video, Opus,
//     FLAC, raw MPEG-TS, exotic HLS variants, RTSP/RTMP. No FFmpeg
//     extension to wire up, no Media3 limitations, no codec patches.
//   * Battle-tested on Android TV in dozens of IPTV apps.
//   * Trade-offs accepted by the user: ~30-40MB APK growth, no React
//     Native New Architecture support (so app.json sets newArchEnabled=false).
//
// API parity notes (expo-video → react-native-vlc-media-player):
//   useVideoPlayer(url, setup)        →  this hook (creates a handle).
//   <VideoView player .../>           →  this component (renders <VLCPlayer>).
//   player.play()/pause()             →  toggles `paused` declarative prop.
//   player.replace(url)               →  swaps `_src`, resets time/duration.
//   player.release()                  →  stopPlayer() + drop src so the
//                                        native view unmounts.
//   player.currentTime get/set        →  read from onProgress (ms→s);
//                                        write via seek() as fraction (0..1).
//   player.duration                   →  read from onLoad (ms→s).
//   player.muted/loop/...             →  declarative props.
//   player.subtitleTrack/audioTrack   →  textTrack/audioTrack id props.
//   player.timeUpdateEventInterval    →  ignored — VLC fires ~4×/s natively.
//   player.addListener('statusChange'  → derived from onPlaying/onError/onBuffering.
//                     |'playingChange' → onPlaying/onPaused/onStopped.
//                     |'timeUpdate'    → onProgress.
//                     |'playToEnd'     → onEnd.
//                     |'available...'  → onLoad.audioTracks/textTracks.
import React, { useEffect, useRef, useState } from "react";
import { StyleProp, ViewStyle, View, StyleSheet } from "react-native";
import { VLCPlayer } from "react-native-vlc-media-player";

export type SubtitleTrack = {
  id: string;
  label: string;
  language: string;
  _index?: number;
};

export type AudioTrack = {
  id: string;
  label: string;
  language: string;
  _index?: number;
};

type EventName =
  | "statusChange"
  | "playingChange"
  | "timeUpdate"
  | "playToEnd"
  | "availableSubtitleTracksChange"
  | "availableAudioTracksChange";

type Listener = (e: any) => void;

// VLC's onProgress / onLoad return values in milliseconds. Convert to
// seconds at the shim boundary so callers (which were written against
// expo-video's seconds-based API) don't have to think about units.
const msToSec = (ms: number) => (typeof ms === "number" ? ms / 1000 : 0);

class VideoPlayerHandle {
  _src: string | null;
  _paused = false;
  _muted = false;
  _loop = false;
  _timeUpdateEventInterval = 0.25; // unused — VLC fires natively
  _subtitleTrack: SubtitleTrack | null = null;
  _audioTrack: AudioTrack | null = null;
  _currentTime = 0; // seconds
  _duration = 0; // seconds
  _isPlaying = false;

  // Pending seek (in fraction 0..1) that VideoView consumes once on
  // each render and clears. We bump a token so identical seeks (e.g.
  // "back to 0") still get propagated to the native side.
  _seekFraction: number | null = null;
  _seekToken = 0;

  private listeners = new Map<EventName, Set<Listener>>();
  // Bound by VideoView — forces a re-render so declarative props on
  // <VLCPlayer> pick up the latest mutable values.
  _render: (() => void) | null = null;
  // Imperative ref to the live <VLCPlayer> for stopPlayer().
  _vlcRef: { current: any } = { current: null };

  constructor(initialUrl: string | null) {
    this._src = initialUrl;
  }

  get currentTime() {
    return this._currentTime;
  }
  set currentTime(v: number) {
    this._currentTime = v;
    // VLC's seek prop expects a fraction of total duration. Without a
    // known duration there's nothing meaningful to seek to.
    if (this._duration > 0) {
      const frac = Math.max(0, Math.min(1, v / this._duration));
      this._seekFraction = frac;
      this._seekToken = (this._seekToken + 1) | 0;
      this._render?.();
    }
  }
  get duration() {
    return this._duration;
  }
  get muted() {
    return this._muted;
  }
  set muted(v: boolean) {
    this._muted = v;
    this._render?.();
  }
  get loop() {
    return this._loop;
  }
  set loop(v: boolean) {
    this._loop = v;
    this._render?.();
  }
  get timeUpdateEventInterval() {
    return this._timeUpdateEventInterval;
  }
  set timeUpdateEventInterval(v: number) {
    this._timeUpdateEventInterval = v;
  }
  get subtitleTrack() {
    return this._subtitleTrack;
  }
  set subtitleTrack(v: SubtitleTrack | null) {
    this._subtitleTrack = v;
    this._render?.();
  }
  get audioTrack() {
    return this._audioTrack;
  }
  set audioTrack(v: AudioTrack | null) {
    this._audioTrack = v;
    this._render?.();
  }

  play() {
    this._paused = false;
    this._render?.();
  }
  pause() {
    this._paused = true;
    this._render?.();
  }
  replace(url: string | null) {
    this._src = url;
    this._currentTime = 0;
    this._duration = 0;
    this._subtitleTrack = null;
    this._audioTrack = null;
    this._isPlaying = false;
    this._seekFraction = null;
    this._render?.();
    this._fire("statusChange", { status: "loading", error: null });
  }
  release() {
    // Soft-release: stop native playback, drop the source so <VLCPlayer>
    // unmounts, and clear listeners so any late-fire events from the
    // dying native instance are ignored. The handle stays usable.
    try {
      this._vlcRef.current?.stopPlayer?.();
    } catch {}
    this._src = null;
    this._paused = true;
    this.listeners.clear();
    this._render?.();
  }

  addListener(event: EventName, cb: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return {
      remove: () => {
        this.listeners.get(event)?.delete(cb);
      },
    };
  }

  _fire(event: EventName, payload: any) {
    this.listeners.get(event)?.forEach((l) => {
      try {
        l(payload);
      } catch {}
    });
  }

  _setIsPlaying(v: boolean) {
    if (this._isPlaying !== v) {
      this._isPlaying = v;
      this._fire("playingChange", { isPlaying: v });
    }
  }
}

export type VideoPlayer = VideoPlayerHandle;

export function useVideoPlayer(
  url: string | null,
  setup?: (p: VideoPlayerHandle) => void,
) {
  const handleRef = useRef<VideoPlayerHandle | null>(null);
  if (handleRef.current === null) {
    handleRef.current = new VideoPlayerHandle(url);
    try {
      setup?.(handleRef.current);
    } catch {}
  }
  const handle = handleRef.current;

  // Mirror expo-video: when the URL prop changes, swap the source.
  const lastUrlRef = useRef(url);
  useEffect(() => {
    if (url !== lastUrlRef.current) {
      lastUrlRef.current = url;
      handle.replace(url);
    }
  }, [url, handle]);

  // Cleanup on unmount — release the player & kill the underlying connection.
  useEffect(() => {
    return () => {
      handle.release();
    };
  }, [handle]);

  return handle;
}

interface VideoViewProps {
  player: VideoPlayerHandle;
  style?: StyleProp<ViewStyle>;
  contentFit?: "contain" | "cover" | "fill" | "none";
  nativeControls?: boolean;
  allowsFullscreen?: boolean;
  allowsPictureInPicture?: boolean;
}

export function VideoView({
  player,
  style,
  contentFit = "contain",
}: VideoViewProps) {
  const [, force] = useState(0);
  const ref = useRef<any>(null);
  // Track which seek token we've consumed so we don't re-seek on every render.
  const lastSeekTokenRef = useRef(-1);

  useEffect(() => {
    player._vlcRef = ref;
    const fn = () => force((c) => (c + 1) | 0);
    player._render = fn;
    return () => {
      if (player._render === fn) player._render = null;
    };
  }, [player]);

  // Apply pending seek imperatively (VLC's seek prop is read on mount
  // only; setNativeProps via the ref is the reliable runtime path).
  useEffect(() => {
    if (player._seekFraction == null) return;
    if (lastSeekTokenRef.current === player._seekToken) return;
    lastSeekTokenRef.current = player._seekToken;
    try {
      ref.current?.seek?.(player._seekFraction);
    } catch {}
  });

  const resizeMode: "contain" | "cover" | "fill" | "none" =
    contentFit === "cover"
      ? "cover"
      : contentFit === "fill"
        ? "fill"
        : contentFit === "none"
          ? "none"
          : "contain";

  if (!player._src) return null;

  const VLCAny = VLCPlayer as unknown as React.ComponentType<any>;

  return (
    <View style={[styles.wrap, style]}>
      <VLCAny
        ref={ref}
        style={StyleSheet.absoluteFill as any}
        source={{ uri: player._src, initOptions: ["--network-caching=1500"] }}
        paused={player._paused}
        muted={player._muted}
        repeat={player._loop}
        autoplay={!player._paused}
        resizeMode={resizeMode}
        audioTrack={
          player._audioTrack?._index != null
            ? player._audioTrack._index
            : undefined
        }
        textTrack={
          player._subtitleTrack?._index != null
            ? player._subtitleTrack._index
            : -1 /* disabled */
        }
        onLoad={(d: any) => {
          if (typeof d?.duration === "number") {
            player._duration = msToSec(d.duration);
          }
          player._fire("statusChange", { status: "readyToPlay", error: null });

          const audioList = d?.audioTracks;
          if (Array.isArray(audioList) && audioList.length > 0) {
            const tracks: AudioTrack[] = audioList.map((t: any, i: number) => ({
              id: String(t.id ?? i),
              label: t.name || `Audio ${i + 1}`,
              language: "",
              _index: typeof t.id === "number" ? t.id : i,
            }));
            player._fire("availableAudioTracksChange", {
              availableAudioTracks: tracks,
            });
          }
          const textList = d?.textTracks;
          if (Array.isArray(textList) && textList.length > 0) {
            const tracks: SubtitleTrack[] = textList.map(
              (t: any, i: number) => ({
                id: String(t.id ?? i),
                label: t.name || `Subtitle ${i + 1}`,
                language: "",
                _index: typeof t.id === "number" ? t.id : i,
              }),
            );
            player._fire("availableSubtitleTracksChange", {
              availableSubtitleTracks: tracks,
            });
          }
        }}
        onProgress={(d: any) => {
          if (typeof d?.duration === "number" && d.duration > 0) {
            player._duration = msToSec(d.duration);
          }
          if (typeof d?.currentTime === "number") {
            const t = msToSec(d.currentTime);
            player._currentTime = t;
            player._fire("timeUpdate", { currentTime: t });
          }
        }}
        onPlaying={() => {
          player._setIsPlaying(true);
          player._fire("statusChange", { status: "readyToPlay", error: null });
        }}
        onPaused={() => {
          player._setIsPlaying(false);
        }}
        onStopped={() => {
          player._setIsPlaying(false);
        }}
        onBuffering={() => {
          player._fire("statusChange", { status: "loading", error: null });
        }}
        onEnd={() => {
          player._setIsPlaying(false);
          player._fire("playToEnd", {});
        }}
        onError={(e: any) => {
          player._fire("statusChange", {
            status: "error",
            error: { message: "Playback error" },
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: "#000", overflow: "hidden" },
});
