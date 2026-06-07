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
import Constants from "expo-constants";

// ─── Custom User-Agent ───────────────────────────────────────────────────
// Sent on every HTTP request made by the underlying player so the IPTV
// provider's admin panel can identify Ultra Cast clients (and which engine
// they're using) instead of just seeing the library default ("VLC/3.0.21
// LibVLC/3.0.21" or "AndroidXMedia3/1.8.0"). Format mirrors the panel's
// "appname/version engine" convention.
const APP_NAME = "Ultra Cast v3";
const APP_VER: string =
  (Constants?.expoConfig?.version as string | undefined) ?? "1.0.0";
const UA_VLC  = `${APP_NAME}/${APP_VER} VLC`;
const UA_EXPO = `${APP_NAME}/${APP_VER} Expo`;

/** Build a video source object with our custom User-Agent header.
 *  Pass the return value to `useVideoPlayer(...)` or `player.replace(...)`
 *  so the IPTV provider's panel sees "Ultra Cast v3/<version> Expo|VLC"
 *  instead of the library default. Works for both engines: expo-video
 *  honours the headers natively, the VLC bridge ignores headers but
 *  still sends the same UA via libvlc init options. */
export function makeVideoSource(url: string): { uri: string; headers: { "User-Agent": string } } {
  return { uri: url, headers: { "User-Agent": UA_EXPO } };
}

// VLC's native code (react-native-vlc-media-player) requires Android
// 8.0+ (API 26) — it calls AudioAttributes / MediaCodec methods that
// don't exist on older OS versions. We bundle VLC anyway and override
// the manifest merger via the `withVlcMinSdkOverride` config plugin so
// the APK installs on Fire OS 6 (API 25) sticks. This flag makes sure
// we never actually instantiate VLC on those devices — the player
// factory transparently falls back to the Expo engine instead.
const ANDROID_VLC_UNSUPPORTED =
  Platform.OS === "android" && typeof Platform.Version === "number" && Platform.Version < 26;
// @ts-ignore — package ships a CJS index without ESM types
import * as VlcPkg from "react-native-vlc-media-player";
import {
  useVideoPlayer as useExpoVideoPlayer,
  VideoView as ExpoVideoView,
  type VideoPlayer as ExpoVideoPlayer,
} from "expo-video";

export type PlayerEngine = "vlc" | "expo";
// Mirrors HwDecodeMode in ProfileContext (kept local so this low-level lib
// doesn't import from a context). "auto" omits the flag entirely.
export type HwDecodeMode = "auto" | "on" | "off";

const VLCPlayer: any =
  (VlcPkg as any).VLCPlayer ??
  (VlcPkg as any).default?.VLCPlayer ??
  (VlcPkg as any).default ??
  VlcPkg;

// ─── Library patch: defang VLCPlayer.js's _onStopped ──────────────────────
//
// react-native-vlc-media-player's VLCPlayer.js _onStopped handler
// unconditionally runs `setNativeProps({ paused: true })` on EVERY
// Stopped event the native player emits. libvlc fires Stopped briefly
// during normal seeks (especially on TS / IPTV streams crossing a
// discontinuity), which means a single user seek puts the native
// player into a Stopped state behind React's back. Our React tree
// still thinks `paused === false`, so RN's prop diff never re-issues
// `paused: false` and the native player is silently stuck.
//
// Worse: if we DO recover by re-issuing `paused: false` (as the
// previous fix attempt did), libvlc treats `play()` after `Stopped`
// as a *fresh* play session — restarting from the beginning of the
// media. The user sees: seek to 30s → frame loads → split second of
// playback from the seek target → libvlc emits Stopped → our kick
// restarts from 0 → libvlc Stops again → loop.
//
// Fix: replace the library's _onStopped with one that just forwards
// the event to the consumer (us), without touching paused. We then
// decide what to do with Stopped ourselves (currently: nothing, since
// the underlying issue is libvlc's spurious Stopped during seek).
if (
  VLCPlayer?.prototype &&
  typeof VLCPlayer.prototype._onStopped === "function" &&
  !(VLCPlayer.prototype as any).__ultracastStoppedPatched
) {
  VLCPlayer.prototype._onStopped = function _onStoppedPatched(this: any) {
    if (this.props && typeof this.props.onStopped === "function") {
      try { this.props.onStopped(); } catch {}
    }
  };
  (VLCPlayer.prototype as any).__ultracastStoppedPatched = true;
}

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
// The `--http-user-agent` option overrides libvlc's built-in UA so the
// provider's panel reports the Ultra Cast client name + version + "VLC"
// suffix instead of generic "VLC/3.0.x LibVLC/3.0.x".
const DEFAULT_INIT_OPTIONS = [
  "--network-caching=300",
  // Let libvlc transparently re-open an HTTP(S) connection that the
  // provider drops mid-stream (e.g. the common ~3h Xtream session cap)
  // instead of stalling on the last decoded frame forever. The standalone
  // VOD VLC screen already sets this; the shared live path now matches.
  "--http-reconnect",
  `--http-user-agent=${UA_VLC}`,
];

