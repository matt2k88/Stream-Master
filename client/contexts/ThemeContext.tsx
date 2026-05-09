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
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: THEMES.default,
  themeKey: "default",
  loaded: true,
  getIcon: () => undefined,
});

// Mutates the shared Colors / Shadows objects so the inline
// `Colors.dark.accent` references that are read at render time pick up
// the new palette. Components re-render via the `key` we pass to
// ThemeProvider's child tree, which triggers a clean remount once the
// theme is fetched.
//
// LIMITATION: Module-scope `StyleSheet.create({ ... Colors.dark.accent })`
// captures the colour string at import time, so those frozen styles will
// keep the original orange even after mutation. This is acceptable here
// because (a) the dashboard button images change fully via context, and
// (b) the user explicitly asked to leave the broader Ultra Cast accent
// usage intact "where it makes sense" (e.g. VPN badge, profile selector).
// Inline `style={{ color: Colors.dark.accent }}` and runtime references
// like `iconColor = ... Colors.dark.accent` DO update on remount.
function applyPalette(theme: ThemeDef) {
  const { palette } = theme;
  const targets = [Colors.dark, Colors.light] as const;
  for (const t of targets) {
    t.accent = palette.accent;
    t.accentLight = palette.accentLight;
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) Apply cached theme immediately for a snappy launch — avoids the
      //    short window where children render with default while we fetch.
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (!cancelled && cached && isThemeKey(cached) && cached !== "default") {
          applyPalette(THEMES[cached]);
          setThemeKey(cached);
        }
      } catch {
        // ignore cache failures
      }

      // 2) Fetch the latest from the server. Only remount if it differs
      //    from what we already applied.
      try {
        const url = new URL("/api/app-theme", getApiUrl()).toString();
        const res = await fetch(url);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        const next = getTheme(data?.theme_key);
        if (cancelled) return;
        try {
          await AsyncStorage.setItem(CACHE_KEY, next.key);
        } catch {
          // ignore cache failures
        }
        // Only mutate + flip key if this is actually a change
        setThemeKey((prev) => {
          if (prev === next.key) return prev;
          applyPalette(next);
          return next.key;
        });
      } catch (err) {
        if (__DEV__) console.warn("[ThemeContext] fetch failed", err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const theme = THEMES[themeKey];
    return {
      theme,
      themeKey,
      loaded,
      getIcon: (k: ThemeIconKey) => theme.icons[k],
    };
  }, [themeKey, loaded]);

  // `key` on the wrapper forces a remount of the child tree when the theme
  // flips, so all `Colors.dark.accent` lookups resolve against the freshly
  // applied palette.
  return (
    <ThemeContext.Provider value={value}>
      <React.Fragment key={themeKey}>{children}</React.Fragment>
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
