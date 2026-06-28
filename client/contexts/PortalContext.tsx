import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  View,
} from "react-native";
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

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<PortalConfig | null>(null);

  const circleScale   = useRef(new Animated.Value(1)).current;
  const avatarOpacity = useRef(new Animated.Value(1)).current;
  const bgOpacity     = useRef(new Animated.Value(0)).current;
  const zoomScale     = useRef(new Animated.Value(1)).current;
  const ringOpacity   = useRef(new Animated.Value(1)).current;

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const triggerPortal = useCallback(
    (config: PortalConfig, onNavigate: () => void) => {
      timers.current.forEach(clearTimeout);
      timers.current = [];

      circleScale.setValue(0.6);
      avatarOpacity.setValue(1);
      bgOpacity.setValue(0);
      zoomScale.setValue(1);
      ringOpacity.setValue(1);
      setActive(config);

      // Phase 1 (0–650ms): spring circle up + dark bg fades in
      Animated.parallel([
        Animated.spring(circleScale, {
          toValue: 3.6,
          useNativeDriver: true,
          damping: 16,
          stiffness: 90,
          mass: 1,
        }),
        Animated.timing(bgOpacity, {
          toValue: 0.93,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();

      // Phase 2 (1900ms): avatar fades out
      timers.current.push(
        setTimeout(() => {
          Animated.timing(avatarOpacity, {
            toValue: 0,
            duration: 350,
            useNativeDriver: true,
          }).start();
        }, 1900),
      );

      // Phase 2b (2100ms): bg fades to 0 → home screen reveals below
      timers.current.push(
        setTimeout(() => {
          Animated.timing(bgOpacity, {
            toValue: 0,
            duration: 300,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }).start();
        }, 2100),
      );

      // Navigate (2200ms): home screen renders below the transparent overlay
      timers.current.push(
        setTimeout(() => {
          onNavigate();
        }, 2200),
      );

      // Phase 3 (2450ms): zoom through — ring fades as we pass it
      timers.current.push(
        setTimeout(() => {
          Animated.parallel([
            Animated.timing(zoomScale, {
              toValue: 14,
              duration: 550,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(ringOpacity, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setActive(null);
          });
        }, 2450),
      );
    },
    [circleScale, avatarOpacity, bgOpacity, zoomScale, ringOpacity],
  );

  const combinedScale = Animated.multiply(circleScale, zoomScale);

  return (
    <Ctx.Provider value={{ triggerPortal }}>
      {children}
      {active ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Dark bg behind the ring — fades in then out */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "#080808", opacity: bgOpacity },
            ]}
          />
          {/* The ring — centred, enlarges then zooms through */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.center,
              {
                opacity: ringOpacity,
                transform: [{ scale: combinedScale }],
              },
            ]}
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
              <Animated.View style={{ opacity: avatarOpacity }}>
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
