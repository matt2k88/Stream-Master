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

export interface Advert {
  id: string;
  name: string;
  image_url: string;
  orientation?: string | null;
  category?: string | null;
  content_type?: string | null;
  content_id?: string | null;
  content_name?: string | null;
  content_icon?: string | null;
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
const IMAGE_TRANSITION = { duration: FADE_MS, effect: "cross-dissolve" } as const;

export default function AdvertCarousel({
  style,
  orientation,
  onFocusTag,
  onContentPress,
  isContentRestricted,
}: {
  style?: any;
  orientation?: "landscape" | "portrait";
  onFocusTag?: (tag: number | null) => void;
  onContentPress?: (advert: Advert) => void;
  isContentRestricted?: (advert: Advert) => boolean;
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

  const handleLoad = useCallback(() => {
    if (advertsLenRef.current > 1 && !isActiveRef.current) startCycle();
  }, [startCycle]); // eslint-disable-line

  const doAdvance = useCallback(() => {
    const count = advertsLenRef.current;
    if (count <= 1) return;
    clearTimer();
    stopProg();
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

  // When adverts are (re)loaded after a focus event, restart the cycle.
  // expo-image may skip onLoad for cached images, so we can't rely solely
  // on handleLoad to kick things off on return navigation.
  useEffect(() => {
    if (adverts.length > 1 && !isActiveRef.current) {
      startCycle();
    }
  }, [adverts]); // eslint-disable-line

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

  const current    = adverts[currIdx];
  const catKey     = current.category ?? "";
  const catIcon    = (CATEGORY_ICON[catKey] ?? "star") as keyof typeof Feather.glyphMap;
  const catLabel   = CATEGORY_LABEL[catKey] ?? catKey.replace(/_/g, " ").toUpperCase();
  const hasContent = !!(current.content_type && current.content_id);
  const restricted = hasContent && !!(isContentRestricted?.(current));
  const isMovie    = current.content_type === "movie";
  const isSeries   = current.content_type === "series";
  const ctaLabel   = (!restricted && isMovie) ? "Go to Movie" : (!restricted && isSeries) ? "Go to Series" : null;
  const ctaIcon: keyof typeof Feather.glyphMap = isMovie ? "film" : "grid";

  const handlePress = () => {
    if (hasContent && !restricted && onContentPress) onContentPress(current);
  };

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
        onPress={hasContent ? handlePress : undefined}
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

        {/* CTA pill — top-right, visible when content is linked */}
        {ctaLabel ? (
          <View
            style={[
              styles.ctaPill,
              isActive && styles.ctaPillActive,
            ]}
            pointerEvents="none"
          >
            <Feather
              name={ctaIcon}
              size={11}
              color={isActive ? Colors.dark.accent : "rgba(255,255,255,0.75)"}
            />
            <ThemedText
              style={[styles.ctaText, isActive && styles.ctaTextActive]}
            >
              {ctaLabel}
            </ThemedText>
            <Feather
              name="chevron-right"
              size={11}
              color={isActive ? Colors.dark.accent : "rgba(255,255,255,0.75)"}
            />
          </View>
        ) : null}

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
  ctaPill: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  ctaPillActive: {
    backgroundColor: "rgba(0,0,0,0.82)",
    borderColor: Colors.dark.accent,
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 10,
  },
  ctaText: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.75)",
    letterSpacing: 0.3,
  },
  ctaTextActive: {
    color: Colors.dark.accent,
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
