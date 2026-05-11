// Native (iOS / Android / Fire TV) player shim.
//
// Bridges react-native-vlc-media-player behind an expo-video-shaped API
// so consumer screens (PlayerScreen, LivePreviewScreen, IntroOverlay)
// don't have to know which engine is underneath.
//
// Why VLC?
//   expo-video (Media3) is rock-solid on Fire TV but ships without
//   AC3/EAC3 audio and a few exotic raw MPEG-TS variants, so a small
//   number of IPTV channels with surround audio can't play. VLC covers
//   essentially every IPTV codec / container in existence.
//
// Why a shim?
//   expo-video uses a hook + imperative-player API:
//     const player = useVideoPlayer(url, p => p.play());
//     <VideoView player={player} />
//     player.replace(newUrl); player.currentTime = 30; player.pause();
//   VLC ships a pure-component, prop-driven API. Bridging the two means
//   the consumer screens stay identical and we can swap engines again
//   later without touching them.
//
// Web is handled separately by `video-player.web.tsx`, which transparently
// falls back to expo-video so the dev preview keeps working.
//
// Keep-awake: the app already calls `useKeepAwake()` at the App root, so
// the device won't fall asleep mid-playback regardless of which engine
// is active. No engine-specific work needed.

import React, { useEffect, useReducer, useRef } from "react";
import { Platform, View, StyleProp, ViewStyle } from "react-native";
// @ts-ignore — package ships a CJS index without ESM types
import * as VlcPkg from "react-native-vlc-media-player";
import {
  useVideoPlayer as useExpoVideoPlayer,
  VideoView as ExpoVideoView,
  type VideoPlayer as ExpoVideoPlayer,
} from "expo-video";

export type PlayerEngine = "vlc" | "expo";

const VLCPlayer: any =
  (VlcPkg as any).VLCPlayer ??
  (VlcPkg as any).default?.VLCPlayer ??
  (VlcPkg as any).default ??
  VlcPkg;

// ─── Public types (compat with expo-video) ────────────────────────────────
export type SubtitleTrack = {
  id: number;
  label: string;
  language?: string;
};

export type AudioTrack = {
  id: number;
  label: string;
  language?: string;
};

type Listener = (payload: any) => void;
type Subscription = { remove: () => void };

// Default VLC init options. Lower the network buffer a bit so live
// channel switches feel snappier than VLC's 1500ms default.
const DEFAULT_INIT_OPTIONS = ["--network-caching=300"];

// ─── Player bridge ────────────────────────────────────────────────────────
//
// Carries the engine state and is the object handed back from
// `useVideoPlayer`. Consumer code mutates simple properties on it
// (`player.muted = false`, `player.currentTime = 30`, `player.play()`)
// and the attached `<VideoView>` re-renders the underlying VLCPlayer
// with the new props. Events from VLC are forwarded back through the
// internal event bus, exposed via `addListener()`.

export class VideoPlayer {
  // ── Public read-only state ──────────────────────────────────────────────
  playing: boolean = false;
  duration: number = 0; // seconds
  // ── Internal state mirrored to <VLCPlayer> props ────────────────────────
  /** @internal */ _source: { uri: string; initOptions: string[] } = {
    uri: "",
    initOptions: [...DEFAULT_INIT_OPTIONS],
  };
  /** @internal */ _paused: boolean = true;
  /** @internal */ _muted: boolean = false;
  /** @internal */ _loop: boolean = false;
  /** @internal */ _audioTrackId: number | undefined;
  /** @internal */ _textTrackId: number | undefined;
  /** @internal */ _currentTime: number = 0;
  /** @internal */ _pendingSeekFrac: number | null = null;
  /** @internal — resume-seek queued before VLC is actually seekable (seconds) */
  _pendingResumeSeconds: number | null = null;
  /** @internal — set true on first real onProgress; gates safe seeking */
  _hasProgressed: boolean = false;
  /** @internal */ _released: boolean = false;
  /** @internal — wall-clock ms when the last seek was dispatched */
  _lastSeekAtMs: number = 0;
  /** @internal — last seek target in seconds (for snap-back detection) */
  _lastSeekTargetSec: number = -1;
  /** @internal — VideoView re-issues paused=false after this flips */
  _needsPlayKick: boolean = false;

