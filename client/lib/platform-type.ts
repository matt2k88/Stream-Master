/**
 * Platform detection for the web bundle.
 *
 * This module is only loaded by the web bundle (Metro resolves .web.tsx files
 * first). On native (iOS/Android/Fire TV) the native video-player.tsx is used
 * instead and this module is never imported.
 *
 * Detection order (each check is O(1) / synchronous):
 *  1. window.__ULTRACAST_WEBVIEW__ === true  → 'android-webview'
 *     Injected by MainActivity.kt before the page loads.
 *  2. iOS Safari user-agent pattern           → 'ios'
 *  3. Everything else (Chrome, Edge, Firefox) → 'browser'
 */

import { useRef } from "react";

export type PlatformType = "android-webview" | "ios" | "browser";

/**
 * Synchronous platform check — safe to call at module load time or
 * inside render (result is stable for the lifetime of the page).
 */
export function getPlatformType(): PlatformType {
  if (typeof window === "undefined") return "browser";

  // WebView APK sets this flag before any page JS runs.
  if ((window as any).__ULTRACAST_WEBVIEW__ === true) return "android-webview";

  // iOS Safari (iPhone, iPad, iPod touch) — treated like a browser for now;
  // native HLS via <video> works well on Safari so hls.js is bypassed there.
  const ua =
    typeof navigator !== "undefined" ? navigator.userAgent ?? "" : "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";

  return "browser";
}

/**
 * React hook — returns a stable platform type that never changes
 * between renders. Captured once via useRef so it obeys hooks rules.
 */
export function usePlatformType(): PlatformType {
  const ref = useRef<PlatformType>(getPlatformType());
  return ref.current;
}
