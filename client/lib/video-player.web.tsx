/**
 * Web build of the player shim — loaded automatically by Metro when bundling
 * for the web target (Metro resolves `.web.tsx` before `.tsx`).
 *
 * Replaces the old expo-video fallback with a proper player router that picks
 * the right implementation based on where the app is running:
 *
 *   android-webview  →  WebViewBridgePlayer  (delegates to native LibVLC /
 *                        ExoPlayer via the window.UltraCastPlayer JS bridge
 *                        injected by the Ultra Cast WebView APK)
 *
 *   browser / ios    →  HlsBrowserPlayer     (hls.js for HLS streams,
 *                        native <video> for MP4 / Safari HLS)
 *
 * The existing native players in video-player.tsx, VlcPlayerScreen.tsx, and
 * PlayerScreen.tsx are untouched — they are not loaded in the web bundle.
 *
 * Hook call order is always the same regardless of platform (React rules of
 * hooks requirement): both hooks are called every render; the "inactive" one
 * receives null as its source so it does nothing.  PLATFORM is a module-level
 * constant evaluated once at load time — it never flips between renders.
 */

import React from "react";
import { getPlatformType } from "./platform-type";
import {
  BrowserVideoPlayer,
  useHlsBrowserPlayer,
  BrowserVideoView,
} from "./browser-player";
import {
  WebViewBridgePlayer,
  useWebViewBridgePlayer,
  WebViewBridgeVideoView,
} from "./webview-bridge-player";

// ─── Platform constant ────────────────────────────────────────────────────────
// Evaluated once at module-load time — never changes for the lifetime of
// the page, so it is safe to use as a conditional inside a hook.
const PLATFORM = getPlatformType();
const IS_WEBVIEW = PLATFORM === "android-webview";

// ─── Re-exported types (API parity with video-player.tsx) ────────────────────

export type PlayerEngine = "vlc" | "expo";
export type HwDecodeMode = "auto" | "on" | "off";

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

export type VideoPlayer = BrowserVideoPlayer | WebViewBridgePlayer;

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Returns a source object with a custom User-Agent header.
 * On web the header is informational only — browsers enforce their own UA
 * and cannot override it on media requests. The shape is preserved so
 * callers do not need to branch on platform.
 */
export function makeVideoSource(url: string): {
  uri: string;
  headers: { "User-Agent": string };
} {
  return { uri: url, headers: { "User-Agent": "Ultra Cast v3/1.0.0 Browser" } };
}

/**
 * No-op stub — VLC init options only apply on native.
 * Exported for API parity so any import that destructures this doesn't break.
 */
export function buildVlcInitOptions(
  _hw?: HwDecodeMode,
  _bufferMs?: number,
): string[] {
  return [];
}

// ─── useVideoPlayer ───────────────────────────────────────────────────────────

/**
 * Creates and returns a stable video player for the current platform.
 *
 * Behaviour mirrors the native useVideoPlayer in video-player.tsx:
 *  - The player is created once (stable ref) — source changes are applied
 *    imperatively via player.replace(), not by re-creating the player.
 *  - Both sub-hooks are always called in the same order so React's
 *    rules-of-hooks are never violated (IS_WEBVIEW is a compile-time constant).
 *  - The `engine` and `hwDecode` options are accepted for API parity but
 *    ignored on web.
 */
export function useVideoPlayer(
  source:
    | string
    | { uri: string; headers?: Record<string, string> }
    | null,
  setup?: (player: any) => void,
  _opts?: { engine?: PlayerEngine; hwDecode?: HwDecodeMode; bufferMs?: number },
): VideoPlayer {
  // Always call BOTH hooks — hook order must be identical on every render.
  // The inactive engine receives null as source (no-op / no video loaded).
  const bridgePlayer = useWebViewBridgePlayer(
    IS_WEBVIEW ? source : null,
    IS_WEBVIEW ? setup : undefined,
  );

  const browserPlayer = useHlsBrowserPlayer(
    IS_WEBVIEW ? null : source,
    IS_WEBVIEW ? undefined : setup,
  );

  return IS_WEBVIEW ? bridgePlayer : browserPlayer;
}

// ─── VideoView ────────────────────────────────────────────────────────────────

/**
 * Renders the appropriate video surface for the current platform.
 *
 * Accepts the same props as expo-video's VideoView so PlayerScreen and other
 * consumer screens need no changes:
 *   player, style, contentFit, nativeControls, engine (ignored)
 *
 * android-webview  →  transparent <div> placeholder (video renders natively)
 * browser / ios    →  <video> element driven by hls.js
 */
export function VideoView({
  player,
  style,
  contentFit,
  nativeControls,
  // Strip custom native-only props before passing to DOM/RN
  engine: _engine,
  ...rest
}: {
  player: VideoPlayer;
  style?: any;
  contentFit?: string;
  nativeControls?: boolean;
  engine?: string;
  [key: string]: any;
}) {
  if (IS_WEBVIEW) {
    return (
      <WebViewBridgeVideoView
        player={player as WebViewBridgePlayer}
        style={style}
        {...rest}
      />
    );
  }

  return (
    <BrowserVideoView
      player={player as BrowserVideoPlayer}
      style={style}
      contentFit={contentFit}
      nativeControls={nativeControls}
      {...rest}
    />
  );
}
