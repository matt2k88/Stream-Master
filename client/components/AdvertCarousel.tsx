import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
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
const FADE_MS = 300;

const CATEGORY_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  featured_event: "star",
  featured_movie: "film",
  featured_series: "grid",
  upcoming_event: "calendar",
  new_release: "zap",
  coming_soon: "clock",
  exclusive: "award",
  featured_advert: "trending-up",
};

const CATEGORY_LABEL: Record<string, string> = {
  featured_event: "FEATURED EVENT",
  featured_movie: "FEATURED MOVIE",
  featured_series: "FEATURED SERIES",
  upcoming_event: "UPCOMING EVENT",
  new_release: "NEW RELEASE",
  coming_soon: "COMING SOON",
  exclusive: "EXCLUSIVE",
  featured_advert: "FEATURED ADVERT",
};

export default function AdvertCarousel({
  style,
  orientation,
}: {
  style?: any;
  orientation?: "landscape" | "portrait";
}) {
  const [adverts, setAdverts] = useState<Advert[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const remainingRef = useRef(CYCLE_MS);
  const advertsLenRef = useRef(0);
  const indexRef = useRef(0);
  const isActiveRef = useRef(false);
  const firstRender = useRef(true);

  const isActive = focused || hovered;

  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  useEffect(() => { advertsLenRef.current = adverts.length; }, [adverts.length]);
  useEffect(() => { indexRef.current = index; }, [index]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const stopProg = useCallback(() => {
    if (progAnimRef.current) { progAnimRef.current.stop(); progAnimRef.current = null; }
  }, []);

  const scheduleNext = useCallback((duration: number = CYCLE_MS) => {
    clearTimer();
    stopProg();
    progressAnim.setValue(0);
    progAnimRef.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration,
      useNativeDriver: false,
    });
    progAnimRef.current.start();
    remainingRef.current = duration;
    timerRef.current = setTimeout(() => {
      if (advertsLenRef.current > 1 && !isActiveRef.current) doAdvance();
    }, duration);
  }, [clearTimer, stopProg, progressAnim]); // eslint-disable-line react-hooks/exhaustive-deps

  const resumeNext = useCallback((duration: number) => {
    clearTimer();
    stopProg();
    progAnimRef.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration: Math.max(200, duration),
      useNativeDriver: false,
    });
    progAnimRef.current.start();
    timerRef.current = setTimeout(() => {
      if (advertsLenRef.current > 1 && !isActiveRef.current) doAdvance();
    }, Math.max(200, duration));
  }, [clearTimer, stopProg, progressAnim]); // eslint-disable-line react-hooks/exhaustive-deps

  const doAdvance = useCallback(() => {
    const count = advertsLenRef.current;
    if (count <= 1) return;
    clearTimer();
    stopProg();
    Animated.timing(fadeAnim, { toValue: 0, duration: FADE_MS, useNativeDriver: true })
      .start(({ finished }) => {
        if (finished) setIndex((prev) => (prev + 1) % count);
      });
  }, [fadeAnim, clearTimer, stopProg]);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const anim = Animated.timing(fadeAnim, { toValue: 1, duration: FADE_MS, useNativeDriver: true });
    anim.start(({ finished }) => {
      if (finished && advertsLenRef.current > 1 && !isActiveRef.current) {
        scheduleNext(CYCLE_MS);
      }
    });
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (adverts.length > 1) {
      scheduleNext(CYCLE_MS);
      return () => { clearTimer(); stopProg(); };
    }
  }, [adverts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isActive) {
      clearTimer();
      progressAnim.stopAnimation((value) => {
        stopProg();
        remainingRef.current = Math.max(500, (1 - value) * CYCLE_MS);
      });
    } else {
      if (advertsLenRef.current > 1) resumeNext(remainingRef.current);
    }
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = (i: number) => {
    if (i === indexRef.current) return;
    clearTimer();
    stopProg();
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true })
      .start(({ finished }) => {
        if (finished) setIndex(i);
      });
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const base = getApiUrl();
          const res = await fetch(new URL("/api/adverts", base).toString());
          if (res.ok && !cancelled) {
            const data: Advert[] = await res.json();
            const matched = orientation
              ? data.filter((a) => !a.orientation || a.orientation === orientation)
              : data;
            setAdverts(matched);
            setIndex(0);
          }
        } catch {
          // silently fail — shows placeholder
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, [])
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

  const current = adverts[index];
  const catKey = current.category ?? "";
  const catIcon = (CATEGORY_ICON[catKey] ?? "star") as keyof typeof Feather.glyphMap;
  const catLabel = CATEGORY_LABEL[catKey] ?? catKey.replace(/_/g, " ").toUpperCase();

  return (
    <View style={styles.outerWrap}>
      <Pressable
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
      >
        {/* Image — absoluteFill so the category badge doesn't steal any height */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
          <Image
            source={{ uri: current.image_url }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            transition={0}
          />
        </Animated.View>

        {/* Category badge — top-left corner pill */}
        {current.category ? (
          <View style={styles.categoryRow}>
            <Feather name={catIcon} size={10} color={Colors.dark.accent} />
            <ThemedText style={styles.categoryText}>{catLabel}</ThemedText>
          </View>
        ) : null}

        {/* Progress bar — absolute bottom */}
        {adverts.length > 1 ? (
          <View style={styles.progressTrack} pointerEvents="none">
            <Animated.View
              style={[
                styles.progressBar,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0%", "100%"],
                  }),
                },
              ]}
            />
          </View>
        ) : null}
      </Pressable>

      {/* Dot indicators — below the image, outside the pressable */}
      {adverts.length > 1 ? (
        <View style={styles.dotsRow}>
          {adverts.map((_, i) => (
            <Pressable key={i} onPress={() => goTo(i)} hitSlop={8}>
              <View style={[styles.dot, i === index && styles.dotActive]} />
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
    // aspectRatio set inline — orientation-dependent (landscape 4.8:1, portrait 16:9)
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
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: 0,
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
  imageArea: {
    flex: 1,
  },
  imageClip: {
    ...StyleSheet.absoluteFillObject,
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
