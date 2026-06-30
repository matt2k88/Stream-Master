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
  useAnimatedProps,
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

// Animated SVG Path that runs entirely on the UI thread — no JS bridge per frame.
const AnimatedPath = Animated.createAnimatedComponent(Path);

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

// ── BlackMask uses AnimatedPath so SVG path updates stay on the UI thread ─────
function BlackMask({
  width,
  height,
  cx,
  cy,
  combinedScale,
}: {
  width: number;
  height: number;
  cx: number;
  cy: number;
  combinedScale: Animated.SharedValue<number>;
}) {
  const pathProps = useAnimatedProps(() => {
    const r = Math.max(1, combinedScale.value * (DISC / 2));
    const d = [
      `M0,0 H${width} V${height} H0 Z`,
      `M${cx},${cy - r} A${r},${r},0,1,0,${cx},${cy + r} A${r},${r},0,1,0,${cx},${cy - r} Z`,
    ].join(" ");
    return { d };
  });

  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width={width}
      height={height}
      pointerEvents="none"
    >
      <AnimatedPath animatedProps={pathProps} fill="#080808" fillRule="evenodd" />
    </Svg>
  );
}

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<PortalConfig | null>(null);
  const { width, height } = useWindowDimensions();

  // ── Shared animation values (Reanimated — UI thread) ─────────────────────
  const circleScale   = useSharedValue(0);
  const zoomScale     = useSharedValue(1);
  const avatarOpacity = useSharedValue(1);
  const ringOpacity   = useSharedValue(1);

  const combinedScale = useDerivedValue(
    () => circleScale.value * zoomScale.value,
  );

  // Animated styles for Reanimated.View components
  const ringAnimStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: combinedScale.value }],
  }));
  const avatarAnimStyle = useAnimatedStyle(() => ({
    opacity: avatarOpacity.value,
  }));

  // Overlay visibility — kept as animated opacity so the SVG and ring
  // components are always mounted (pre-warmed) but invisible when idle.
  const overlayOpacity = useSharedValue(0);
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const triggerPortal = useCallback(
    (config: PortalConfig, onNavigate: () => void) => {
      timers.current.forEach(clearTimeout);
      timers.current = [];

      // Reset values
      circleScale.value   = 0.6;
      zoomScale.value     = 1;
      avatarOpacity.value = 1;
      ringOpacity.value   = 1;

      runOnJS(setActive)(config);

      // Show overlay immediately
      overlayOpacity.value = 1;

      // Navigate after a short delay so the home screen loads behind the
      // overlay while the animation plays.
      timers.current.push(setTimeout(() => { onNavigate(); }, 120));

      // Phase 1 (0–650ms): spring circle up to centre-screen
      circleScale.value = withSpring(3.6, { damping: 16, stiffness: 90, mass: 1 });

      // Phase 2 (1900ms): avatar fades — ring becomes a transparent window
      avatarOpacity.value = withDelay(1900, withTiming(0, { duration: 350 }));

      // Phase 3 (2450ms): zoom through — ring border fades as we pass it
      timers.current.push(
        setTimeout(() => {
          ringOpacity.value = withTiming(0, { duration: 300 });
          zoomScale.value = withTiming(
            14,
            { duration: 550, easing: Easing.in(Easing.cubic) },
            (finished) => {
              if (finished) {
                overlayOpacity.value = withTiming(0, { duration: 50 }, () => {
                  runOnJS(setActive)(null);
                  circleScale.value = 0;
                });
              }
            },
          );
        }, 2450),
      );
    },
    [circleScale, zoomScale, avatarOpacity, ringOpacity, overlayOpacity],
  );

  const cx = width / 2;
  const cy = height / 2;

  return (
    <Ctx.Provider value={{ triggerPortal }}>
      {children}

      {/* Always mounted so SVG + Animated components are pre-warmed.
          Invisible (opacity 0) when no portal is active. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, overlayStyle]}
        pointerEvents="none"
      >
        <BlackMask
          width={width}
          height={height}
          cx={cx}
          cy={cy}
          combinedScale={combinedScale}
        />

        {/* Animated ring + avatar — zooms toward camera */}
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.center, ringAnimStyle]}
        >
          {active ? (
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
                  <View
                    style={{
                      width: DISC,
                      height: DISC,
                      borderRadius: DISC / 2,
                      overflow: "hidden",
                      backgroundColor: "#0D0403",
                    }}
                  >
                    <LinearGradient
                      colors={[
                        active.color + "CC",
                        active.color + "66",
                        "#0D0403",
                      ]}
                      start={{ x: 0.3, y: 0.1 }}
                      end={{ x: 0.7, y: 1 }}
                      style={{
                        width: DISC,
                        height: DISC,
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
                  </View>
                )}
              </Animated.View>
            </View>
          ) : null}
        </Animated.View>
      </Animated.View>
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
