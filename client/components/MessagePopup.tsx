import React, { useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Modal,
  Animated,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useMessages } from "@/contexts/MessageContext";
import { LinearGradient } from "expo-linear-gradient";

export default function MessagePopup() {
  const { pendingMessage, dismissCurrent } = useMessages();
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (pendingMessage) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 180, friction: 12 }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0.88);
      fadeAnim.setValue(0);
    }
  }, [pendingMessage?.id]);

  if (!pendingMessage) return null;

  const formattedDate = new Date(pendingMessage.created_at).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={dismissCurrent}
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismissCurrent} />
        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
          <LinearGradient
            colors={["rgba(255,102,0,0.10)", "rgba(255,102,0,0.02)"]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Feather name="bell" size={18} color={Colors.dark.accent} />
            </View>
            <View style={styles.headerText}>
              <ThemedText style={styles.title}>Message</ThemedText>
              <ThemedText style={styles.date}>{formattedDate}</ThemedText>
            </View>
            <Pressable
              style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnActive]}
              onPress={dismissCurrent}
              hitSlop={8}
            >
              <Feather name="x" size={16} color={Colors.dark.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.divider} />

          {/* Message body */}
          <View style={styles.body}>
            <ThemedText style={styles.message}>{pendingMessage.message}</ThemedText>
          </View>

          {/* Dismiss button */}
          <Pressable
            style={({ pressed }) => [styles.dismissBtn, pressed && styles.dismissBtnActive]}
            onPress={dismissCurrent}
          >
            <ThemedText style={styles.dismissText}>Got it</ThemedText>
            <Feather name="check" size={14} color={Colors.dark.accent} />
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing["2xl"],
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: "rgba(255,102,0,0.35)",
    overflow: "hidden",
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.accentDim,
    borderWidth: 1,
    borderColor: Colors.dark.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  headerText: { flex: 1 },
  title: { fontSize: 15, fontWeight: "700", color: Colors.dark.text },
  date: { fontSize: 11, color: Colors.dark.textSecondary, marginTop: 1 },
  closeBtn: {
    width: 32, height: 32, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  closeBtnActive: { borderColor: Colors.dark.accent },
  divider: { height: 1, backgroundColor: Colors.dark.border, marginHorizontal: Spacing.lg },
  body: {
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  message: {
    fontSize: 14,
    color: Colors.dark.text,
    lineHeight: 22,
  },
  dismissBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    margin: Spacing.lg,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.accentDim,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
  },
  dismissBtnActive: { backgroundColor: "rgba(255,102,0,0.2)", borderColor: Colors.dark.accent },
  dismissText: { color: Colors.dark.accent, fontWeight: "700", fontSize: 13 },
});