  // Event bus
  private listeners = new Map<string, Set<Listener>>();
  // VideoView subscriber — triggers a re-render when state changes
  private rerender: () => void = () => {};

  // ── Setters that need a re-render ──────────────────────────────────────
  get muted() { return this._muted; }
  set muted(v: boolean) { if (this._muted !== v) { this._muted = v; this.rerender(); } }

  get loop() { return this._loop; }
  set loop(v: boolean) { if (this._loop !== v) { this._loop = v; this.rerender(); } }

  // currentTime is read-as-current-position, written-as-seek.
  // VLC is only reliably seekable AFTER it has actually started decoding
  // (i.e. emitted at least one onProgress with currentTime > 0).
  // Seeking before that — which is exactly what PlayerScreen does for
  // "Continue Watching" / resume-from-saved-position — leaves VLC in
  // an infinite-buffering state. So we queue any seek that happens
  // before the first real progress tick and flush it from _onProgress.
  get currentTime() { return this._currentTime; }
  set currentTime(seconds: number) {
    if (!isFinite(seconds) || seconds < 0) return;
    if (this._hasProgressed && this.duration > 0) {
      this._pendingSeekFrac = Math.min(1, seconds / this.duration);
      this._currentTime = seconds;
      this._lastSeekTargetSec = seconds;
      this._lastSeekAtMs = Date.now();
      this._needsPlayKick = true;
      this._pendingResumeSeconds = null;
      this.rerender();
    } else {
      // Defer until VLC is actually seekable.
      this._pendingResumeSeconds = seconds;
    }
  }

  set subtitleTrack(t: SubtitleTrack | null) {
    // -1 disables text tracks in VLC
    this._textTrackId = t ? t.id : -1;
    this.rerender();
  }
  get subtitleTrack(): SubtitleTrack | null {
    return null; // expo-video also doesn't expose a robust getter; consumer tracks selection in state
  }

  set audioTrack(t: AudioTrack | null) {
    if (t) this._audioTrackId = t.id;
    this.rerender();
  }
  get audioTrack(): AudioTrack | null {
    return null;
  }

  // No-op for compat with PlayerScreen (which sets this on expo-video).
  // VLC fires onProgress at ~250ms anyway.
  set timeUpdateEventInterval(_n: number) {}
  get timeUpdateEventInterval() { return 1; }

  // ── Imperative methods ─────────────────────────────────────────────────
  play() {
    if (this._released) return;
    if (!this._paused) return;
    this._paused = false;
    this.rerender();
  }

  pause() {
    if (this._paused) return;
    this._paused = true;
    this.rerender();
  }

  /** Swap the source URL and immediately start playing it. */
  replace(uri: string) {
    if (this._released) return;
    this._source = { uri: uri ?? "", initOptions: [...DEFAULT_INIT_OPTIONS] };
    this._currentTime = 0;
    this.duration = 0;
    this.playing = false;
    this._paused = false;
    this._pendingSeekFrac = null;
    this._pendingResumeSeconds = null;
    this._hasProgressed = false;
    this._lastSeekAtMs = 0;
    this._lastSeekTargetSec = -1;
    this._needsPlayKick = false;
    this.rerender();
  }

  /** Tear down — drops the source so the native view stops decoding. */
  release() {
    this._released = true;
    this._paused = true;
    this._source = { uri: "", initOptions: [...DEFAULT_INIT_OPTIONS] };
    this._lastSeekAtMs = 0;
    this._lastSeekTargetSec = -1;
    this._needsPlayKick = false;
    this.rerender();
  }

  addListener(event: string, fn: Listener): Subscription {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    const set = this.listeners.get(event)!;
    set.add(fn);
    return {
      remove: () => {
        set.delete(fn);
      },
    };
  }

  // ── Internals used by VideoView ────────────────────────────────────────
  /** @internal */ _attachView(rerender: () => void) {
    this.rerender = rerender;
    return () => { this.rerender = () => {}; };
  }

  /** @internal */ _emit(event: string, payload?: any) {
    const set = this.listeners.get(event);
    if (!set) return;
    set.forEach((fn) => {
      try { fn(payload); } catch {}
    });
  }

