import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  Text,
  useWindowDimensions,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Colors, Spacing } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

const SPEED = 90; // pixels per second

export default function AnnouncementTicker() {
  const { width: screenWidth } = useWindowDimensions();
  const [ticker, setTicker] = useState<string>("");
  const translateX = useRef(new Animated.Value(0)).current;
  const textWidthRef = useRef(0);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const base = getApiUrl();
          const res = await fetch(new URL("/api/announcements", base).toString());
          if (res.ok && !cancelled) {
            const data: { id: string; message: string }[] = await res.json();
            if (data.length > 0) {
              const joined = data.map((a) => a.message).join("     •     ") + "     •     ";
              setTicker(joined);
            } else {
              setTicker("");
            }
          }
        } catch {
          // silently ignore
        }
      })();
      return () => { cancelled = true; };
    }, [])
  );

  const startScroll = useCallback(() => {
    if (!mountedRef.current || textWidthRef.current === 0) return;
    const textWidth = textWidthRef.current;
    const totalDistance = screenWidth + textWidth;
    const duration = (totalDistance / SPEED) * 1000;

    translateX.setValue(screenWidth);

    animRef.current = Animated.timing(translateX, {
      toValue: -textWidth,
      duration,
      easing: Easing.linear,
      useNativeDriver: Platform.OS !== "web",
    });

    animRef.current.start(({ finished }) => {
      if (finished && mountedRef.current) {
        startScroll();
      }
    });
  }, [screenWidth, translateX]);

  const handleTextLayout = useCallback(
    (width: number) => {
      if (textWidthRef.current !== 0) return;
      textWidthRef.current = width;
      startScroll();
    },
    [startScroll]
  );

  useEffect(() => {
    return () => {
      animRef.current?.stop();
    };
  }, []);

  // Restart if screenWidth changes
  useEffect(() => {
    if (textWidthRef.current > 0) {
      animRef.current?.stop();
      startScroll();
    }
  }, [screenWidth, startScroll]);

  if (!ticker) return null;

  return (
    <View style={styles.container}>
      {/* Static label */}
      <View style={styles.label}>
        <Feather name="radio" size={11} color={Colors.dark.accent} />
        <Text style={styles.labelText}>LIVE</Text>
      </View>
      <View style={styles.dividerV} />

      {/* Scrolling area */}
      <View style={styles.scrollArea}>
        <Animated.View
          style={[styles.scrollRow, { transform: [{ translateX }] }]}
        >
          <Text
            style={styles.tickerText}
            numberOfLines={1}
            ellipsizeMode="clip"
            onLayout={(e) => handleTextLayout(e.nativeEvent.layout.width)}
          >
            {ticker}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255,102,0,0.25)",
    overflow: "hidden",
  },
  label: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    height: "100%",
    backgroundColor: "rgba(255,102,0,0.12)",
    borderRightWidth: 1,
    borderRightColor: "rgba(255,102,0,0.25)",
  },
  labelText: {
    color: Colors.dark.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  dividerV: {
    width: 1,
    height: "100%",
  },
  scrollArea: {
    flex: 1,
    overflow: "hidden",
    height: "100%",
    justifyContent: "center",
  },
  scrollRow: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    // Huge width so single-line Text can lay out at its true natural width
    // (otherwise RN clips numberOfLines=1 text to the parent scroll area).
    width: 100000,
  },
  tickerText: {
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: "500",
    opacity: 0.9,
    flexShrink: 0,
    whiteSpace: "nowrap",
  } as any,
});
