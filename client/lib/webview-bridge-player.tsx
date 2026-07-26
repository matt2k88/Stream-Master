/**
 * WebView bridge player — used when the web app runs inside the Ultra Cast
 * Android WebView APK (detected via window.__ULTRACAST_WEBVIEW__ === true).
 *
 * Instead of decoding video in the browser, this player delegates to the
 * native LibVLC / ExoPlayer bridge exposed by the APK as window.UltraCastPlayer.
 * The actual video renders in a native SurfaceView that floats on top of the
 * WebView — the <VideoView> in this file is just a transparent placeholder
 * that occupies the correct space in the React layout.
 *
 * Bridge API (window.UltraCastPlayer.*):
 *   play(url, mimeHint, title)   — starts native playback
 *   pause() / resume() / stop()
 *   seekTo(ms)                   — Long
 *   setVolume(level)             — Int 0–100
 *   setFullscreen(on)            — shows/hides native SurfaceView
 *   setAspectRatio(ratio)        — "16:9", "4:3", "FILL"
 *
 * Events fired from native → JS via window.__ucPlayerEvent(name, data):
 *   playing, paused, stopped, error, timeUpdate, durationChange, buffering
 */

import React, { useEffect, useRef } from "react";
import { View } from "react-native";

// ─── Types ────────────────────────────────────────────────────────────────────

type Listener = (payload: any) => void;
type Subscription = { remove: () => void };

/** Shape of the native bridge injected by the Android APK. */
interface NativePlayerBridge {
  play(url: string, mimeHint: string, title: string): void;
  pause(): void;
  resume(): void;
  stop(): void;
  seekTo(ms: number): void;
  setVolume(level: number): void;
  setFullscreen(on: boolean): void;
  setAspectRatio(ratio: string): void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getBridge(): NativePlayerBridge | null {
  if (typeof window === "undefined") return null;
  const b = (window as any).UltraCastPlayer;
  return b ?? null;
}

function detectMimeHint(url: string): string {
  if (url.includes(".m3u8")) return "hls";
  if (url.includes(".mpd")) return "dash";
  if (url.endsWith(".mp4") || url.endsWith(".webm")) return "mp4";
  return "";
}

// ─── Player class ─────────────────────────────────────────────────────────────

export class WebViewBridgePlayer {
  readonly _kind = "webview" as const;

  // Public state (mirrors native VideoPlayer)
  playing: boolean = false;
  duration: number = 0;

  // Internal
  _paused: boolean = true;
  _muted: boolean = false;
  _released: boolean = false;
  _currentTime: number = 0;
  _url: string = "";
  _title: string = "";

  private listeners = new Map<string, Set<Listener>>();

  // ── API (compat with native VideoPlayer) ─────────────────────────────────

  play() {
    if (this._released) return;
    this._paused = false;
    if (this._url) {
      getBridge()?.play(this._url, detectMimeHint(this._url), this._title);
    }
  }

  pause() {
    if (this._paused) return;
    this._paused = true;
    getBridge()?.pause();
  }

  /** Swap stream URL and start playing immediately. */
  replace(src: string | { uri: string; headers?: Record<string, string> }) {
    if (this._released) return;
    const url = typeof src === "string" ? src : src?.uri ?? "";
    this._url = url;
    this._paused = false;
    this._currentTime = 0;
    this.duration = 0;
    this.playing = false;
    getBridge()?.play(url, detectMimeHint(url), this._title);
  }

  /** Tear down. */
  release() {
    this._released = true;
    this._paused = true;
    this._url = "";
    getBridge()?.stop();
    getBridge()?.setFullscreen(false);
  }

  // ── Getters / setters ─────────────────────────────────────────────────────

  get muted() { return this._muted; }
  set muted(v: boolean) {
    this._muted = v;
    getBridge()?.setVolume(v ? 0 : 100);
  }

  get loop() { return false; }
  set loop(_v: boolean) {}

  /** currentTime in seconds. Seek when written. */
  get currentTime() { return this._currentTime; }
  set currentTime(seconds: number) {
    if (!isFinite(seconds) || seconds < 0) return;
    this._currentTime = seconds;
    getBridge()?.seekTo(Math.round(seconds * 1000));
  }

  // Subtitle / audio — stubs for API parity (follow-up task #41).
  set subtitleTrack(_t: any) {}
  get subtitleTrack() { return null; }
  set audioTrack(_t: any) {}
  get audioTrack() { return null; }

