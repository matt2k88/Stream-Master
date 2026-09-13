import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAppTheme } from "@/contexts/ThemeContext";

type Props = {
  variant?: "home" | "navigation";
};

type ThemeVisual = {
  glow: [string, string, string];
  secondary: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  icon2?: keyof typeof Feather.glyphMap;
  dots: string[];
};

const VISUALS: Record<string, ThemeVisual> = {
  halloween: {
    glow: ["rgba(255,117,24,0.18)", "rgba(73,24,111,0.08)", "rgba(0,0,0,0)"],
    secondary: "#9B5DE5",
    icon: "bat",
    icon2: "moon",
    dots: ["#FF7518", "#FF9F43", "#8E44AD"],
  },
  bonfire: {
    glow: ["rgba(255,82,24,0.18)", "rgba(192,76,255,0.07)", "rgba(0,0,0,0)"],
    secondary: "#FF6B35",
    icon: "fire",
    icon2: "star",
    dots: ["#FF5A1F", "#FFB000", "#C04CFF"],
  },
  christmas: {
    glow: ["rgba(230,57,70,0.15)", "rgba(20,110,74,0.09)", "rgba(0,0,0,0)"],
    secondary: "#2FB171",
    icon: "pine-tree",
    icon2: "star",
    dots: ["#E63946", "#FFD166", "#2FB171"],
  },
  valentines: {
    glow: ["rgba(255,61,138,0.16)", "rgba(128,24,71,0.08)", "rgba(0,0,0,0)"],
    secondary: "#FF8FB8",
    icon: "heart-outline",
    icon2: "heart",
    dots: ["#FF3D8A", "#FF8FB8", "#D946EF"],
  },
  newyear: {
    glow: ["rgba(255,215,0,0.16)", "rgba(44,82,155,0.09)", "rgba(0,0,0,0)"],
    secondary: "#FFE96B",
    icon: "firework",
    icon2: "star",
    dots: ["#FFD700", "#FFFFFF", "#6EA8FF"],
  },
};

export default function SeasonalAtmosphere({ variant = "home" }: Props) {
  const { themeKey } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);
  const drift = useRef(new Animated.Value(0)).current;
  const visual = VISUALS[themeKey];
  const compact = variant === "navigation";

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => mounted && setReduceMotion(enabled))
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    drift.stopAnimation();
    drift.setValue(0);
    if (!visual || reduceMotion || compact) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 14000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 14000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [compact, drift, reduceMotion, themeKey, visual]);

  const dots = useMemo(
    () => [
      { left: width * 0.13, bottom: height * 0.12, size: compact ? 3 : 5 },
      { left: width * 0.21, bottom: height * 0.19, size: compact ? 2 : 4 },
      { left: width * 0.78, top: height * 0.16, size: compact ? 3 : 5 },
      { left: width * 0.88, top: height * 0.27, size: compact ? 2 : 3 },
    ],
    [compact, height, width],
  );

  if (!visual) return null;

  const translateY = drift.interpolate({ inputRange: [0, 1], outputRange: [4, -12] });
  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [-3, 8] });
  const scale = drift.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] });
  const iconSize = compact ? 46 : Math.max(58, Math.min(110, width * 0.075));

  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.layer, compact && styles.compactLayer]}
    >
      <LinearGradient
        colors={visual.glow}
        start={{ x: 0, y: 1 }}
        end={{ x: 0.72, y: 0.1 }}
        style={styles.glowLeft}
      />
      {!compact ? (
        <LinearGradient
          colors={["rgba(0,0,0,0)", `${visual.secondary}12`, "rgba(0,0,0,0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.glowRight}
        />
      ) : null}

      <Animated.View
        style={[
          styles.primaryMark,
          compact && styles.compactMark,
          { transform: [{ translateX }, { translateY }, { scale }] },
        ]}
      >
        <MaterialCommunityIcons
          name={visual.icon}
          size={iconSize}
          color={visual.secondary}
          style={{ opacity: compact ? 0.07 : 0.1 }}
        />
      </Animated.View>

      {!compact && visual.icon2 ? (
        <Animated.View style={[styles.secondaryMark, { transform: [{ translateY }] }]}>
          <Feather name={visual.icon2} size={Math.max(28, iconSize * 0.48)} color={visual.secondary} style={styles.secondaryIcon} />
        </Animated.View>
      ) : null}

      {dots.slice(0, compact ? 2 : 4).map((dot, index) => (
        <Animated.View
          key={`${themeKey}-${index}`}
          style={[
            styles.dot,
            {
              left: dot.left,
              top: dot.top,
              bottom: dot.bottom,
            },
            {
              width: dot.size,
              height: dot.size,
              borderRadius: dot.size / 2,
              backgroundColor: visual.dots[index % visual.dots.length],
              shadowColor: visual.dots[index % visual.dots.length],
              opacity: compact ? 0.18 : 0.3,
              transform: [{ translateY }],
            },
          ]}
        />
      ))}

      {!compact && themeKey === "christmas" ? (
        <View style={styles.lightString}>
          {visual.dots.map((color, index) => (
            <View key={color} style={[styles.light, { backgroundColor: color, shadowColor: color, top: index * 5 }]} />
          ))}
        </View>
      ) : null}
      {!compact && themeKey === "halloween" ? <View style={[styles.moonArc, { borderColor: visual.secondary }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    zIndex: 0,
  },
  compactLayer: {
    opacity: 0.75,
  },
  glowLeft: {
    position: "absolute",
    left: 0,
    bottom: 0,
    width: "72%",
    height: "78%",
  },
  glowRight: {
    position: "absolute",
    right: "-8%",
    top: "-18%",
    width: "58%",
    height: "68%",
    transform: [{ rotate: "10deg" }],
  },
  primaryMark: {
    position: "absolute",
    right: "4%",
    top: "8%",
  },
  compactMark: {
    right: -5,
    top: 4,
  },
  secondaryMark: {
    position: "absolute",
    right: "15%",
    bottom: "10%",
  },
  secondaryIcon: {
    opacity: 0.07,
  },
  dot: {
    position: "absolute",
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 0,
  },
  lightString: {
    position: "absolute",
    top: 18,
    left: "34%",
    right: "28%",
    flexDirection: "row",
    justifyContent: "space-between",
    transform: [{ rotate: "-3deg" }],
  },
  light: {
    width: 5,
    height: 5,
    borderRadius: 3,
    opacity: 0.38,
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  moonArc: {
    position: "absolute",
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderLeftColor: "transparent",
    borderBottomColor: "transparent",
    opacity: 0.08,
    right: "13%",
    top: "24%",
    transform: [{ rotate: "-18deg" }],
  },
});