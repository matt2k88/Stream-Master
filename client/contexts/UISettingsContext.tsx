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

export type TextSize = "normal" | "medium" | "large";

interface UISettingsContextType {
  textSize: TextSize;
  textScale: number;
  setTextSize: (size: TextSize) => Promise<void>;
  toggleTextSize: () => Promise<void>;
  scaleFont: (base: number) => number;
  scaleLineHeight: (base: number) => number;
  autoPlayNext: boolean;
  toggleAutoPlayNext: () => Promise<void>;
}

const UISettingsContext = createContext<UISettingsContextType | undefined>(undefined);

const STORAGE_KEY = "ultracast.ui.textSize.v2";
// v1 key used the 2-state vocabulary ("normal" | "large"). On first launch
// after the upgrade we migrate the old value across so users don't get
// silently bumped to the new 1.4x Large tier.
const LEGACY_STORAGE_KEY_V1 = "ultracast.ui.textSize.v1";

const AUTO_PLAY_NEXT_KEY = "ultracast.ui.autoPlayNext.v1";

// Three readability tiers:
//   normal  — original sizes everywhere (1.0x)
//   medium  — comfortable bump, app-wide via auto-scaling ThemedText (~1.18x)
//   large   — much bigger for big TVs viewed from across a room (~1.4x)
const SCALE_NORMAL = 1.0;
const SCALE_MEDIUM = 1.18;
const SCALE_LARGE = 1.4;

const SCALE_MAP: Record<TextSize, number> = {
  normal: SCALE_NORMAL,
  medium: SCALE_MEDIUM,
  large: SCALE_LARGE,
};

const VALID_SIZES: TextSize[] = ["normal", "medium", "large"];

function isValidTextSize(v: unknown): v is TextSize {
  return typeof v === "string" && (VALID_SIZES as string[]).includes(v);
}

export function UISettingsProvider({ children }: { children: ReactNode }) {
  const [textSize, setTextSizeState] = useState<TextSize>("normal");
  const [hydrated, setHydrated] = useState(false);
  const [autoPlayNext, setAutoPlayNextState] = useState(true);

  // Load persisted preference once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && isValidTextSize(v)) {
          setTextSizeState(v);
        } else if (!cancelled) {
          // Try the v1 key (2-state vocabulary). Old "large" was a mild 1.18x
          // bump — map it to the new "medium" tier so users don't suddenly
          // jump to the much larger 1.4x Large.
          const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY_V1);
          let migrated: TextSize = "normal";
          if (legacy === "large") migrated = "medium";
          else if (legacy === "normal") migrated = "normal";
          if (!cancelled) {
            setTextSizeState(migrated);
            try {
              await AsyncStorage.setItem(STORAGE_KEY, migrated);
              if (legacy !== null) await AsyncStorage.removeItem(LEGACY_STORAGE_KEY_V1);
            } catch {
              // best-effort persistence
            }
          }
        }
      } catch {
        // ignore — fall back to default "normal"
      }

      // Load autoPlayNext setting (default true — existing users keep auto-play on)
      try {
        const apn = await AsyncStorage.getItem(AUTO_PLAY_NEXT_KEY);
        if (!cancelled && apn !== null) {
          setAutoPlayNextState(apn === "true");
        }
      } catch {
        // ignore — fall back to default true
      }

      if (!cancelled) setHydrated(true);
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
    // Cycle: normal → medium → large → normal
    const next: TextSize =
      textSize === "normal" ? "medium" : textSize === "medium" ? "large" : "normal";
    await setTextSize(next);
  }, [textSize, setTextSize]);

  const toggleAutoPlayNext = useCallback(async () => {
    const next = !autoPlayNext;
    setAutoPlayNextState(next);
    try {
      await AsyncStorage.setItem(AUTO_PLAY_NEXT_KEY, String(next));
    } catch {
      // best-effort persistence
    }
  }, [autoPlayNext]);

  const textScale = SCALE_MAP[textSize];

  // Backwards-compat helpers. ThemedText now auto-scales fontSize/lineHeight
  // via textScale, so these are pass-through (no-op) to avoid double-scaling
  // existing callsites that already use them.
  const scaleFont = useCallback((base: number) => Math.round(base), []);
  const scaleLineHeight = useCallback((base: number) => Math.round(base), []);

  const value = useMemo<UISettingsContextType>(
    () => ({ textSize, textScale, setTextSize, toggleTextSize, scaleFont, scaleLineHeight, autoPlayNext, toggleAutoPlayNext }),
    [textSize, textScale, setTextSize, toggleTextSize, scaleFont, scaleLineHeight, autoPlayNext, toggleAutoPlayNext],
  );

  // Avoid rendering subtree against the wrong default until storage is loaded.
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

// Non-throwing variant for low-level primitives (e.g. ThemedText) that may
// render outside the provider — error fallback UI, native Modal portals
// during fast-refresh, etc. Returns a safe default (no scaling) instead of
// crashing the screen.
const DEFAULT_UI_SETTINGS: UISettingsContextType = {
  textSize: "normal",
  textScale: 1,
  setTextSize: async () => {},
  toggleTextSize: async () => {},
  scaleFont: (base: number) => Math.round(base),
  scaleLineHeight: (base: number) => Math.round(base),
  autoPlayNext: true,
  toggleAutoPlayNext: async () => {},
};

export function useUISettingsSafe(): UISettingsContextType {
  const ctx = useContext(UISettingsContext);
  return ctx ?? DEFAULT_UI_SETTINGS;
}
