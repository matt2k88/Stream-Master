import React, { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useAccent } from "@/contexts/ThemeContext";

interface Props {
  /** Feather icon shown in the ring. Defaults to "user-plus". */
  icon?: keyof typeof Feather.glyphMap;
  /** Headline, e.g. "Save Your Favourites". */
  title?: string;
  /** Body line, e.g. "Create a profile to save favourites". */
  message: string;
  /** Compact = inline card area (HomeScreen). Full = centered empty state. */
  variant?: "compact" | "full";
  /** Optional CTA — when provided a "Create Profile" button is shown. */
  onCreateProfile?: () => void;
  style?: any;
}

export default function GuestPrompt({
  icon = "user-plus",
  title,
  message,
  variant = "full",
  onCreateProfile,
  style,
}: Props) {
  const accent = useAccent();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const active = hovered || focused;
  const compact = variant === "compact";

  return (
    <View style={[compact ? styles.compactWrap : styles.fullWrap, style]}>
      <View
        style={[
          compact ? styles.iconRingSm : styles.iconRing,
          { borderColor: accent.withAlpha(accent.accent, 0.4) },
        ]}
      >
        <Feather
          name={icon}
          size={compact ? 18 : 30}
          color={accent.accent}
        />
      </View>

      {title ? (
        <ThemedText style={compact ? styles.titleSm : styles.title}>{title}</ThemedText>
      ) : null}

      <ThemedText style={compact ? styles.messageSm : styles.message}>
        {message}
      </ThemedText>

      {onCreateProfile ? (
        <Pressable
          onPress={onCreateProfile}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            compact ? styles.btnSm : styles.btn,
            {
              borderColor: accent.accent,
              backgroundColor: active ? accent.accent : accent.accentDim,
            },
          ]}
        >
          <Feather
            name="plus"
            size={compact ? 12 : 14}
            color={active ? Colors.dark.backgroundRoot : accent.accent}
          />
          <ThemedText
            style={[
              compact ? styles.btnTextSm : styles.btnText,
              { color: active ? Colors.dark.backgroundRoot : accent.accent },
            ]}
          >
            Create Profile
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fullWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  compactWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },

  iconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  iconRingSm: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },

  title: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  titleSm: {
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },

  message: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    maxWidth: 320,
  },
  messageSm: {
    color: Colors.dark.textSecondary,
    fontSize: 10,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 14,
  },

  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
  },
  btnSm: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    marginTop: 2,
  },
  btnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  btnTextSm: {
    fontSize: 10,
    fontWeight: "700",
  },
});
