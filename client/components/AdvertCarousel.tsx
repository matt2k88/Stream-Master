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
}

const CYCLE_MS = 8000;
const FADE_MS = 300;

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
  // Remaining ms saved when hover starts (to resume from correct position)
  const remainingRef = useRef(CYCLE_MS);
  // Refs to avoid stale closures inside callbacks
  const advertsLenRef = useRef(0);
  const indexRef = useRef(0);
  const isActiveRef = useRef(false);
  const firstRender = useRef(true);

  const isActive = focused || hovered;

  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  useEffect(() => { advertsLenRef.current = adverts.length; }, [adverts.length]);
  useEffect(() => { indexRef.current = index; }, [index]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const stopProg = useCallback(() => {
    if (progAnimRef.current) { progAnimRef.current.stop(); progAnimRef.current = null; }
  }, []);

  // Start a fresh cycle from 0 (new advert shown).
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

  // Resume from the saved progress position (after hover ends).
  const resumeNext = useCallback((duration: number) => {
    clearTimer();
    stopProg();
    // Don't reset progressAnim — continue from where it froze
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

  // Fade out → setIndex. Fade in + scheduleNext handled by useEffect([index]).
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

  // ── Fade IN after index commits, then schedule next cycle ─────────────────
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const anim = Animated.timing(fadeAnim, { toValue: 1, duration: FADE_MS, useNativeDriver: true });
    anim.start(({ finished }) => {
      if (finished && advertsLenRef.current > 1 && !isActiveRef.current) {
        scheduleNext(CYCLE_MS);
      }
    });
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Start cycling when adverts load ──────────────────────────────────────
  useEffect(() => {
    if (adverts.length > 1) {
      scheduleNext(CYCLE_MS);
      return () => { clearTimer(); stopProg(); };
    }
  }, [adverts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pause / resume on hover or D-pad focus ────────────────────────────────
  useEffect(() => {
    if (isActive) {
      // Pause: clear timer, freeze progress, save remaining time
      clearTimer();
      progressAnim.stopAnimation((value) => {
        stopProg();
        remainingRef.current = Math.max(500, (1 - value) * CYCLE_MS);
      });
    } else {
      // Resume from frozen position
      if (advertsLenRef.current > 1) resumeNext(remainingRef.current);
    }
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dot navigation ────────────────────────────────────────────────────────
  const goTo = (i: number) => {
    if (i === indexRef.current) return;
    clearTimer();
    stopProg();
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true })
      .start(({ finished }) => {
        if (finished) setIndex(i);
      });
  };

  // ── Fetch adverts ─────────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────
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

  return (
    <Pressable
      focusable
      style={[styles.wrapper, style, isActive && styles.wrapperActive]}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      {/* Image layer — clipped to border radius */}
      <View style={styles.imageClip}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
          <Image
            source={{ uri: current.image_url }}
            style={StyleSheet.absoluteFillObject}
            contentFit={orientation === "landscape" ? "contain" : "cover"}
            transition={0}
          />
        </Animated.View>
      </View>

      {/* Advert name label */}
      {current.name ? (
        <View style={styles.label} pointerEvents="none">
          <ThemedText style={styles.labelText} numberOfLines={1}>
            {current.name}
          </ThemedText>
        </View>
      ) : null}

      {/* Dot indicators */}
      {adverts.length > 1 ? (
        <View style={styles.dots} pointerEvents="box-none">
          {adverts.map((_, i) => (
            <Pressable key={i} onPress={() => goTo(i)} hitSlop={6}>
              <View style={[styles.dot, i === index && styles.dotActive]} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Progress bar — subtle, shows time remaining on current advert */}
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
  );
}

const styles = StyleSheet.create({
  // Outer wrapper: holds border + glow. No overflow:hidden so shadow isn't clipped.
  wrapper: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  wrapperActive: {
    borderColor: Colors.dark.accent,
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 14,
    elevation: 18,
  },
  // Inner clip: clips image to border radius.
  imageClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
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
  label: {
    position: "absolute",
    bottom: Spacing.lg,
    left: Spacing.md,
    right: Spacing.md,
  },
  labelText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    fontWeight: "600",
  },
  dots: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
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
  progressTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderBottomLeftRadius: BorderRadius.md,
    borderBottomRightRadius: BorderRadius.md,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%" as any,
    backgroundColor: Colors.dark.accent,
    opacity: 0.65,
  },
});
