// Dual-engine video player shim.
//
// Exposes the expo-video API surface (useVideoPlayer + VideoView) but
// dispatches to one of two underlying engines based on the user's
// per-device preference (PlayerEngineContext + AsyncStorage):
//
//   - "expo" : expo-video (Google Media3 / AVFoundation, default)
//   - "rnv"  : react-native-video v6 (also Media3 / AVFoundation but a
//              different wrapper with different config knobs — custom
//              HTTP headers, granular buffer config, decoder fallback)
//
// Web always uses expo-video. The engine is captured per-player on
// first render via useState init so it stays stable for the lifetime
// of any given player instance (no rules-of-hooks violation).
//
// Consumer screens (PlayerScreen, LivePreviewScreen, IntroOverlay)
// keep importing from "@/lib/video-player" with no API changes.

import React, { useEffect, useReducer, useRef, useState } from "react";
import { Platform } from "react-native";
import * as ExpoVideo from "expo-video";
import { getActiveEngine } from "@/contexts/PlayerEngineContext";

// Hoisted lazy require — resolved once on first import of this module on
// native, never touched on web (we never reach the rnv branch on web).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _RnvVideo: any = null;
function getRnvVideo() {
  if (_RnvVideo) return _RnvVideo;
  if (Platform.OS === "web") return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  _RnvVideo = require("react-native-video").default;
  return _RnvVideo;
}

export type SubtitleTrack = ExpoVideo.SubtitleTrack;
export type AudioTrack = ExpoVideo.AudioTrack;
export type VideoPlayer = any;

type Listener = (e: any) => void;

// ─── react-native-video shim ────────────────────────────────────────────────
class RnvPlayerImpl {
  __engine = "rnv" as const;

  // Surface state (read by VideoView as React props on <Video>)
  source: { uri: string };
  paused = false;
  muted = false;
  loop = false;
  _timeIntervalSec = 0.25; // expo-video uses seconds; rnv uses ms
  _selectedSubtitle: SubtitleTrack | null = null;
  _selectedAudio: AudioTrack | null = null;

  // Reported state (written by VideoView callbacks)
  _currentTime = 0;
  _duration = 0;
  _playing = false;
  _subtitleTracks: SubtitleTrack[] = [];
  _audioTracks: AudioTrack[] = [];

  // Wiring
  _videoRef: React.MutableRefObject<any> | null = null;
  _subscribers = new Set<() => void>();
  _listeners = new Map<string, Set<Listener>>();
  _released = false;
  // Bump every time `source` changes so VideoView can force-recreate the
  // underlying <Video> (clean way to drop the old MediaCodec session).
  _sourceVersion = 0;

  constructor(uri: string) {
    this.source = { uri };
  }

  // ─ public expo-video-shaped API ─
  play() {
    this.paused = false;
    this._notify();
  }

  pause() {
    this.paused = true;
    this._notify();
  }

  release() {
    this._released = true;
    this._listeners.clear();
    this._subscribers.clear();
  }

  replace(uri: string) {
    this.source = { uri };
    this._sourceVersion++;
    this._currentTime = 0;
    this._duration = 0;
    this._playing = false;
    this._subtitleTracks = [];
    this._audioTracks = [];
    this._selectedSubtitle = null;
    this._selectedAudio = null;
    this.paused = false;
    this._notify();
  }

  get currentTime() {
    return this._currentTime;
  }
  set currentTime(v: number) {
    this._currentTime = v;
    try {
      this._videoRef?.current?.seek?.(v);
    } catch {
      // best-effort
    }
  }

  get duration() {
    return this._duration;
  }
  get playing() {
    return this._playing;
  }

  get timeUpdateEventInterval() {
    return this._timeIntervalSec;
  }
  set timeUpdateEventInterval(v: number) {
    this._timeIntervalSec = v;
    this._notify();
  }

  get subtitleTrack() {
    return this._selectedSubtitle;
  }
  set subtitleTrack(t: SubtitleTrack | null) {
    this._selectedSubtitle = t;
    this._notify();
  }

  get audioTrack() {
    return this._selectedAudio;
  }
  set audioTrack(t: AudioTrack | null) {
    this._selectedAudio = t;
    this._notify();
  }

  // ─ event API (mirrors expo-video) ─
  addListener(event: string, fn: Listener) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event)!.add(fn);
    return {
      remove: () => {
        this._listeners.get(event)?.delete(fn);
      },
    };
  }

  // ─ internal ─
  _emit(event: string, payload: any) {
    if (this._released) return;
    const set = this._listeners.get(event);
    if (!set) return;
    set.forEach((fn) => {
      try {
        fn(payload);
      } catch {
        // listener errors must not crash playback
      }
    });
  }

  _subscribe(cb: () => void) {
    this._subscribers.add(cb);
    return () => {
      this._subscribers.delete(cb);
    };
  }

  _notify() {
    this._subscribers.forEach((cb) => {
      try {
        cb();
      } catch {
        // best-effort
      }
    });
  }
}

interface RnvVideoViewProps {
  player: RnvPlayerImpl;
  style?: any;
  contentFit?: "contain" | "cover" | "fill";
  nativeControls?: boolean;
  // Accept (and ignore) the expo-video-only props so callers don't have to branch
  allowsFullscreen?: boolean;
  allowsPictureInPicture?: boolean;
  [k: string]: any;
}

