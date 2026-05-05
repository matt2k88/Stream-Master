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
}

const CYCLE_MS = 5000;

export default function AdvertCarousel({ style }: { style?: any }) {
  const [adverts, setAdverts] = useState<Advert[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const base = getApiUrl();
          const res = await fetch(new URL("/api/adverts", base).toString());
          if (res.ok && !cancelled) {
            const data = await res.json();
            setAdverts(data);
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

  const advance = useCallback(() => {
    if (adverts.length <= 1) return;
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setIndex((prev) => (prev + 1) % adverts.length);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });
  }, [adverts.length, fadeAnim]);

  useEffect(() => {
    if (adverts.length > 1) {
      timerRef.current = setInterval(advance, CYCLE_MS);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [adverts.length, advance]);

  const goTo = (i: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setIndex(i);
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
    if (adverts.length > 1) {
      timerRef.current = setInterval(advance, CYCLE_MS);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, style, styles.placeholder]}>
        <Feather name="image" size={28} color="rgba(255,102,0,0.15)" />
      </View>
    );
  }

  if (adverts.length === 0) {
    return (
      <View style={[styles.container, style, styles.placeholder]}>
        <Feather name="zap" size={22} color="rgba(255,102,0,0.2)" />
        <ThemedText style={styles.placeholderText}>Coming Soon</ThemedText>
      </View>
    );
  }

  const current = adverts[index];

  return (
    <View style={[styles.container, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
        <Image
          source={{ uri: current.image_url }}
          style={styles.image}
          contentFit="cover"
          transition={0}
        />
        {current.name ? (
          <View style={styles.label}>
            <ThemedText style={styles.labelText} numberOfLines={1}>
              {current.name}
            </ThemedText>
          </View>
        ) : null}
      </Animated.View>

      {/* Dot indicators */}
      {adverts.length > 1 ? (
        <View style={styles.dots}>
          {adverts.map((_, i) => (
            <Pressable key={i} onPress={() => goTo(i)} hitSlop={6}>
              <View style={[styles.dot, i === index && styles.dotActive]} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // 16:9 aspect ratio — width is set by parent, height derives from this
    aspectRatio: 16 / 9,
    width: "100%",
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.border,
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
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  label: {
    position: "absolute",
    bottom: Spacing.sm,
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
    bottom: Spacing.sm,
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
});
