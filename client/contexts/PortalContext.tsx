import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { Image, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";

const DISC = 120;
const RING = DISC + 16;

interface PortalConfig {
  color: string;
  imageUri?: string | null;
  icon: string;
}

interface PortalCtx {
  triggerPortal: (config: PortalConfig, onNavigate: () => void) => void;
}

const Ctx = createContext<PortalCtx>({ triggerPortal: () => {} });

export function usePortal() {
  return useContext(Ctx);
}

// ── Isolated mask component so only it re-renders on holeR change ─────────────
function BlackMask({
  width,
  height,
  cx,
  cy,
  holeR,
}: {
  width: number;
  height: number;
  cx: number;
  cy: number;
  holeR: number;
}) {
  // SVG "even-odd" path: outer rectangle + inner circle traced as two arcs.
  // Even-odd rule makes the circle region empty (transparent hole).
  const r = Math.max(1, holeR);
  const d = [
    `M0,0 H${width} V${height} H0 Z`,
    `M${cx},${cy - r} A${r},${r},0,1,0,${cx},${cy + r} A${r},${r},0,1,0,${cx},${cy - r} Z`,
  ].join(" ");

  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width={width}
      height={height}
      pointerEvents="none"
    >
      <Path d={d} fill="#080808" fillRule="evenodd" />
    </Svg>
  );
}

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<PortalConfig | null>(null);
  const [holeR, setHoleR] = useState(0);
  const { width, height } = useWindowDimensions();

  // ── Shared animation values (Reanimated — UI thread) ─────────────────────
  const circleScale   = useSharedValue(0.6);
  const zoomScale     = useSharedValue(1);
  const avatarOpacity = useSharedValue(1);
  const ringOpacity   = useSharedValue(1);

  const combinedScale = useDerivedValue(
    () => circleScale.value * zoomScale.value,
  );

  // Sync the hole radius to JS state so the SVG mask can consume it.
  // useAnimatedReaction fires on the UI thread; runOnJS dispatches to JS.
  useAnimatedReaction(
    () => combinedScale.value * (DISC / 2),
    (r) => {
      runOnJS(setHoleR)(r);
    },
  );

  // Animated styles for Reanimated.View components
  const ringAnimStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: combinedScale.value }],
  }));
  const avatarAnimStyle = useAnimatedStyle(() => ({
    opacity: avatarOpacity.value,
  }));

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const triggerPortal = useCallback(
    (config: PortalConfig, onNavigate: () => void) => {
      timers.current.forEach(clearTimeout);
      timers.current = [];

      circleScale.value   = 0.6;
      zoomScale.value     = 1;
      avatarOpacity.value = 1;
      ringOpacity.value   = 1;

      setActive(config);

      // Phase 1 (0–650ms): spring circle up to centre-screen
      circleScale.value = withSpring(3.6, { damping: 16, stiffness: 90, mass: 1 });

      // Phase 2 (1900ms): avatar fades — ring becomes a transparent window
      avatarOpacity.value = withDelay(1900, withTiming(0, { duration: 350 }));

      // Navigate: home renders below the transparent hole (2200ms)
      timers.current.push(setTimeout(() => { onNavigate(); }, 2200));

      // Phase 3 (2450ms): zoom through — ring border fades as we pass it
      timers.current.push(
        setTimeout(() => {
          ringOpacity.value = withTiming(0, { duration: 300 });
          zoomScale.value = withTiming(
            14,
            { duration: 550, easing: Easing.in(Easing.cubic) },
            (finished) => {
              if (finished) {
                runOnJS(setActive)(null);
              }
            },
          );
        }, 2450),
      );
    },
    [circleScale, zoomScale, avatarOpacity, ringOpacity],
  );

  const cx = width / 2;
  const cy = height / 2;

  return (
    <Ctx.Provider value={{ triggerPortal }}>
      {children}

      {active ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Black overlay with a circular transparent hole — */}
          {/* outside the circle stays pitch black; inside shows the home screen */}
          <BlackMask
            width={width}
            height={height}
            cx={cx}
            cy={cy}
            holeR={holeR}
          />

          {/* Animated ring + avatar — zooms toward camera */}
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.center, ringAnimStyle]}
          >
            <View
              style={[
                styles.ring,
                {
                  width: RING,
                  height: RING,
                  borderRadius: RING / 2,
                  borderColor: active.color,
                  shadowColor: active.color,
                },
              ]}
            >
              <Animated.View style={avatarAnimStyle}>
                {active.imageUri ? (
                  <Image
                    source={{ uri: active.imageUri }}
                    style={{
                      width: DISC,
                      height: DISC,
                      borderRadius: DISC / 2,
                    }}
                  />
                ) : (
                  <LinearGradient
                    colors={[
                      active.color + "55",
                      active.color + "22",
                      "rgba(0,0,0,0.55)",
                    ]}
                    start={{ x: 0.3, y: 0.1 }}
                    end={{ x: 0.7, y: 1 }}
                    style={{
                      width: DISC,
                      height: DISC,
                      borderRadius: DISC / 2,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Feather
                      name={active.icon as any}
                      size={DISC * 0.46}
                      color="#fff"
                    />
                  </LinearGradient>
                )}
              </Animated.View>
            </View>
          </Animated.View>
        </View>
      ) : null}
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  ring: {
    borderWidth: 3,
    shadowOpacity: 0.95,
    shadowRadius: 28,
    elevation: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
});