function RnvVideoView({ player, style, contentFit, nativeControls }: RnvVideoViewProps) {
  // Force-rerender when player props change
  const [, force] = useReducer((x) => x + 1, 0);
  const videoRef = useRef<any>(null);
  const Video = getRnvVideo();

  useEffect(() => {
    player._videoRef = videoRef;
    const unsub = player._subscribe(() => force());
    return () => {
      if (player._videoRef === videoRef) player._videoRef = null;
      unsub();
    };
  }, [player]);

  const resizeMode =
    contentFit === "cover" ? "cover" : contentFit === "fill" ? "stretch" : "contain";

  // Build rnv track-selection objects from the shim's selected track.
  // We look up by id first (stable across a single onLoad), but fall back
  // to language if onLoad fired more than once and reshuffled the indices
  // — keeps the user's chosen audio/subtitle pinned across HLS variant
  // switches that re-emit the track list.
  const lookup = <T extends { id: string; language?: string | null }>(
    list: T[],
    sel: T | null,
  ): number => {
    if (!sel) return -1;
    const byId = list.findIndex((t) => t.id === sel.id);
    if (byId >= 0) return byId;
    if (sel.language) {
      const byLang = list.findIndex((t) => t.language === sel.language);
      if (byLang >= 0) return byLang;
    }
    return -1;
  };
  const subIdx = lookup(player._subtitleTracks, player._selectedSubtitle);
  const audIdx = lookup(player._audioTracks, player._selectedAudio);

  return (
    <Video
      // Re-mounting on source change forces a clean MediaCodec teardown,
      // which has been more reliable than relying on rnv to swap sources
      // in-place (Firestick especially can leak the old surface).
      key={`src-${player._sourceVersion}`}
      ref={videoRef}
      source={player.source}
      paused={player.paused}
      muted={player.muted}
      repeat={player.loop}
      style={style}
      resizeMode={resizeMode}
      controls={!!nativeControls}
      progressUpdateInterval={Math.max(100, Math.round(player._timeIntervalSec * 1000))}
      // Try to recover from transient network blips instead of erroring out;
      // PlayerScreen has its own retry loop layered on top.
      disableDisconnectError={true}
      // Default to texture surface — seems to play nicer on Android TV
      // when re-mounting around fullscreen transitions.
      useTextureView={true}
      selectedTextTrack={
        subIdx >= 0 ? { type: "index", value: subIdx } : { type: "disabled" }
      }
      selectedAudioTrack={
        audIdx >= 0 ? { type: "index", value: audIdx } : undefined
      }
      onLoadStart={() => player._emit("statusChange", { status: "loading" })}
      onLoad={(d: any) => {
        player._duration = typeof d?.duration === "number" ? d.duration : 0;
        const audio: SubtitleTrack[] = Array.isArray(d?.audioTracks)
          ? d.audioTracks.map((t: any, i: number) => ({
              id: String(i),
              label: t?.title || t?.language || `Audio ${i + 1}`,
              language: t?.language ?? null,
            }))
          : [];
        const text: SubtitleTrack[] = Array.isArray(d?.textTracks)
          ? d.textTracks.map((t: any, i: number) => ({
              id: String(i),
              label: t?.title || t?.language || `Subtitle ${i + 1}`,
              language: t?.language ?? null,
            }))
          : [];
        player._audioTracks = audio as any;
        player._subtitleTracks = text as any;
        player._emit("availableAudioTracksChange", { availableAudioTracks: audio });
        player._emit("availableSubtitleTracksChange", { availableSubtitleTracks: text });
        player._emit("statusChange", { status: "readyToPlay" });
      }}
      onProgress={(d: any) => {
        if (typeof d?.currentTime === "number") {
          player._currentTime = d.currentTime;
          player._emit("timeUpdate", { currentTime: d.currentTime });
        }
      }}
      onPlaybackStateChanged={(d: any) => {
        const isPlaying = !!d?.isPlaying;
        if (isPlaying !== player._playing) {
          player._playing = isPlaying;
          player._emit("playingChange", { isPlaying });
        }
      }}
      onError={(e: any) => {
        const msg =
          e?.error?.errorString ||
          e?.error?.localizedDescription ||
          e?.errorString ||
          "Playback error";
        player._emit("statusChange", { status: "error", error: { message: msg } });
      }}
      onEnd={() => player._emit("playToEnd", {})}
      onBuffer={(d: any) => {
        if (d?.isBuffering) {
          player._emit("statusChange", { status: "loading" });
        }
      }}
    />
  );
}

// ─── Public hooks / components ──────────────────────────────────────────────
export function useVideoPlayer(uri: string, setup?: (p: any) => void) {
  // Capture engine ONCE per player instance via useState init. This locks
  // the engine for the lifetime of this component instance, so the conditional
  // hook call below always takes the same branch on every re-render of the
  // same instance — satisfying React's rules-of-hooks at runtime.
  const [engine] = useState<"expo" | "rnv">(() =>
    Platform.OS === "web" ? "expo" : getActiveEngine(),
  );

  if (engine === "rnv") {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const playerRef = useRef<RnvPlayerImpl | null>(null);
    if (!playerRef.current) {
      playerRef.current = new RnvPlayerImpl(uri);
      try {
        setup?.(playerRef.current as any);
      } catch {
        // setup errors must not crash construction
      }
    }
    return playerRef.current as any;
  }

  // expo-video path
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const player = ExpoVideo.useVideoPlayer(uri, setup as any);
  (player as any).__engine = "expo";
  return player as any;
}

export function VideoView(props: any) {
  const { player } = props;
  if (player?.__engine === "rnv") {
    return <RnvVideoView {...props} />;
  }
  return <ExpoVideo.VideoView {...props} />;
}