  /** @internal — VLC onPlaying */
  _onPlaying(e: any) {
    this.playing = true;
    const dur = msToSeconds(e?.duration);
    if (dur > 0) this.duration = dur;
    // Note: do NOT flush pending seeks here — VLC fires onPlaying as
    // soon as it has the demuxer open, but seeking before the first
    // decoded frame causes infinite buffering. The actual flush
    // happens from _onProgress once we know decoding has started.
    this._emit("statusChange", { status: "readyToPlay" });
    this._emit("playingChange", { isPlaying: true });
  }

  /** @internal — VLC onPaused */
  _onPaused() {
    if (!this.playing) return;
    this.playing = false;
    this._emit("playingChange", { isPlaying: false });
  }

  /** @internal — VLC onProgress */
  _onProgress(e: any) {
    // Underlying native code emits both currentTime and duration in
    // milliseconds (Android: MediaPlayer.getTime/getLength; iOS:
    // VLCMediaPlayer.time / media.length). Normalise both to seconds
    // so the consumer-facing API matches expo-video.
    const ct = msToSeconds(e?.currentTime);
    const dur = msToSeconds(e?.duration);
    if (dur > 0 && dur !== this.duration) {
      this.duration = dur;
    }

    // ── Seek snap-back guard ─────────────────────────────────────────────
    // After we issue a seek, VLC keeps emitting onProgress for a moment
    // with the OLD pre-seek position (libvlc's position observer lags
    // the actual seek by one or two ticks, especially on TS streams).
    // If we let those stale values overwrite `_currentTime` and forward
    // them as `timeUpdate`, the UI scrub bar visibly jumps back to the
    // pre-seek position, the user thinks the seek failed and tries again,
    // and the perception is "plays a frame, snaps back, repeats".
    //
    // For a brief window after a seek, only accept progress values that
    // are within ~3s of our seek target. Once VLC catches up (or the
    // window expires), normal updates resume.
    const now = Date.now();
    const sinceSeekMs = now - this._lastSeekAtMs;
    if (
      this._lastSeekAtMs > 0 &&
      sinceSeekMs < 2000 &&
      this._lastSeekTargetSec >= 0 &&
      Math.abs(ct - this._lastSeekTargetSec) > 3
    ) {
      // Stale tick — drop it. Don't update _currentTime, don't emit.
      return;
    }
    if (sinceSeekMs >= 2000) {
      // Seek window closed — clear tracking so this guard goes dormant.
      this._lastSeekAtMs = 0;
      this._lastSeekTargetSec = -1;
    }

    this._currentTime = ct;
    // First real progress tick → VLC is decoding and now safe to seek.
    // Flush any queued resume / mid-load seeks here.
    if (!this._hasProgressed && ct > 0) {
      this._hasProgressed = true;
      this._tryFlushResumeSeek();
    } else if (this._pendingResumeSeconds != null && this.duration > 0) {
      this._tryFlushResumeSeek();
    }
    this._emit("timeUpdate", { currentTime: this._currentTime });
  }

  /** @internal — VLC onLoad */
  _onLoad(e: any) {
    const dur = msToSeconds(e?.duration);
    if (dur > 0) this.duration = dur;
    // Same reason as _onPlaying — wait for first decoded frame before
    // applying any queued seek.
    const audio: AudioTrack[] = (e?.audioTracks ?? []).map((t: any) => ({
      id: typeof t.id === "number" ? t.id : Number(t.id),
      label: t.name || `Audio ${t.id}`,
    }));
    const subs: SubtitleTrack[] = (e?.textTracks ?? []).map((t: any) => ({
      id: typeof t.id === "number" ? t.id : Number(t.id),
      label: t.name || `Subtitle ${t.id}`,
    }));
    if (audio.length) {
      this._emit("availableAudioTracksChange", { availableAudioTracks: audio });
    }
    if (subs.length) {
      this._emit("availableSubtitleTracksChange", { availableSubtitleTracks: subs });
    }
  }

  /** @internal — VLC onEnd */
  _onEnd() {
    this._emit("playToEnd");
  }

  /** @internal — VLC onError */
  _onError(_e: any) {
    this._emit("statusChange", {
      status: "error",
      error: { message: "Playback failed" },
    });
  }

