// Shared aspect-ratio helpers used by all player screens (PlayerScreen +
// VlcPlayerScreen). One source of truth for the modes, their labels, the
// underlying contentFit/resizeMode mapping, and the optional forced
// aspect-ratio numeric value.
//
// The chosen mode is persisted per-device via AsyncStorage so it survives
// app restarts. It is NOT per-stream — a user that picks "Zoom" once
// expects every subsequent video to open in Zoom until they change it.

import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type AspectMode = "fit" | "fill" | "zoom" | "16:9" | "4:3";

export const ASPECT_MODES: AspectMode[] = ["fit", "fill", "zoom", "16:9", "4:3"];

export const ASPECT_LABELS: Record<AspectMode, string> = {
  fit: "Best Fit",
  fill: "Stretch",
  zoom: "Zoom",
  "16:9": "16:9",
  "4:3": "4:3",
};

/** Map aspect mode to expo-video contentFit / VLC resizeMode value. For
 *  forced ratios (16:9 / 4:3) the VideoView is wrapped in an aspect-ratio
 *  box and the inner view stretches to fill it ("fill"). */
export function aspectModeToContentFit(mode: AspectMode): "contain" | "cover" | "fill" {
  switch (mode) {
    case "fit":   return "contain";
    case "zoom":  return "cover";
    case "fill":  return "fill";
    case "16:9":  return "fill";
    case "4:3":   return "fill";
  }
}

/** If the mode forces a specific picture aspect ratio, return the numeric
 *  ratio (width / height). Otherwise null — the player fills its natural
 *  parent box. */
export function aspectModeRatio(mode: AspectMode): number | null {
  if (mode === "16:9") return 16 / 9;
  if (mode === "4:3")  return 4 / 3;
  return null;
}

/** Compute the inner video-surface style for a mode inside a parent of
 *  width×height. Free modes (fit/fill/zoom) fill the whole parent and let
 *  contentFit/resizeMode decide how the picture sits. Forced ratios
 *  (16:9 / 4:3) get an explicit, centred box sized to fit inside the parent
 *  while preserving that exact ratio — giving deterministic letter/pillarbox
 *  instead of relying on `aspectRatio`+`maxWidth`, which RN sizes unreliably. */
export function aspectInnerStyle(
  mode: AspectMode,
  width: number,
  height: number,
): ViewStyle {
  const ratio = aspectModeRatio(mode);
  if (ratio == null || !width || !height) {
    return StyleSheet.absoluteFillObject;
  }
  let w = width;
  let h = width / ratio;
  if (h > height) {
    h = height;
    w = height * ratio;
  }
  return { width: w, height: h };
}

const STORAGE_KEY = "uc.player.aspectMode.v1";

/** React hook that reads the persisted aspect mode (defaults to "fit")
 *  and writes any change back to storage. The value updates synchronously
 *  on the calling component so the picker feels instant; the storage
 *  write is fire-and-forget. */
export function useAspectMode(): [AspectMode, (m: AspectMode) => void] {
  const [mode, setMode] = useState<AspectMode>("fit");
  const loadedRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v && (ASPECT_MODES as string[]).includes(v)) setMode(v as AspectMode);
      })
      .catch(() => {})
      .finally(() => { loadedRef.current = true; });
  }, []);

  const update = useCallback((next: AspectMode) => {
    setMode(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  return [mode, update];
}
