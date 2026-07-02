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
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";

const DISC = 90;

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

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<PortalConfig | null>(null);
  const { width, height } = useWindowDimensions();

  // Single opacity drives the whole overlay — simple, runs on UI thread,
  // zero GPU overhead (no SVG, no masks, no shadows).
  const opacity   = useSharedValue(0);
  // Avatar scales down as we fade out, giving a subtle depth cue
  const avatarScale = useSharedValue(1);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const avatarStyle = useAnimatedStyle(() => ({
    transform: [{ scale: avatarScale.value }],
    opacity: opacity.value,
  }));

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const triggerPortal = useCallback(
    (config: PortalConfig, onNavigate: () => void) => {
      timers.current.forEach(clearTimeout);
      timers.current = [];

      runOnJS(setActive)(config);

      // Reset
      opacity.value      = 0;
      avatarScale.value  = 1;

      // ── Phase 1 (0–220ms): fade overlay in ────────────────────────────────
      opacity.value = withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.quad),
      });

      // ── Phase 2 (180ms): navigate while overlay is still opaque ───────────
      // New screen loads silently behind the black curtain — no jank visible.
      timers.current.push(setTimeout(onNavigate, 180));

      // ── Phase 3 (360ms): shrink avatar, then fade overlay out ─────────────
      timers.current.push(
        setTimeout(() => {
          avatarScale.value = withTiming(0.6, { duration: 320 });
          opacity.value = withTiming(
            0,
            { duration: 380, easing: Easing.in(Easing.quad) },
            (finished) => {
              if (finished) {
                runOnJS(setActive)(null);
                avatarScale.value = 1;
              }
            },
          );
        }, 360),
      );
    },
    [opacity, avatarScale],
  );

  const cx = width / 2;
  const cy = height / 2;

  return (
    <Ctx.Provider value={{ triggerPortal }}>
      {children}

      {/* ── Dark curtain — always mounted for instant response ── */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.curtain, overlayStyle]}
        pointerEvents="none"
      >
        {/* Profile avatar centred on the curtain */}
        {active ? (
          <Animated.View style={[styles.avatarWrap, avatarStyle]}>
            {active.imageUri ? (
              <Image
                source={{ uri: active.imageUri }}
                style={{ width: DISC, height: DISC, borderRadius: DISC / 2 }}
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
                  colors={[active.color + "CC", active.color + "44", "#0D0403"]}
                  start={{ x: 0.3, y: 0 }}
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
        ) : null}
      </Animated.View>
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  curtain: {
    backgroundColor: "#080808",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});