  /** @internal — VLC onBuffering
   *
   * Intentionally a no-op. VLC fires onBuffering CONSTANTLY during
   * normal IPTV playback (every time the network buffer tops up).
   * Forwarding it as `statusChange: loading` would cause the
   * "Loading stream..." overlay in PlayerScreen / LivePreviewScreen
   * to flicker on every few seconds even while video plays fine.
   * The initial-load spinner is already handled by PlayerScreen's
   * own `playStatus` state, which starts in "loading" and flips to
   * "playing" on `readyToPlay`.
   */
  _onBuffering() {}

  /** @internal — apply a queued resume seek now that VLC is seekable */
  _tryFlushResumeSeek() {
    if (
      this._pendingResumeSeconds == null ||
      this.duration <= 0 ||
      !this._hasProgressed
    ) return;
    const target = this._pendingResumeSeconds;
    this._pendingResumeSeconds = null;
    this._pendingSeekFrac = Math.max(0, Math.min(1, target / this.duration));
    this._currentTime = target;
    this._lastSeekTargetSec = target;
    this._lastSeekAtMs = Date.now();
    this._needsPlayKick = true;
    this.rerender();
  }

  /** @internal — VLC onStopped
   *
   * VLCPlayer.js's internal _onStopped handler unconditionally calls
   * `setNativeProps({ paused: true })` on every stop event. Some Android
   * VLC builds emit "Stopped" briefly while seeking across a TS
   * discontinuity — which silently pauses the native player without our
   * React tree knowing about it (our `paused` prop stays false, so React
   * never re-issues `false` to revert it). Re-arm a play kick so the
   * next render re-asserts paused=false on the native side.
   */
  _onStopped() {
    // Only auto-recover if the stop happened RIGHT AFTER a seek — otherwise
    // it's a real end-of-stream / source switch / network drop and we must
    // NOT try to play through it (would cause infinite reconnect churn on
    // dead streams).
    if (
      !this._paused &&
      this._lastSeekAtMs > 0 &&
      Date.now() - this._lastSeekAtMs < 3000
    ) {
      this._needsPlayKick = true;
      this.rerender();
    }
  }
}

// react-native-vlc-media-player's native code emits both currentTime
// and duration in milliseconds on iOS and Android. Convert to seconds
// for parity with the expo-video API consumer screens were written
// against. Returns 0 for unknown / invalid values.
function msToSeconds(d: unknown): number {
  if (typeof d !== "number" || !isFinite(d) || d <= 0) return 0;
  return d / 1000;
}

// ─── VLC hook ─────────────────────────────────────────────────────────────
function useVlcPlayer(
  source: string,
  setup?: (player: VideoPlayer) => void,
): VideoPlayer {
  const ref = useRef<VideoPlayer | null>(null);
  if (!ref.current) {
    const p = new VideoPlayer();
    if (source) {
      p._source = { uri: source, initOptions: [...DEFAULT_INIT_OPTIONS] };
      p._paused = false;
    }
    try { setup?.(p); } catch {}
    ref.current = p;
  }
  // Tear down the engine on unmount so the native view stops decoding
  // immediately rather than waiting on GC of the JS object.
  useEffect(() => {
    const p = ref.current!;
    return () => {
      try { p.release(); } catch {}
    };
  }, []);
  return ref.current!;
}

// ─── Engine dispatcher ────────────────────────────────────────────────────
//
// Captures the engine choice ONCE per mount (lazy useRef init) so that
// every render of this hook calls the SAME branch of useExpoVideoPlayer /
// useVlcPlayer in the SAME order — keeping React's rules-of-hooks happy.
// To switch engines mid-session, callers must remount the parent (we use
// `key={engine}` on the player wrapper component for that).
//
// Both engines expose an identical surface (replace, currentTime,
// muted, addListener, etc) because the VLC bridge was modelled after
// expo-video's API.
export function useVideoPlayer(
  source: string,
  setup?: (player: any) => void,
  opts?: { engine?: PlayerEngine },
): any {
  const engineRef = useRef<PlayerEngine>(opts?.engine === "expo" ? "expo" : "vlc");
  // Always call BOTH hooks (one with the real source, the other with an
  // empty source) so hook order stays stable across renders. The unused
  // engine doesn't actually decode anything.
  const useExpo = engineRef.current === "expo";
  const expoSetup = useExpo ? setup : undefined;
  const vlcSetup  = !useExpo ? setup : undefined;
  // Pass `null` to the unused engine so it stays a true no-op. expo-video
  // treats null source as "no source" (no decoder, no errors); VLC's
  // bridge guards against falsy source the same way.
  const expoPlayer = useExpoVideoPlayer(useExpo ? source : (null as any), expoSetup as any);
  const vlcPlayer  = useVlcPlayer(!useExpo ? source : "", vlcSetup as any);
  return useExpo ? expoPlayer : vlcPlayer;
}

