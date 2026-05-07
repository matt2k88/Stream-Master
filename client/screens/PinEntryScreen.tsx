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
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useProfile } from "@/contexts/ProfileContext";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type PinEntryRouteProp = RouteProp<RootStackParamList, "PinEntry">;

const KEYS = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

function KeyButton({ keyVal, onPress, autoFocus }: { keyVal: string; onPress: (k: string) => void; autoFocus?: boolean }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;

  if (!keyVal) {
    return <View style={styles.keyEmpty} />;
  }

  const isDelete = keyVal === "⌫";

  return (
    <Pressable
      style={[
        styles.key,
        isDelete && styles.keyDelete,
        isActive && styles.keyActive,
      ]}
      onPress={() => onPress(keyVal)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hasTVPreferredFocus={autoFocus}
      autoFocus={autoFocus}
    >
      {isActive ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.22)", "rgba(255,102,0,0.08)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}
      {isDelete ? (
        <Feather name="delete" size={16} color={isActive ? Colors.dark.accent : Colors.dark.textSecondary} />
      ) : (
        <ThemedText style={[styles.keyText, isActive && styles.keyTextActive]}>{keyVal}</ThemedText>
      )}
    </Pressable>
  );
}

function CloseButton({ onPress }: { onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[styles.closeBtn, isActive && styles.closeBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      <Feather name="x" size={16} color={isActive ? Colors.dark.accent : Colors.dark.textSecondary} />
    </Pressable>
  );
}

export default function PinEntryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<PinEntryRouteProp>();
  const { profile } = route.params;
  const { setActiveProfile } = useProfile();

  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

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
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => navigation.goBack()} />

      <View style={[styles.card, { marginBottom: insets.bottom }]}>
        <CloseButton onPress={() => navigation.goBack()} />

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
            {[0, 1, 2, 3].map((i) => (
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
              <KeyButton
                key={idx}
                keyVal={key}
                onPress={handleKey}
                autoFocus={key === "⌫"}
              />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    justifyContent: "center",
    alignItems: "center",
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing["2xl"],
    gap: Spacing.xl,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 20,
    position: "relative",
  },

  closeBtn: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    overflow: "hidden",
  },
  closeBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },

  infoPanel: {
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    minWidth: 160,
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
  dotsRow: { flexDirection: "row", gap: Spacing.md, marginTop: Spacing.xs },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  errorText: { color: Colors.dark.error, fontSize: 12, fontWeight: "500", height: 18 },

  divider: {
    width: 1,
    height: 160,
    backgroundColor: Colors.dark.border,
  },

  padPanel: {
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
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
    overflow: "hidden",
  },
  keyEmpty: { width: 50, height: 50 },
  keyDelete: { backgroundColor: "transparent", borderColor: "transparent" },
  keyActive: { borderColor: Colors.dark.accent },
  keyText: { color: Colors.dark.text, fontSize: 18, fontWeight: "600" },
  keyTextActive: { color: Colors.dark.accent },
});
