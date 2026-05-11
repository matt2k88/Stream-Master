// Single-engine video player shim around react-native-video v6 on native,
// expo-video on web (rnv has no usable web target).
//
// Why rnv on native: the FFmpeg software audio decoders (AC3 / EAC3 /
// DTS / MP2) needed to play certain IPTV streams on Firestick are
// loaded by ExoPlayer's DefaultRenderersFactory in PREFER extension
// mode. react-native-video constructs the renderers factory itself
// and hardcodes EXTENSION_RENDERER_MODE_OFF — which we patch to
// PREFER via the plugins/withFfmpegAudioRenderer.js Expo config
// plugin during prebuild. expo-video doesn't expose the renderers
// factory at all, so it can't be made to use FFmpeg audio.
//
// The rnv shim below mirrors the expo-video API surface that
// PlayerScreen / LivePreviewScreen / IntroOverlay use, so consumers
// don't need to know which engine is active.
//
// Web always uses expo-video (rnv has no web build).

import React, { useEffect, useReducer, useRef } from "react";
import { Platform } from "react-native";
import * as ExpoVideo from "expo-video";

// Hoisted lazy require — resolved once on first import on native,
// never touched on web (we never reach the rnv branch on web).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _RnvVideo: any = null;
function getRnvVideo() {
  if (_RnvVideo) return _RnvVideo;
  if (Platform.OS === "web") return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  _RnvVideo = require("react-native-video").default;
  return _RnvVideo;
}

const USE_RNV = Platform.OS !== "web";

export type SubtitleTrack = ExpoVideo.SubtitleTrack;
export type AudioTrack = ExpoVideo.AudioTrack;
export type VideoPlayer = any;

type Listener = (e: any) => void;

// ─── react-native-video shim ────────────────────────────────────────────────
class RnvPlayerImpl {
  __engine = "rnv" as const;

  source: { uri: string };
  paused = false;
  muted = false;
  loop = false;
  _timeIntervalSec = 0.25;
  _selectedSubtitle: SubtitleTrack | null = null;
  _selectedAudio: AudioTrack | null = null;

  _currentTime = 0;
  _duration = 0;
  _playing = false;
  _subtitleTracks: SubtitleTrack[] = [];
  _audioTracks: AudioTrack[] = [];

  _videoRef: React.MutableRefObject<any> | null = null;
  _subscribers = new Set<() => void>();
  _listeners = new Map<string, Set<Listener>>();
  _released = false;
  _sourceVersion = 0;

  constructor(uri: string) {
    this.source = { uri };
  }

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

  addListener(event: string, fn: Listener) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event)!.add(fn);
    return {
      remove: () => {
        this._listeners.get(event)?.delete(fn);
      },
    };
  }

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
  allowsFullscreen?: boolean;
  allowsPictureInPicture?: boolean;
  [k: string]: any;
}

function RnvVideoView({ player, style, contentFit, nativeControls }: RnvVideoViewProps) {
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

  // Track lookup with id-first, language-fallback so HLS variant switches
  // that re-emit the track list don't lose the user's selection.
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
      disableDisconnectError={true}
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
        const audio: AudioTrack[] = Array.isArray(d?.audioTracks)
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
        player._audioTracks = audio;
        player._subtitleTracks = text;
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
  if (USE_RNV) {
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

  // Web — expo-video
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