// ─── VideoView ────────────────────────────────────────────────────────────
type ContentFit = "contain" | "cover" | "fill";

export interface VideoViewProps {
  player: any;
  style?: StyleProp<ViewStyle>;
  contentFit?: ContentFit;
  // The next three are accepted for expo-video API parity but ignored on
  // the VLC engine — VLC has no built-in PiP/fullscreen UI in this
  // binding, and the app implements its own controls anyway.
  nativeControls?: boolean;
  allowsFullscreen?: boolean;
  allowsPictureInPicture?: boolean;
  /** Optional engine override. Must match the engine the player was
   *  created with. Defaults to "vlc" if omitted. */
  engine?: PlayerEngine;
}

export function VideoView(props: VideoViewProps) {
  const engine: PlayerEngine = props.engine === "expo" ? "expo" : "vlc";
  if (engine === "expo") {
    const { engine: _e, ...rest } = props;
    return <ExpoVideoView {...(rest as any)} />;
  }
  return <VlcVideoView {...props} />;
}

function VlcVideoView({
  player,
  style,
  contentFit = "contain",
}: VideoViewProps) {
  // Force a re-render whenever the player's state changes.
  const [, force] = useReducer((x: number) => x + 1, 0);
  const vlcRef = useRef<any>(null);
  const lastSeekRef = useRef<number | null>(null);

  useEffect(() => player._attachView(force), [player]);

  // Apply pending seeks imperatively via the ref. VLC's `seek` prop only
  // triggers a re-seek when the value actually changes, which gets
  // unreliable when a user seeks to the same position twice. Going
  // through the ref method is what react-native-vlc-media-player itself
  // uses internally.
  //
  // After every seek we also re-issue paused=false via setNativeProps to
  // defeat VLCPlayer.js's _onStopped handler which silently pauses the
  // native player on certain Android stop events (seek across a TS
  // discontinuity, end-of-buffer flush, etc.).
  useEffect(() => {
    const frac = player._pendingSeekFrac;
    if (frac != null) {
      // Null FIRST so any re-render this triggers can't re-issue the seek.
      player._pendingSeekFrac = null;
      lastSeekRef.current = frac;
      if (vlcRef.current?.seek) {
        try { vlcRef.current.seek(frac); } catch {}
      }
    }
    if (player._needsPlayKick && !player._paused) {
      player._needsPlayKick = false;
      if (vlcRef.current?.setNativeProps) {
        try { vlcRef.current.setNativeProps({ paused: false }); } catch {}
      }
    }
  });

  // No source yet (or released) — render an empty View so the layout
  // box still occupies space. This matches expo-video's behaviour when
  // `source` is null.
  if (!player._source.uri) {
    return <View style={style} />;
  }

  const resizeMode =
    contentFit === "cover" ? "cover" :
    contentFit === "fill" ? "fill" :
    "contain";

  return (
    <VLCPlayer
      ref={vlcRef}
      style={style}
      source={player._source}
      paused={player._paused}
      muted={player._muted}
      repeat={player._loop}
      audioTrack={player._audioTrackId}
      textTrack={player._textTrackId}
      resizeMode={resizeMode}
      autoplay={!player._paused}
      onPlaying={(e: any) => player._onPlaying(e)}
      onProgress={(e: any) => player._onProgress(e)}
      onPaused={() => player._onPaused()}
      onLoad={(e: any) => player._onLoad(e)}
      onEnd={() => player._onEnd()}
      onError={(e: any) => player._onError(e)}
      onBuffering={() => player._onBuffering()}
      onStopped={() => player._onStopped()}
    />
  );
}

// Suppress unused-import lint warning on Platform; kept around in case
// we need a runtime fallback later.
void Platform;
