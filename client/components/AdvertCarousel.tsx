import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
  findNodeHandle,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { ThemedText } from "@/components/ThemedText";
import { Colors, BorderRadius, Spacing } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

interface Advert {
  id: string;
  name: string;
  image_url: string;
  orientation?: string | null;
  category?: string | null;
}

const CYCLE_MS = 8000;
const FADE_MS  = 300;

const CATEGORY_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  featured_event:  "star",
  featured_movie:  "film",
  featured_series: "grid",
  upcoming_event:  "calendar",
  new_release:     "zap",
  coming_soon:     "clock",
  exclusive:       "award",
  featured_advert: "trending-up",
};

const CATEGORY_LABEL: Record<string, string> = {
  featured_event:  "FEATURED EVENT",
  featured_movie:  "FEATURED MOVIE",
  featured_series: "FEATURED SERIES",
  upcoming_event:  "UPCOMING EVENT",
  new_release:     "NEW RELEASE",
  coming_soon:     "COMING SOON",
  exclusive:       "EXCLUSIVE",
  featured_advert: "FEATURED ADVERT",
};

// expo-image handles the crossfade natively at the GPU/decode level.
// When the `source` prop changes it holds the previous pixels until the new
// image is fully decoded, then dissolves between them — zero JS timing
// involvement, so the "flash of previous advert" that occurs with JS-driven
// Animated.Value opacity cannot happen here.
const IMAGE_TRANSITION = { duration: FADE_MS, effect: "cross-dissolve" } as const;

