// Web fallback for the video-player shim. Uses a plain HTML5 <video> element
// because react-native-video v6 doesn't ship a web build. Same public API as
// the native counterpart (./video-player.tsx) so the screens don't care which
// platform they're running on.
//
// Limitations on web (acceptable — web is for testing only, TV is the target):
//   * Subtitle / audio track switching emits empty lists. Most browsers don't
//     expose multi-audio in HLS streams via HTMLMediaElement anyway.
//   * Picture-in-picture / fullscreen flags are ignored — caller manages those.
import React, { useEffect, useRef, useState } from "react";
import { StyleProp, ViewStyle, View, StyleSheet } from "react-native";

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
  _timeUpdateEventInterval = 0.25;
  _subtitleTrack: SubtitleTrack | null = null;
  _audioTrack: AudioTrack | null = null;
  _currentTime = 0;
  _duration = 0;
  _isPlaying = false;
  _lastTimeUpdateAt = 0;

  private listeners = new Map<EventName, Set<Listener>>();
  _render: (() => void) | null = null;
  _videoEl: { current: HTMLVideoElement | null } = { current: null };

  constructor(initialUrl: string | null) {
    this._src = initialUrl;
  }

  get currentTime() {
    return this._currentTime;
  }
  set currentTime(v: number) {
    this._currentTime = v;
    const el = this._videoEl.current;
    if (el) {
      try {
        el.currentTime = v;
      } catch {}
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
    const el = this._videoEl.current;
    if (el) el.muted = v;
  }
  get loop() {
    return this._loop;
  }
  set loop(v: boolean) {
    this._loop = v;
    const el = this._videoEl.current;
    if (el) el.loop = v;
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
  }
  get audioTrack() {
    return this._audioTrack;
  }
  set audioTrack(v: AudioTrack | null) {
    this._audioTrack = v;
  }

  play() {
    this._paused = false;
    const el = this._videoEl.current;
    if (el) el.play().catch(() => {});
  }
  pause() {
    this._paused = true;
    const el = this._videoEl.current;
    if (el) {
      try {
        el.pause();
      } catch {}
    }
  }
  replace(url: string | null) {
    this._src = url;
    this._currentTime = 0;
    this._duration = 0;
    this._isPlaying = false;
    this._render?.();
    this._fire("statusChange", { status: "loading", error: null });
  }
  release() {
    // Soft-release (matches native shim): the handle stays usable so the
    // hook owner can call replace()/play() again on the same instance.
    this._src = null;
    this._paused = true;
    this.listeners.clear();
    const el = this._videoEl.current;
    if (el) {
      try {
        el.pause();
        el.removeAttribute("src");
        el.load();
      } catch {}
    }
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

  const lastUrlRef = useRef(url);
  useEffect(() => {
    if (url !== lastUrlRef.current) {
      lastUrlRef.current = url;
      handle.replace(url);
    }
  }, [url, handle]);

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
}: VideoViewProps) {
  const [, force] = useState(0);
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    player._videoEl = ref;
    const fn = () => force((c) => (c + 1) | 0);
    player._render = fn;
    return () => {
      if (player._render === fn) player._render = null;
    };
  }, [player]);

  // Re-attach src on element when url changes; bind initial state
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = player._muted;
    el.loop = player._loop;
    if (player._paused) {
      try {
        el.pause();
      } catch {}
    } else {
      el.play().catch(() => {});
    }
  }, [player, player._src]);

  if (!player._src) return null;

  const objectFit: "contain" | "cover" | "fill" | "none" =
    contentFit === "fill" ? "fill" : (contentFit ?? "contain");

  return (
    <View style={[styles.wrap, style]}>
      <video
        ref={ref}
        src={player._src}
        controls={!!nativeControls}
        autoPlay={!player._paused}
        muted={player._muted}
        loop={player._loop}
        playsInline
        style={{
          width: "100%",
          height: "100%",
          objectFit,
          backgroundColor: "#000",
        }}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          if (isFinite(el.duration)) player._duration = el.duration;
          player._fire("statusChange", {
            status: "readyToPlay",
            error: null,
          });
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          player._currentTime = t;
          // Honor timeUpdateEventInterval (seconds) — HTMLMediaElement
          // fires `timeupdate` ~4×/sec by default; throttle to match the
          // native progressUpdateInterval semantics.
          const now =
            typeof performance !== "undefined" ? performance.now() : Date.now();
          const minGapMs = Math.max(50, player._timeUpdateEventInterval * 1000);
          if (now - player._lastTimeUpdateAt >= minGapMs) {
            player._lastTimeUpdateAt = now;
            player._fire("timeUpdate", { currentTime: t });
          }
        }}
        onPlay={() => {
          if (!player._isPlaying) {
            player._isPlaying = true;
            player._fire("playingChange", { isPlaying: true });
          }
        }}
        onPause={() => {
          if (player._isPlaying) {
            player._isPlaying = false;
            player._fire("playingChange", { isPlaying: false });
          }
        }}
        onEnded={() => {
          player._fire("playToEnd", {});
        }}
        onWaiting={() => {
          player._fire("statusChange", { status: "loading", error: null });
        }}
        onError={() => {
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
  wrap: { backgroundColor: "#000" },
});
