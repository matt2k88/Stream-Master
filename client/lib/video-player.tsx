// Compatibility shim that re-exports `useVideoPlayer` and `<VideoView>` with the
// same API surface as `expo-video`, but backed by `react-native-video` v6.
// This keeps the three large player files (PlayerScreen, LivePreviewScreen,
// IntroOverlay) virtually unchanged — only the import path needs to swap.
//
// Why react-native-video?
//   * Runs on the New Architecture (Fabric) without crashing on Android.
//   * Built on AndroidX Media3 / ExoPlayer with first-class HLS, DASH, MP4,
//     MPEG-TS, HEVC, AC3 / EAC3 — covers almost every IPTV codec out of the
//     box. FFmpeg extension can be enabled later in the EAS build profile if
//     specific exotic codecs (Opus-in-MP4, etc.) ever come up.
//   * Mature, actively maintained, used in production by major streaming apps.
//
// API parity notes (expo-video → react-native-video):
//   useVideoPlayer(url, setup)         →  this hook (creates a handle holding
//                                         all mutable player state).
//   <VideoView player .../>            →  this component (renders <Video> and
//                                         binds it to the handle via a ref).
//   player.play()/pause()              →  toggles `_paused` (declarative prop).
//   player.replace(url)                →  swaps `_src`, resets time/duration.
//   player.release()                   →  sets src=null → <Video> unmounts →
//                                         native player is destroyed.
//   player.currentTime get/set         →  read from onProgress, write via ref.seek().
//   player.duration                    →  read from onLoad.
//   player.muted/loop/...              →  declarative props.
//   player.subtitleTrack/audioTrack    →  selectedTextTrack/selectedAudioTrack.
//   player.timeUpdateEventInterval     →  progressUpdateInterval (s → ms).
//   player.addListener('statusChange'  →  derived from onLoad/onError/onBuffer.
//                     |'playingChange' →  onPlaybackStateChanged.
//                     |'timeUpdate'    →  onProgress.
//                     |'playToEnd'     →  onEnd.
//                     |'available...'  →  onTextTracks / onAudioTracks.
import React, { useEffect, useRef, useState } from "react";
import { StyleProp, ViewStyle } from "react-native";
import Video, { VideoRef } from "react-native-video";

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

class VideoPlayerHandle {
  _src: string | null;
  _paused = false;
  _muted = false;
  _loop = false;
  _timeUpdateEventInterval = 0.25; // seconds
  _subtitleTrack: SubtitleTrack | null = null;
  _audioTrack: AudioTrack | null = null;
  _currentTime = 0;
  _duration = 0;
  _isPlaying = false;

  private listeners = new Map<EventName, Set<Listener>>();
  // Bound by VideoView — forces the host component to re-render so the
  // declarative props on <Video> pick up the latest mutable values.
  _render: (() => void) | null = null;
  // Imperative ref to the live <Video> for seek().
  _videoRef: { current: VideoRef | null } = { current: null };

  constructor(initialUrl: string | null) {
    this._src = initialUrl;
  }

