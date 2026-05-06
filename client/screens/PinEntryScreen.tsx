import React, { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useProfile } from "@/contexts/ProfileContext";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type PinEntryRouteProp = RouteProp<RootStackParamList, "PinEntry">;

const KEYS = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

export default function PinEntryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<PinEntryRouteProp>();
  const { profile, fromHome } = route.params;
  const { setActiveProfile } = useProfile();

  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const padH = Math.max(insets.left + Spacing.sm, Spacing.lg);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);

  const shake = () => {
    setError(true);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start(() => { setPin(""); setError(false); });
  };

  const handleKey = (key: string) => {
    if (!key) return;
    if (key === "⌫") { setPin((p) => p.slice(0, -1)); setError(false); return; }
    if (pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    if (next.length === 4) {
      if (next === profile.pin) {
        setActiveProfile(profile);
        navigation.reset({ index: 0, routes: [{ name: "Home" }] });
      } else {
        setTimeout(shake, 100);
      }
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.topBar, { paddingTop: padT, paddingHorizontal: padH }]}>
        <Pressable
          style={({ pressed, focused }) => [styles.iconBtn, (pressed || focused) && styles.iconBtnActive]}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={18} color={Colors.dark.text} />
        </Pressable>
      </View>

      <View style={styles.body}>
        {/* Left: profile info */}
        <View style={styles.infoPanel}>
          <View style={[styles.avatarRing, { borderColor: profile.avatar_color, shadowColor: profile.avatar_color }]}>
            <View style={[styles.avatarInner, { backgroundColor: profile.avatar_color + "33" }]}>
              <Feather name={profile.avatar_icon as any} size={26} color={profile.avatar_color} />
            </View>
          </View>
          <ThemedText style={styles.profileName}>{profile.name}</ThemedText>
          <ThemedText style={styles.subtitle}>Enter your PIN</ThemedText>

          <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
            {[0,1,2,3].map((i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    borderColor: error ? Colors.dark.error : pin.length > i ? profile.avatar_color : Colors.dark.border,
                    backgroundColor: error ? Colors.dark.error : pin.length > i ? profile.avatar_color : "transparent",
                  },
                ]}
              />
            ))}
          </Animated.View>

          {error ? (
            <ThemedText style={styles.errorText}>Incorrect PIN</ThemedText>
          ) : (
            <View style={{ height: 18 }} />
          )}
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Right: numpad */}
        <View style={styles.padPanel}>
          <View style={styles.pad}>
            {KEYS.map((key, idx) => (
              <Pressable
                key={idx}
                style={({ pressed, focused }) => [
                  styles.key,
                  !key && styles.keyEmpty,
                  (pressed || focused) && key && key !== "⌫" && styles.keyPressed,
                  key === "⌫" && styles.keyDelete,
                  (pressed || focused) && key === "⌫" && styles.keyDeleteActive,
                ]}
                onPress={() => handleKey(key)}
                disabled={!key}
              >
                {key === "⌫" ? (
                  <Feather name="delete" size={16} color={Colors.dark.textSecondary} />
                ) : (
                  <ThemedText style={styles.keyText}>{key}</ThemedText>
                )}
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  topBar: {
    flexDirection: "row",
    paddingBottom: Spacing.xs,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  iconBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },

  body: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
    gap: Spacing.xl,
  },

  // Left panel — profile info
  infoPanel: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  avatarRing: {
    width: 70, height: 70, borderRadius: 35, borderWidth: 2,
    justifyContent: "center", alignItems: "center",
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8,
  },
  avatarInner: {
    width: 56, height: 56, borderRadius: 28,
    justifyContent: "center", alignItems: "center",
  },
  profileName: { fontSize: 17, fontWeight: "700", color: Colors.dark.text },
  subtitle: { fontSize: 13, color: Colors.dark.textSecondary },
  dotsRow: { flexDirection: "row", gap: Spacing.md },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  errorText: { color: Colors.dark.error, fontSize: 12, fontWeight: "500", height: 18 },

  divider: {
    width: 1,
    height: "70%",
    backgroundColor: Colors.dark.border,
  },

  // Right panel — numpad
  padPanel: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pad: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    width: 3 * 50 + 2 * 6,
    justifyContent: "center",
  },
  key: {
    width: 50, height: 50, borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  keyEmpty: { backgroundColor: "transparent", borderColor: "transparent" },
  keyPressed: { backgroundColor: Colors.dark.accentDim, borderColor: Colors.dark.accent },
  keyDelete: { backgroundColor: "transparent", borderColor: "transparent" },
  keyDeleteActive: { backgroundColor: Colors.dark.accentDim, borderColor: Colors.dark.accent },
  keyText: { color: Colors.dark.text, fontSize: 18, fontWeight: "600" },
});
