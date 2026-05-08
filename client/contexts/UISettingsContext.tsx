import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type TextSize = "normal" | "large";

interface UISettingsContextType {
  textSize: TextSize;
  textScale: number;
  setTextSize: (size: TextSize) => Promise<void>;
  toggleTextSize: () => Promise<void>;
  scaleFont: (base: number) => number;
  scaleLineHeight: (base: number) => number;
}

const UISettingsContext = createContext<UISettingsContextType | undefined>(undefined);

const STORAGE_KEY = "ultracast.ui.textSize.v1";

// Conservative scale — bumps readability noticeably without breaking
// tightly-packed layouts (sidebar widths, button heights, EPG block widths,
// etc. were all designed around the "normal" font sizes).
const SCALE_NORMAL = 1.0;
const SCALE_LARGE = 1.18;

export function UISettingsProvider({ children }: { children: ReactNode }) {
  const [textSize, setTextSizeState] = useState<TextSize>("normal");
  const [hydrated, setHydrated] = useState(false);

  // Load persisted preference once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && (v === "large" || v === "normal")) {
          setTextSizeState(v);
        }
      } catch {
        // ignore — fall back to default "normal"
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setTextSize = useCallback(async (size: TextSize) => {
    setTextSizeState(size);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, size);
    } catch {
      // ignore — runtime state already updated, persistence is best-effort
    }
  }, []);

  const toggleTextSize = useCallback(async () => {
    const next: TextSize = textSize === "large" ? "normal" : "large";
    await setTextSize(next);
  }, [textSize, setTextSize]);

  const textScale = textSize === "large" ? SCALE_LARGE : SCALE_NORMAL;

  // Helpers: rounded so React Native doesn't get sub-pixel font sizes
  const scaleFont = useCallback((base: number) => Math.round(base * textScale), [textScale]);
  const scaleLineHeight = useCallback(
    (base: number) => Math.round(base * textScale),
    [textScale],
  );

  const value = useMemo<UISettingsContextType>(
    () => ({ textSize, textScale, setTextSize, toggleTextSize, scaleFont, scaleLineHeight }),
    [textSize, textScale, setTextSize, toggleTextSize, scaleFont, scaleLineHeight],
  );

  // Avoid rendering subtree against the wrong default until storage is loaded —
  // prevents a flash of normal-text on devices where user has set "large".
  if (!hydrated) return null;

  return <UISettingsContext.Provider value={value}>{children}</UISettingsContext.Provider>;
}

export function useUISettings(): UISettingsContextType {
  const ctx = useContext(UISettingsContext);
  if (!ctx) {
    throw new Error("useUISettings must be used inside <UISettingsProvider>");
  }
  return ctx;
}