// Build the libVLC init options for a given hardware-decoding mode.
// "auto" → no avcodec-hw flag (libVLC default — the existing behaviour).
// "on"   → --avcodec-hw=any  (force hardware acceleration).
// "off"  → --avcodec-hw=none (force pure software decoding — fixes devices
//          whose hardware decoder produces green/garbled frames, stutter,
//          or no audio even though other VLC apps work).
// The flag is baked into the source's initOptions, which libVLC only reads
// when a media source is set/replaced — so changing the mode requires
// reopening the stream (consumer screens capture the mode at mount).
export function buildVlcInitOptions(hw: HwDecodeMode = "auto"): string[] {
  const opts = [...DEFAULT_INIT_OPTIONS];
  if (hw === "on") opts.push("--avcodec-hw=any");
  else if (hw === "off") opts.push("--avcodec-hw=none");
  return opts;
}

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
  /** @internal — VLC hardware-decoding mode, captured at creation. Baked
   *  into every source's initOptions. Switching requires a fresh player. */
  _hwDecode: HwDecodeMode = "auto";
  /** @internal */ _source: { uri: string; initOptions: string[] } = {
    uri: "",
    initOptions: buildVlcInitOptions("auto"),
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
  /** @internal — # of automatic retries already issued for the current seek */
  _seekRetries: number = 0;
  /** @internal — when true, VlcVideoView's effect must call ref.resume(true)
   *  to bring libvlc out of a Stopped state (libvlc cannot setPosition while
   *  Stopped — you have to play() first, which restarts from 0, then re-seek
   *  via the queued resume mechanism). One-shot flag, cleared by the effect. */
  _pendingResumeKick: boolean = false;
  /** @internal — # of resume kicks issued for this seek (cap at 3 so a truly
   *  broken stream can't loop). Reset on a fresh user-initiated seek. */
  _resumeKickRetries: number = 0;

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
      this._seekRetries = 0;
      this._resumeKickRetries = 0;
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

  /** Swap the source URL and immediately start playing it. Accepts a
   *  bare URL or a `{ uri, headers? }` object (headers are ignored by
   *  VLC — UA is set via init options instead — but accepted for parity
   *  with expo-video's source shape so callers can pass the same object
   *  to either engine). */
  replace(src: string | { uri: string; headers?: Record<string, string> }) {
    if (this._released) return;
    const uri = typeof src === "string" ? src : src?.uri ?? "";
    this._source = { uri, initOptions: buildVlcInitOptions(this._hwDecode) };
    this._currentTime = 0;
    this.duration = 0;
    this.playing = false;
    this._paused = false;
    this._pendingSeekFrac = null;
    this._pendingResumeSeconds = null;
    this._pendingResumeKick = false;
    this._hasProgressed = false;
    this._lastSeekAtMs = 0;
    this._lastSeekTargetSec = -1;
    this._seekRetries = 0;
    this._resumeKickRetries = 0;
    this.rerender();
  }

  /** Tear down — drops the source so the native view stops decoding. */
  release() {
    this._released = true;
    this._paused = true;
    this._source = { uri: "", initOptions: buildVlcInitOptions(this._hwDecode) };
    this._pendingSeekFrac = null;
    this._pendingResumeSeconds = null;
    this._pendingResumeKick = false;
    this._hasProgressed = false;
    this._lastSeekAtMs = 0;
    this._lastSeekTargetSec = -1;
    this._seekRetries = 0;
    this._resumeKickRetries = 0;
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
    //
    // CRITICAL: when we see a stale tick we DON'T just drop it — we
    // re-issue the seek. Two failure modes show up as a stale tick:
    //   1. iOS [_player isSeekable] returned NO when we first called
    //      setPosition (typical for the first ~250-500ms after the
    //      decoder starts), so the seek was silently ignored.
    //   2. libvlc transitioned through Stopped during the seek (TS
    //      discontinuity, codec re-init, etc) and lost the position.
    // In both cases the native player is sitting at the OLD position
    // with no kick coming. Re-issuing `seek` is safe (it does NOT call
    // play() — so no restart-from-0) and forces libvlc to honour the
    // seek as soon as it's actually seekable.
    const now = Date.now();
    const sinceSeekMs = now - this._lastSeekAtMs;
    if (
      this._lastSeekAtMs > 0 &&
      sinceSeekMs < 6000 &&
      this._lastSeekTargetSec >= 0 &&
      Math.abs(ct - this._lastSeekTargetSec) > 3
    ) {
      // Stale tick. Try to re-seek (cap retries so we don't loop forever
      // on truly-unseekable streams).
      if (this._seekRetries < 12 && this.duration > 0) {
        this._seekRetries++;
        this._pendingSeekFrac = Math.max(
          0,
          Math.min(1, this._lastSeekTargetSec / this.duration),
        );
        this._lastSeekAtMs = now; // restart the verify window
        this.rerender();
      }
      return;
    }
    if (sinceSeekMs >= 6000) {
      // Seek window closed — clear tracking so this guard goes dormant.
      this._lastSeekAtMs = 0;
      this._lastSeekTargetSec = -1;
      this._seekRetries = 0;
      this._resumeKickRetries = 0;
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
    this.rerender();
  }

  /** @internal — VLC onStopped
   *
   * Two cases to distinguish:
   * 1. Spurious Stopped during a seek (libvlc fires this briefly when
   *    crossing a TS discontinuity, etc.). The library's auto-pause is
   *    already patched out at module load, so we just ignore it and
   *    let playback continue uninterrupted.
   * 2. A real stop — end-of-stream (also covered by _onEnd / playToEnd),
   *    network drop, source teardown, or an explicit pause/release we
   *    didn't initiate. In that case we must update React state so the
   *    UI doesn't keep showing "playing" while native is stopped.
   *
   * We classify by a short window after the most recent seek (1.5s):
   * inside the window → spurious, ignore; outside → real, sync state.
   */
  _onStopped() {
    const sinceSeekMs = this._lastSeekAtMs > 0
      ? Date.now() - this._lastSeekAtMs
      : Number.MAX_SAFE_INTEGER;
    // Narrow classification: only treat as seek-related if (a) within
    // 3s of seek dispatch AND (b) the seek hasn't visibly landed yet
    // (current position still > 3s away from target). Otherwise this
    // is almost certainly a real end-of-stream / user pause / source
    // teardown and we must NOT kick a restart-from-0.
    const seekUnresolved =
      this._lastSeekTargetSec >= 0 &&
      Math.abs(this._currentTime - this._lastSeekTargetSec) > 3;
    if (sinceSeekMs < 3000 && seekUnresolved) {
      // Spurious Stopped during a seek. CRITICAL libvlc behaviour:
      // setPosition() is a NO-OP while the player is in Stopped state
      // ("This has no effect if playback is not enabled" — libvlc docs).
      // So re-issuing setSeek here does literally nothing, and the
      // native view sits frozen on the last decoded frame forever.
      //
      // The only way out is to call play() — which transitions libvlc
      // back to Playing but RESTARTS FROM 0. Then once the first
      // post-restart progress tick fires (decoder ready again), we
      // flush a queued resume seek to land at the user's target.
      //
      // User experience: brief flicker to start, then jump to seek
      // target. Acceptable trade-off vs frozen player.
      //
      // Cap kicks to avoid looping on truly-broken streams.
      if (
        this._resumeKickRetries < 3 &&
        this._lastSeekTargetSec >= 0 &&
        this.duration > 0
      ) {
        this._resumeKickRetries++;
        this._pendingResumeSeconds = this._lastSeekTargetSec;
        this._pendingSeekFrac = null;       // wait for post-restart flush
        this._hasProgressed = false;        // re-arm the resume gate
        this._seekRetries = 0;
        this._pendingResumeKick = true;     // VlcVideoView will call ref.resume(true)
        this.rerender();
      }
      return;
    }
    if (this.playing) {
      this.playing = false;
      this._emit("playingChange", { isPlaying: false });
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
  hwDecode: HwDecodeMode = "auto",
): VideoPlayer {
  const ref = useRef<VideoPlayer | null>(null);
  if (!ref.current) {
    const p = new VideoPlayer();
    // Capture the hardware-decoding mode once at creation so every source
    // built for this player (initial + replace) bakes in the right flag.
    p._hwDecode = hwDecode;
    if (source) {
      p._source = { uri: source, initOptions: buildVlcInitOptions(hwDecode) };
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
  source: string | { uri: string; headers?: Record<string, string> } | null,
  setup?: (player: any) => void,
  opts?: { engine?: PlayerEngine; hwDecode?: HwDecodeMode },
): any {
  // Normalise to a bare URL for the VLC branch (which uses init options
  // for the UA) and to a {uri, headers} object for the expo branch.
  const url: string =
    typeof source === "string" ? source : source?.uri ?? "";
  const engineRef = useRef<PlayerEngine>(
    opts?.engine === "expo" || ANDROID_VLC_UNSUPPORTED ? "expo" : "vlc",
  );
  // Always call BOTH hooks (one with the real source, the other with an
  // empty source) so hook order stays stable across renders. The unused
  // engine doesn't actually decode anything.
  const useExpo = engineRef.current === "expo";
  const expoSetup = useExpo ? setup : undefined;
  const vlcSetup  = !useExpo ? setup : undefined;
  // Pass `null` to the unused engine so it stays a true no-op. expo-video
  // treats null source as "no source" (no decoder, no errors); VLC's
  // bridge guards against falsy source the same way.
  // expo-video accepts a VideoSource object with optional `headers` —
  // we set User-Agent so the provider panel reports the same Ultra Cast
  // brand+version that the VLC path does (suffixed " Expo" instead of
  // " VLC" so the engine in use is identifiable).
  const expoSource: any = useExpo && url
    ? (typeof source === "object" && source?.headers
        ? source
        : { uri: url, headers: { "User-Agent": UA_EXPO } })
    : (null as any);
  // Capture the hardware-decode mode once per mount, same as the engine.
  const hwDecodeRef = useRef<HwDecodeMode>(
    opts?.hwDecode === "on" || opts?.hwDecode === "off" ? opts.hwDecode : "auto",
  );
  const expoPlayer = useExpoVideoPlayer(expoSource, expoSetup as any);
  const vlcPlayer  = useVlcPlayer(!useExpo ? url : "", vlcSetup as any, hwDecodeRef.current);
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
  const engine: PlayerEngine =
    props.engine === "expo" || ANDROID_VLC_UNSUPPORTED ? "expo" : "vlc";
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
  // No play-kick after seek — the library's auto-pause-on-Stopped
  // behaviour is patched out at module load, so the native player
  // stays in its existing playing state across the seek. Issuing
  // `paused: false` after the library's Stopped event would cause
  // libvlc to treat play() as a fresh session and restart from 0,
  // which is exactly the snap-back loop we used to see.
  useEffect(() => {
    // Recovery from libvlc Stopped-during-seek: restart playback from 0,
    // then the queued resume seek will fire on the first onProgress tick.
    // Must run BEFORE seek flush — otherwise calling seek() while still
    // in Stopped state is a no-op (libvlc setPosition requires Playing).
    if (player._pendingResumeKick) {
      // Acknowledgment-based: only clear the flag AFTER the native call
      // succeeds. If the ref is transiently null or resume() throws, the
      // flag stays set so the next render (e.g. when the ref attaches)
      // can retry. Without this, a single missed kick = permanent freeze.
      const fn = vlcRef.current?.resume;
      if (typeof fn === "function") {
        try {
          fn.call(vlcRef.current, true);
          player._pendingResumeKick = false;
        } catch {
          // leave flag set so a subsequent render retries
        }
      }
      return;
    }
    const frac = player._pendingSeekFrac;
    if (frac != null) {
      // Null FIRST so any re-render this triggers can't re-issue the seek.
      player._pendingSeekFrac = null;
      lastSeekRef.current = frac;
      if (vlcRef.current?.seek) {
        try { vlcRef.current.seek(frac); } catch {}
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