export default function AdvertCarousel({
  style,
  orientation,
  onFocusTag,
}: {
  style?: any;
  orientation?: "landscape" | "portrait";
  onFocusTag?: (tag: number | null) => void;
}) {
  const [adverts, setAdverts] = useState<Advert[]>([]);
  const [currIdx, setCurrIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);

  const focusRef     = useRef<View>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progAnimRef   = useRef<Animated.CompositeAnimation | null>(null);
  const remainingRef  = useRef(CYCLE_MS);
  const isActiveRef   = useRef(false);
  const currIdxRef    = useRef(0);
  const advertsLenRef = useRef(0);

  const isActive = focused || hovered;
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  useEffect(() => { currIdxRef.current = currIdx; }, [currIdx]);
  useEffect(() => { advertsLenRef.current = adverts.length; }, [adverts.length]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const stopProg = useCallback(() => {
    if (progAnimRef.current) { progAnimRef.current.stop(); progAnimRef.current = null; }
  }, []);

  const startCycle = useCallback((duration = CYCLE_MS) => {
    clearTimer();
    stopProg();
    progressAnim.setValue(0);
    remainingRef.current = duration;
    progAnimRef.current = Animated.timing(progressAnim, {
      toValue: 1, duration, useNativeDriver: false,
    });
    progAnimRef.current.start();
    timerRef.current = setTimeout(() => {
      if (advertsLenRef.current > 1 && !isActiveRef.current) doAdvance(); // eslint-disable-line
    }, duration);
  }, [clearTimer, stopProg, progressAnim]); // eslint-disable-line

  const resumeCycle = useCallback((duration: number) => {
    clearTimer();
    stopProg();
    const d = Math.max(200, duration);
    progAnimRef.current = Animated.timing(progressAnim, {
      toValue: 1, duration: d, useNativeDriver: false,
    });
    progAnimRef.current.start();
    timerRef.current = setTimeout(() => {
      if (advertsLenRef.current > 1 && !isActiveRef.current) doAdvance(); // eslint-disable-line
    }, d);
  }, [clearTimer, stopProg, progressAnim]); // eslint-disable-line

  // expo-image fires onLoad once the new image is fully decoded and the native
  // transition has begun. Start the next cycle timer from here so the progress
  // bar only moves once the image is actually visible.
  const handleLoad = useCallback(() => {
    if (advertsLenRef.current > 1 && !isActiveRef.current) startCycle();
  }, [startCycle]); // eslint-disable-line

  const doAdvance = useCallback(() => {
    const count = advertsLenRef.current;
    if (count <= 1) return;
    clearTimer();
    stopProg();
    // Changing source triggers expo-image's native cross-dissolve.
    // The previous image pixels are held until the new decode completes.
    setCurrIdx((prev) => (prev + 1) % count);
  }, [clearTimer, stopProg]);

  const goTo = useCallback((i: number) => {
    if (i === currIdxRef.current) return;
    clearTimer();
    stopProg();
    setCurrIdx(i);
  }, [clearTimer, stopProg]);

  useEffect(() => {
    if (isActive) {
      clearTimer();
      progressAnim.stopAnimation((value) => {
        stopProg();
        remainingRef.current = Math.max(500, (1 - value) * CYCLE_MS);
      });
    } else {
      if (advertsLenRef.current > 1) resumeCycle(remainingRef.current);
    }
  }, [isActive]); // eslint-disable-line

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const base = getApiUrl();
          const res  = await fetch(new URL("/api/adverts", base).toString());
          if (res.ok && !cancelled) {
            const data: Advert[] = await res.json();
            const matched = orientation
              ? data.filter((a) => !a.orientation || a.orientation === orientation)
              : data;
            setCurrIdx(0);
            setAdverts(matched);
          }
        } catch {
          // silently fail — shows placeholder
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
        clearTimer();
        stopProg();
      };
    }, []) // eslint-disable-line
  );

  if (loading) {
    return (
      <View style={[styles.wrapper, style, styles.placeholder]}>
        <Feather name="image" size={28} color="rgba(255,102,0,0.15)" />
      </View>
    );
  }

  if (adverts.length === 0) {
    return (
      <View style={[styles.wrapper, style, styles.placeholder]}>
        <Feather name="zap" size={22} color="rgba(255,102,0,0.2)" />
        <ThemedText style={styles.placeholderText}>Coming Soon</ThemedText>
      </View>
    );
  }

  const current  = adverts[currIdx];
  const catKey   = current.category ?? "";
  const catIcon  = (CATEGORY_ICON[catKey] ?? "star") as keyof typeof Feather.glyphMap;
  const catLabel = CATEGORY_LABEL[catKey] ?? catKey.replace(/_/g, " ").toUpperCase();

  return (
    <View style={styles.outerWrap}>
      <Pressable
        ref={focusRef}
        focusable
        style={[
          styles.wrapper,
          { aspectRatio: orientation === "portrait" ? 1920 / 1080 : 1920 / 400 },
          style,
          isActive && styles.wrapperActive,
        ]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onLayout={() => {
          if (!onFocusTag || Platform.OS === "web") return;
          onFocusTag(findNodeHandle(focusRef.current));
        }}
      >
        {/* Single image layer — expo-image owns the crossfade natively */}
        <Image
          source={{ uri: current.image_url }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          transition={IMAGE_TRANSITION}
          onLoad={handleLoad}
          onError={handleLoad}
        />

        {/* Category badge */}
        {current.category ? (
          <View style={styles.categoryRow}>
            <Feather name={catIcon} size={10} color={Colors.dark.accent} />
            <ThemedText style={styles.categoryText}>{catLabel}</ThemedText>
          </View>
        ) : null}

        {/* Progress bar */}
        {adverts.length > 1 ? (
          <View style={styles.progressTrack} pointerEvents="none">
            <Animated.View
              style={[
                styles.progressBar,
                {
                  width: progressAnim.interpolate({
                    inputRange:  [0, 1],
                    outputRange: ["0%", "100%"],
                  }),
                },
              ]}
            />
          </View>
        ) : null}
      </Pressable>

      {/* Dot indicators */}
      {adverts.length > 1 ? (
        <View style={styles.dotsRow}>
          {adverts.map((_, i) => (
            <Pressable key={i} onPress={() => goTo(i)} hitSlop={8}>
              <View style={[styles.dot, i === currIdx && styles.dotActive]} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrap: {
    width: "100%",
  },
  wrapper: {
    width: "100%",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundDefault,
    overflow: "hidden",
  },
  wrapperActive: {
    borderColor: Colors.dark.accent,
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 14,
    elevation: 18,
  },
  categoryRow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderTopRightRadius: BorderRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    paddingBottom: 7,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.dark.accent,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  progressTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  progressBar: {
    height: "100%" as any,
    backgroundColor: Colors.dark.accent,
    opacity: 0.65,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
    paddingTop: 5,
    paddingBottom: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  dotActive: {
    backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
    width: 14,
  },
  placeholder: {
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
    borderStyle: "dashed",
  },
  placeholderText: {
    color: "rgba(255,102,0,0.3)",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
