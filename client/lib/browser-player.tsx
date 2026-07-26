/**
 * Browser video player — used when the web app runs in Chrome, Edge,
 * Firefox, or Safari (desktop and mobile).
 *
 * Strategy:
 *  • HLS (.m3u8) streams    → hls.js (all browsers except Safari)
 *  • HLS on Safari          → native <video> src (Safari has built-in HLS)
 *  • MP4 / direct URLs      → native <video> src
 *  • DASH / other           → native <video> src (limited browser support)
 *
 * The public API mirrors the native VideoPlayer class so consumer screens
 * (PlayerScreen, LivePreviewScreen, etc.) need zero changes.
 */

import React, { useEffect, useReducer, useRef, useCallback } from "react";
import { View } from "react-native";
import Hls from "hls.js";

// ─── Types ────────────────────────────────────────────────────────────────────

type Listener = (payload: any) => void;
type Subscription = { remove: () => void };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isHlsUrl(url: string): boolean {
  return (
    url.includes(".m3u8") ||
    url.includes("m3u8") ||
    url.includes("application/vnd.apple.mpegurl")
  );
}

// Safari can play HLS natively; hls.js is not needed (and not supported) there.
function isSafariBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // Chrome/Edge on macOS identify as Safari too — exclude them.
  return /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
}

// ─── Player class ─────────────────────────────────────────────────────────────

export class BrowserVideoPlayer {
  readonly _kind = "browser" as const;

  // Public state (mirrors native VideoPlayer)
  playing: boolean = false;
  duration: number = 0;

  // Internal
  _paused: boolean = true;
  _muted: boolean = false;
  _released: boolean = false;
  _currentTime: number = 0;
  _url: string = "";

  private listeners = new Map<string, Set<Listener>>();
  private rerender: () => void = () => {};
  private _hls: Hls | null = null;
  private _videoEl: HTMLVideoElement | null = null;
  /** Listeners added to the video element — removed on detach. */
  private _domListeners: Array<[string, EventListener]> = [];

  // ── API (compat with native VideoPlayer) ─────────────────────────────────

  play() {
    if (this._released) return;
    this._paused = false;
    this._videoEl?.play().catch(() => {});
    this.rerender();
  }

  pause() {
    if (this._paused) return;
    this._paused = true;
    this._videoEl?.pause();
    this.rerender();
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
    this._loadUrl(url);
    this.rerender();
  }

  /** Tear down — stops the video and destroys the hls.js instance. */
  release() {
    this._released = true;
    this._paused = true;
    this._destroyHls();
    if (this._videoEl) {
      this._videoEl.pause();
      this._videoEl.removeAttribute("src");
      this._videoEl.load();
    }
  }

  // ── Getters / setters ─────────────────────────────────────────────────────

  get muted() { return this._muted; }
  set muted(v: boolean) {
    this._muted = v;
    if (this._videoEl) this._videoEl.muted = v;
    this.rerender();
  }

  // loop — web <video> supports this natively; expose for API parity.
  get loop() {
    return this._videoEl?.loop ?? false;
  }
  set loop(v: boolean) {
    if (this._videoEl) this._videoEl.loop = v;
  }

  get currentTime() { return this._currentTime; }
  set currentTime(seconds: number) {
    if (!isFinite(seconds) || seconds < 0) return;
    this._currentTime = seconds;
    if (this._videoEl) this._videoEl.currentTime = seconds;
  }

  // Audio / subtitle track selection — stubs for API parity.
  // (Full implementation is a follow-up task.)
  set subtitleTrack(_t: any) {}
  get subtitleTrack() { return null; }
  set audioTrack(_t: any) {}
  get audioTrack() { return null; }

  // expo-video compat — not meaningful on web.
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

  // ── View attachment ───────────────────────────────────────────────────────

  /** @internal — called by BrowserVideoView on mount/unmount */
  _attachView(rerender: () => void) {
    this.rerender = rerender;
    return () => { this.rerender = () => {}; };
  }