  // expo-video compat.
  set timeUpdateEventInterval(_n: number) {}
  get timeUpdateEventInterval() { return 1; }

  // ── Event bus ─────────────────────────────────────────────────────────────

  addListener(event: string, fn: Listener): Subscription {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return { remove: () => this.listeners.get(event)?.delete(fn) };
  }

  /** @internal */ _emit(event: string, payload?: any) {
    this.listeners.get(event)?.forEach((fn) => {
      try { fn(payload); } catch {}
    });
  }

  /** @internal — VideoView calls this but bridge player needs no DOM re-render */
  _attachView(_rerender: () => void) {
    return () => {};
  }

  /** @internal — called by native event dispatcher */
  _onNativeEvent(name: string, data: any) {
    switch (name) {
      case "playing":
        this.playing = true;
        this._emit("statusChange", { status: "readyToPlay" });
        this._emit("playingChange", { isPlaying: true });
        break;
      case "paused":
        this.playing = false;
        this._emit("playingChange", { isPlaying: false });
        break;
      case "stopped":
        this.playing = false;
        this._emit("playToEnd");
        break;
      case "error":
        this._emit("statusChange", {
          status: "error",
          error: { message: data?.message ?? "Native player error" },
        });
        break;
      case "timeUpdate": {
        const posMs =
          typeof data?.positionMs === "number" ? data.positionMs : 0;
        this._currentTime = posMs / 1000;
        this._emit("timeUpdate", { currentTime: this._currentTime });
        break;
      }
      case "durationChange": {
        const durMs =
          typeof data?.durationMs === "number" ? data.durationMs : 0;
        if (durMs > 0) this.duration = durMs / 1000;
        break;
      }
      case "buffering":
        // No-op — avoid flickering the loading overlay (same approach as VLC shim).
        break;
    }
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Creates and returns a stable WebViewBridgePlayer instance.
 * Registers window.__ucPlayerEvent so native callbacks reach the player.
 */
export function useWebViewBridgePlayer(
  source: string | { uri: string; headers?: Record<string, string> } | null,
  setup?: (player: WebViewBridgePlayer) => void,
): WebViewBridgePlayer {
  const ref = useRef<WebViewBridgePlayer | null>(null);

  if (!ref.current) {
    const p = new WebViewBridgePlayer();
    if (source) {
      const url = typeof source === "string" ? source : source?.uri ?? "";
      p._url = url;
      p._paused = false;
    }
    try { setup?.(p); } catch {}
    ref.current = p;
  }

  // Register the global callback that native fires back into JS.
  // We restore any previously-registered callback on cleanup so multiple
  // mounted players don't clobber each other (edge case during hot reload).
  useEffect(() => {
    const player = ref.current!;
    const prev = (window as any).__ucPlayerEvent;

    (window as any).__ucPlayerEvent = (name: string, data: any) => {
      player._onNativeEvent(name, data);
    };

    return () => {
      (window as any).__ucPlayerEvent = prev;
    };
  }, []);

  useEffect(() => {
    return () => {
      try { ref.current?.release(); } catch {}
    };
  }, []);

  return ref.current;
}

// ─── VideoView ────────────────────────────────────────────────────────────────

/**
 * Transparent placeholder that sits where the video should appear in the
 * React layout. The actual video renders in the native Android SurfaceView
 * which floats above the WebView — we just need something to reserve space.
 *
 * When this view mounts it tells the APK to show the SurfaceView (fullscreen);
 * when it unmounts it hides the SurfaceView so the web UI is visible again.
 */
export function WebViewBridgeVideoView({
  style,
  // Consume props that don't apply to the placeholder
  player: _player,
  contentFit: _cf,
  nativeControls: _nc,
  engine: _engine,
  ...rest
}: {
  player?: WebViewBridgePlayer;
  style?: any;
  contentFit?: string;
  nativeControls?: boolean;
  [key: string]: any;
}) {
  useEffect(() => {
    // Show the native SurfaceView overlay.
    getBridge()?.setFullscreen(true);
    return () => {
      // Hide it when the player screen unmounts.
      getBridge()?.setFullscreen(false);
    };
  }, []);

  return (
    <View
      style={[
        { backgroundColor: "transparent", flex: 1 },
        style,
      ]}
      {...rest}
    />
  );
}