  get currentTime() {
    return this._currentTime;
  }
  set currentTime(v: number) {
    this._currentTime = v;
    try {
      this._videoRef.current?.seek(v);
    } catch {}
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
    this._render?.();
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
    this._render?.();
    this._fire("statusChange", { status: "loading", error: null });
  }
  release() {
    // Soft-release: drop the source so <Video> unmounts and the native
    // player tears down, and clear listeners so any late-fire events from
    // the dying native instance are ignored. The handle itself stays
    // usable — PlayerScreen sometimes calls release() and then immediately
    // replace()/play() on the same component instance via navigation.replace.
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

  // expo-video reloads the source when the URL prop to useVideoPlayer changes;
  // mirror that behaviour so the existing screens don't have to call replace()
  // on every navigation.
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
  nativeControls,
  allowsPictureInPicture,
}: VideoViewProps) {
  const [, force] = useState(0);
  const ref = useRef<VideoRef | null>(null);

  useEffect(() => {
    player._videoRef = ref;
    const fn = () => force((c) => (c + 1) | 0);
    player._render = fn;
    return () => {
      if (player._render === fn) player._render = null;
    };
  }, [player]);

  const resizeMode: "contain" | "cover" | "stretch" | "none" =
    contentFit === "cover"
      ? "cover"
      : contentFit === "fill"
        ? "stretch"
        : contentFit === "none"
          ? "none"
          : "contain";

  const selectedTextTrack: any = player._subtitleTrack
    ? { type: "index", value: player._subtitleTrack._index ?? 0 }
    : { type: "disabled" };
  const selectedAudioTrack: any =
    player._audioTrack != null
      ? { type: "index", value: player._audioTrack._index ?? 0 }
      : undefined;

  if (!player._src) return null;

  // The shim bridges loosely-typed handle state to react-native-video's strict
  // prop types; cast at the boundary rather than fighting per-callback typings.
  const VideoAny = Video as unknown as React.ComponentType<any>;

  return (
    <VideoAny
      ref={ref as any}
      source={{ uri: player._src }}
      style={style as any}
      paused={player._paused}
      muted={player._muted}
      repeat={player._loop}
      resizeMode={resizeMode}
      controls={!!nativeControls}
      pictureInPicture={!!allowsPictureInPicture}
      progressUpdateInterval={Math.max(
        50,
        player._timeUpdateEventInterval * 1000,
      )}
      selectedTextTrack={selectedTextTrack}
      selectedAudioTrack={selectedAudioTrack}
      onLoad={(d: any) => {
        if (typeof d?.duration === "number" && isFinite(d.duration)) {
          player._duration = d.duration;
        }
        player._fire("statusChange", { status: "readyToPlay", error: null });
        // Many streams deliver track lists in the load payload (rather than
        // a separate onTextTracks/onAudioTracks event). Surface them here
        // so the CC/audio panels populate immediately on first play.
        const textList = d?.textTracks;
        if (Array.isArray(textList) && textList.length > 0) {
          const tracks: SubtitleTrack[] = textList.map((t: any, i: number) => ({
            id: String(t.index ?? i),
            label: t.title || t.language || `Subtitle ${t.index ?? i + 1}`,
            language: t.language || "",
            _index: typeof t.index === "number" ? t.index : i,
          }));
          player._fire("availableSubtitleTracksChange", {
            availableSubtitleTracks: tracks,
          });
        }
        const audioList = d?.audioTracks;
        if (Array.isArray(audioList) && audioList.length > 0) {
          const tracks: AudioTrack[] = audioList.map((t: any, i: number) => ({
            id: String(t.index ?? i),
            label: t.title || t.language || `Audio ${t.index ?? i + 1}`,
            language: t.language || "",
            _index: typeof t.index === "number" ? t.index : i,
          }));
          player._fire("availableAudioTracksChange", {
            availableAudioTracks: tracks,
          });
        }
      }}
      onProgress={(d: any) => {
        if (typeof d?.currentTime === "number") {
          player._currentTime = d.currentTime;
          player._fire("timeUpdate", { currentTime: d.currentTime });
        }
      }}
      onError={(e: any) => {
        const msg =
          e?.error?.errorString ||
          e?.error?.localizedDescription ||
          e?.errorString ||
          "Playback error";
        player._fire("statusChange", {
          status: "error",
          error: { message: msg },
        });
      }}
      onBuffer={(d: any) => {
        if (d?.isBuffering) {
          player._fire("statusChange", { status: "loading", error: null });
        }
      }}
      onEnd={() => {
        player._fire("playToEnd", {});
      }}
      onPlaybackStateChanged={(d: any) => {
        if (typeof d?.isPlaying === "boolean") {
          if (player._isPlaying !== d.isPlaying) {
            player._isPlaying = d.isPlaying;
            player._fire("playingChange", { isPlaying: d.isPlaying });
          }
        }
      }}
      onTextTracks={(d: any) => {
        const list = d?.textTracks ?? [];
        const tracks: SubtitleTrack[] = list.map((t: any, i: number) => ({
          id: String(t.index ?? i),
          label: t.title || t.language || `Subtitle ${t.index ?? i + 1}`,
          language: t.language || "",
          _index: typeof t.index === "number" ? t.index : i,
        }));
        player._fire("availableSubtitleTracksChange", {
          availableSubtitleTracks: tracks,
        });
      }}
      onAudioTracks={(d: any) => {
        const list = d?.audioTracks ?? [];
        const tracks: AudioTrack[] = list.map((t: any, i: number) => ({
          id: String(t.index ?? i),
          label: t.title || t.language || `Audio ${t.index ?? i + 1}`,
          language: t.language || "",
          _index: typeof t.index === "number" ? t.index : i,
        }));
        player._fire("availableAudioTracksChange", {
          availableAudioTracks: tracks,
        });
      }}
    />
  );
}
