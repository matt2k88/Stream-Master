import React, { useState } from "react";
import { Pressable, View, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

type Props = {
  onPress: () => void;
  size?: "sm" | "md";
};

export default function SearchClearButton({ onPress, size = "md" }: Props) {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const active = pressed || focused || hovered;

  const iconSize = size === "sm" ? 13 : 14;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={Platform.OS === "web" ? () => setHovered(true) : undefined}
      onHoverOut={Platform.OS === "web" ? () => setHovered(false) : undefined}
      hitSlop={6}
      style={[styles.btn, active && styles.btnActive]}
      accessibilityRole="button"
      accessibilityLabel="Clear search"
    >
      <Feather
        name="x-circle"
        size={iconSize}
        color={active ? Colors.dark.accent : Colors.dark.textSecondary}
      />
      <ThemedText
        style={[
          styles.label,
          { color: active ? Colors.dark.accent : Colors.dark.textSecondary },
        ]}
      >
        Clear
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  btnActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accentDim,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
