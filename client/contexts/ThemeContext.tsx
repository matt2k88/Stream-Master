import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";
import { Colors, Shadows } from "@/constants/theme";
import { getTheme, THEMES, isThemeKey, type ThemeDef, type ThemeKey, type ThemeIconKey } from "@/constants/themes";

const CACHE_KEY = "ultracast.app_theme.v1";

interface ThemeContextValue {
  theme: ThemeDef;
  themeKey: ThemeKey;
  loaded: boolean;
  getIcon: (key: ThemeIconKey) => any | undefined;
  /** Re-fetch the active theme from the server and apply it if changed. */
  refetch: () => Promise<void>;
  /** Admin-controlled toggle: whether the NEW badge shows on Top Picks. Defaults true. */
  showTopPicksBadge: boolean;
  /** Admin-controlled toggle: whether the NEW badge shows on Ultra Tube. Defaults true. */
  showUltraTubeBadge: boolean;
  /** Admin-controlled toggle: whether the NEW badge shows on Sports on TV. Defaults true. */
  showSportsTvBadge: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: THEMES.default,
  themeKey: "default",
  loaded: true,
  getIcon: () => undefined,
  refetch: async () => {},
  showTopPicksBadge: true,
  showUltraTubeBadge: true,
  showSportsTvBadge: true,
});

// ── Hex / RGBA helpers ────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith("#")) return hex; // already rgba/rgb
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Mutates the shared Colors / Shadows objects so the inline
// `Colors.dark.accent` references that are read at render time pick up
// the new palette. Components re-render via the `key` we pass to
// ThemeProvider's child tree, which triggers a clean remount once the
// theme is fetched.
//
// LIMITATION: Module-scope `StyleSheet.create({ ... Colors.dark.accent })`
// captures the colour string at import time, so those frozen styles will
// keep the original orange even after mutation. The dashboard surfaces
// (HomeScreen, AnnouncementTicker, RecentlyWatchedCard, etc.) work around
// this by reading colours at render time via the `useAccent()` hook below
// and applying them as inline style overrides that win over the static
// stylesheet entries.
function applyPalette(theme: ThemeDef) {
  const { palette } = theme;
  const targets = [Colors.dark, Colors.light] as const;
  for (const t of targets) {
    t.accent = palette.accent;
    t.accentLight = palette.accentLight;
    (t as any).accentHover = palette.hover;
    t.accentDim = palette.accentDim;
    t.accentGlow = palette.accentGlow;
    t.accentGlowSoft = palette.accentGlowSoft;
    t.borderAccent = palette.borderAccent;
    t.link = palette.link;
    t.tabIconSelected = palette.tabIconSelected;
  }
  Shadows.glow.shadowColor = palette.glowShadow;
  Shadows.glowSoft.shadowColor = palette.glowShadow;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeKey, setThemeKey] = useState<ThemeKey>("default");
  const [loaded, setLoaded] = useState(false);
  const [showTopPicksBadge, setShowTopPicksBadge] = useState(true);
  const [showUltraTubeBadge, setShowUltraTubeBadge] = useState(true);
  const [showSportsTvBadge, setShowSportsTvBadge] = useState(true);

  const fetchTheme = React.useCallback(async () => {
    try {
      const url = new URL("/api/app-theme", getApiUrl()).toString();
      const res = await fetch(url);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      const next = getTheme(data?.theme_key);
      try {
        await AsyncStorage.setItem(CACHE_KEY, next.key);
      } catch {
        // ignore cache failures
      }
      setThemeKey((prev) => {
        if (prev === next.key) return prev;
        applyPalette(next);
        return next.key;
      });
      // badge fields default to true when the column is missing (migration not yet run)
      setShowTopPicksBadge(data?.show_top_picks_badge !== false);
      setShowSportsTvBadge(data?.show_sports_tv_badge !== false);
    } catch (err) {
      if (__DEV__) console.warn("[ThemeContext] fetch failed", err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) Apply cached theme immediately for a snappy launch.
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (!cancelled && cached && isThemeKey(cached) && cached !== "default") {
          applyPalette(THEMES[cached]);
          setThemeKey(cached);
        }
      } catch {
        // ignore cache failures
      }

      // 2) Fetch the latest from the server (theme + ultra tube config in parallel).
      if (!cancelled) {
        await Promise.all([
          fetchTheme(),
          fetch(new URL("/api/ultra-tube/config", getApiUrl()).toString())
            .then((r) => r.ok ? r.json() : null)
            .then((d) => { if (!cancelled) setShowUltraTubeBadge(d?.show_badge === true); })
            .catch(() => {}),
        ]);
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchTheme]);

  const value = useMemo<ThemeContextValue>(() => {
    const theme = THEMES[themeKey];
    return {
      theme,
      themeKey,
      loaded,
      getIcon: (k: ThemeIconKey) => theme.icons[k],
      refetch: fetchTheme,
      showTopPicksBadge,
      showUltraTubeBadge,
      showSportsTvBadge,
    };
  }, [themeKey, loaded, fetchTheme, showTopPicksBadge, showUltraTubeBadge, showSportsTvBadge]);

  return (
    <ThemeContext.Provider value={value}>
      <React.Fragment key={themeKey}>{children}</React.Fragment>
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}

// ── useAccent: render-time palette + helpers ───────────────────────────────
// Components that need to apply the theme's accent palette as inline style
// overrides should call this hook and spread the values into their JSX.
// All values are derived fresh from the current theme so they always reflect
// the active palette regardless of any cached `StyleSheet.create` content.
export interface AccentPalette {
  accent: string;
  accentLight: string;
  accentDim: string;
  accentGlow: string;
  accentGlowSoft: string;
  borderAccent: string;
  hover: string;
  /** Apply alpha to a hex color. If `color` omitted, uses the active accent. */
  withAlpha: (color: string, alpha?: number) => string;
  /** 3-stop gradient for the focused/active sheen on cards */
  gradStrong: [string, string, string];
  /** 3-stop gradient for the resting sheen on cards */
  gradSoft: [string, string, string];
  /** 2-stop gradient for narrower bars (search button, ticker) */
  pairStrong: [string, string];
  /** 2-stop softer gradient */
  pairSoft: [string, string];
}

export function useAccent(): AccentPalette {
  const { theme } = useAppTheme();
  return useMemo(() => {
    const p = theme.palette;
    const wa = (a: number) => withAlpha(p.accent, a);
    const waAny = (color: string, alpha: number = 1) => withAlpha(color, alpha);
    return {
      accent: p.accent,
      accentLight: p.accentLight,
      accentDim: p.accentDim,
      accentGlow: p.accentGlow,
      accentGlowSoft: p.accentGlowSoft,
      borderAccent: p.borderAccent,
      hover: p.hover,
      withAlpha: waAny,
      gradStrong: [wa(0.28), wa(0.10), wa(0.04)],
      gradSoft: [wa(0.10), wa(0.04), "rgba(0,0,0,0)"],
      pairStrong: [wa(0.22), wa(0.10)],
      pairSoft: [wa(0.09), wa(0.03)],
    };
  }, [theme]);
}