  /**
   * @internal — callback ref from BrowserVideoView.
   * Called with the <video> element on mount, null on unmount.
   */
  _attachVideoEl(el: HTMLVideoElement | null) {
    // Detach previous element's listeners
    if (this._videoEl && el !== this._videoEl) {
      this._removeDomListeners();
    }

    this._videoEl = el;
    if (!el) return;

    el.muted = this._muted;
    el.playsInline = true;

    // ── DOM event wiring ──────────────────────────────────────────────────
    const on = (ev: string, fn: EventListener) => {
      el.addEventListener(ev, fn);
      this._domListeners.push([ev, fn]);
    };

    on("timeupdate", () => {
      const ct = el.currentTime;
      this._currentTime = ct;
      this._emit("timeUpdate", { currentTime: ct });
    });

    on("durationchange", () => {
      const d = el.duration;
      if (isFinite(d) && d > 0) this.duration = d;
    });

    on("playing", () => {
      this.playing = true;
      this._emit("statusChange", { status: "readyToPlay" });
      this._emit("playingChange", { isPlaying: true });
    });

    on("pause", () => {
      this.playing = false;
      this._emit("playingChange", { isPlaying: false });
    });

    on("ended", () => {
      this.playing = false;
      this._emit("playToEnd");
    });

    on("error", () => {
      this._emit("statusChange", {
        status: "error",
        error: { message: "Browser video error" },
      });
    });

    // If a URL was already set (replace() called before element mounted),
    // load it now.
    if (this._url) {
      this._loadUrl(this._url);
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private _loadUrl(url: string) {
    if (!this._videoEl || this._released) return;
    const el = this._videoEl;

    this._destroyHls();

    if (isHlsUrl(url) && Hls.isSupported()) {
      // Use hls.js — maximum codec compatibility across non-Safari browsers.
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        // Start at a reasonable buffer size for IPTV
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!this._paused && !this._released) {
          el.play().catch(() => {});
        }
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          this._emit("statusChange", {
            status: "error",
            error: { message: `HLS fatal error: ${data.type}` },
          });
        }
      });

      hls.loadSource(url);
      hls.attachMedia(el);
      this._hls = hls;
    } else {
      // Native <video> — Safari HLS, MP4, or DASH (limited browser support).
      el.src = url;
      el.load();
      if (!this._paused && !this._released) {
        el.play().catch(() => {});
      }
    }
  }

  private _destroyHls() {
    if (this._hls) {
      try { this._hls.destroy(); } catch {}
      this._hls = null;
    }
  }

  private _removeDomListeners() {
    if (!this._videoEl) return;
    for (const [ev, fn] of this._domListeners) {
      this._videoEl.removeEventListener(ev, fn);
    }
    this._domListeners = [];
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Creates and returns a stable BrowserVideoPlayer instance.
 * Source changes are handled imperatively via player.replace() — the hook
 * itself does NOT re-create the player when source changes (matching the
 * native useVideoPlayer behaviour).
 */
export function useHlsBrowserPlayer(
  source: string | { uri: string; headers?: Record<string, string> } | null,
  setup?: (player: BrowserVideoPlayer) => void,
): BrowserVideoPlayer {
  const ref = useRef<BrowserVideoPlayer | null>(null);

  if (!ref.current) {
    const p = new BrowserVideoPlayer();
    if (source) {
      const url = typeof source === "string" ? source : source?.uri ?? "";
      p._url = url;
      p._paused = false; // play immediately when video element is attached
    }
    try { setup?.(p); } catch {}
    ref.current = p;
  }

  useEffect(() => {
    return () => {
      try { ref.current?.release(); } catch {}
    };
  }, []);

  return ref.current;
}

// ─── VideoView ────────────────────────────────────────────────────────────────

const CONTENT_FIT_MAP: Record<string, string> = {
  contain: "contain",
  cover: "cover",
  fill: "fill",
  "scale-down": "scale-down",
  none: "none",
};

/**
 * Renders a full-size <video> element connected to the BrowserVideoPlayer.
 * Accepts the same props as expo-video's VideoView so PlayerScreen renders
 * identically regardless of which engine is active.
 */
export function BrowserVideoView({
  player,
  style,
  contentFit = "contain",
  nativeControls = false,
  // Strip unknown native-only props
  engine: _engine,
  allowsFullscreen: _af,
  allowsPictureInPicture: _pip,
  startsPictureInPictureAutomatically: _spa,
  ...rest
}: {
  player: BrowserVideoPlayer;
  style?: any;
  contentFit?: string;
  nativeControls?: boolean;
  [key: string]: any;
}) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    return player._attachView(rerender);
  }, [player]);

  const videoRef = useCallback(
    (el: HTMLVideoElement | null) => { player._attachVideoEl(el); },
    [player],
  );

  const objectFit = CONTENT_FIT_MAP[contentFit] ?? "contain";

  return (
    <View
      style={[{ backgroundColor: "#000", overflow: "hidden" as any }, style]}
      {...rest}
    >
      {/* @ts-ignore — raw HTML video element inside RN Web View */}
      <video
        ref={videoRef}
        style={{
          width: "100%",
          height: "100%",
          objectFit: objectFit as any,
          display: "block",
          backgroundColor: "#000",
        }}
        controls={nativeControls}
        playsInline
        muted={player._muted}
      />
    </View>
  );
}
