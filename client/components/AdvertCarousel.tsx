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
const FADE_MS  = 280;

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
  const [prevIdx, setPrevIdx] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);

  const focusRef = useRef<View>(null);

  // Two independent opacity values — one per image layer.
  // currOpacity: starts at 0, fades to 1 once the image loads.
  // prevOpacity: starts at 1, fades to 0 simultaneously with currOpacity fading in.
  // After the crossfade completes prevIdx is set to null so the layer is unmounted;
  // it can never flash back because it no longer exists in the tree.
  const currOpacity  = useRef(new Animated.Value(0)).current;
  const prevOpacity  = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const timerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progAnimRef     = useRef<Animated.CompositeAnimation | null>(null);
  const remainingRef    = useRef(CYCLE_MS);
  const isActiveRef     = useRef(false);
  const currIdxRef      = useRef(0);
  const advertsLenRef   = useRef(0);
  // True while a crossfade is in flight so we choose the right handleCurrLoad path.
  const isTransitionRef = useRef(false);

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

  // Start (or restart) the full CYCLE_MS progress + auto-advance timer.
  // Only called AFTER the incoming image has finished loading.
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

  // Resume with whatever time was left when the user paused.
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

  // Fired by the Image's onLoad (and onError as fallback) for the CURRENT slot.
  // • If a transition is in flight: crossfade prev out / curr in simultaneously.
  // • Otherwise (initial load or single image): simply fade curr in.
  // Timer never starts before this fires.
  const handleCurrLoad = useCallback(() => {
    if (isTransitionRef.current) {
      Animated.parallel([
        Animated.timing(currOpacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }),
        Animated.timing(prevOpacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) {
          isTransitionRef.current = false;
          setPrevIdx(null);          // unmount old layer — can never flash back
          prevOpacity.setValue(0);   // reset for next transition
          if (advertsLenRef.current > 1 && !isActiveRef.current) startCycle();
        }
      });
    } else {
      // Initial image load: no prev layer, just reveal.
      Animated.timing(currOpacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true })
        .start(({ finished }) => {
          if (finished && advertsLenRef.current > 1 && !isActiveRef.current) startCycle();
        });
    }
  }, [currOpacity, prevOpacity, startCycle]); // eslint-disable-line

  const doAdvance = useCallback(() => {
    const count = advertsLenRef.current;
    if (count <= 1) return;
    clearTimer();
    stopProg();

    const nextIdx = (currIdxRef.current + 1) % count;

    // Set up layers BEFORE state update so values are ready when the new
    // Image component mounts and begins loading.
    isTransitionRef.current = true;
    prevOpacity.setValue(1); // old image layer — fully visible
    currOpacity.setValue(0); // new image layer — hidden until loaded

    setPrevIdx(currIdxRef.current);
    setCurrIdx(nextIdx);
    // handleCurrLoad on the new currIdx Image will drive the rest.
  }, [clearTimer, stopProg, prevOpacity, currOpacity]);

  const goTo = useCallback((i: number) => {
    if (i === currIdxRef.current) return;
    clearTimer();
    stopProg();

    isTransitionRef.current = true;
    prevOpacity.setValue(1);
    currOpacity.setValue(0);

    setPrevIdx(currIdxRef.current);
    setCurrIdx(i);
  }, [clearTimer, stopProg, prevOpacity, currOpacity]);

  // Pause / resume when the user focuses or hovers.
  useEffect(() => {
    if (isActive) {
      clearTimer();
      progressAnim.stopAnimation((value) => {
        stopProg();
        remainingRef.current = Math.max(500, (1 - value) * CYCLE_MS);
      });
    } else {
      // Only resume if no crossfade is already in flight (handleCurrLoad starts
      // the timer itself once the transition completes).
      if (advertsLenRef.current > 1 && !isTransitionRef.current) {
        resumeCycle(remainingRef.current);
      }
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
            // Reset animation state for a clean first-load fade-in.
            currOpacity.setValue(0);
            prevOpacity.setValue(0);
            isTransitionRef.current = false;
            setPrevIdx(null);
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

  const current = adverts[currIdx];
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
        {/* ── Layer 1: outgoing image (fades out during crossfade, then unmounted) ── */}
        {prevIdx !== null ? (
          <Animated.View
            style={[StyleSheet.absoluteFill, { opacity: prevOpacity }]}
            pointerEvents="none"
          >
            <Image
              source={{ uri: adverts[prevIdx].image_url }}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              transition={0}
            />
          </Animated.View>
        ) : null}

        {/* ── Layer 2: incoming / current image (hidden until loaded, then fades in) ── */}
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: currOpacity }]}
          pointerEvents="none"
        >
          <Image
            source={{ uri: current.image_url }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            transition={0}
            onLoad={handleCurrLoad}
            onError={handleCurrLoad}
          />
        </Animated.View>

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
                    inputRange: [0, 1],
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
