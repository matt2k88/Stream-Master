import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { PlayerUI, type ControlTone } from "./playerTheme";

type IconSet = "feather" | "material";

export type ControlButtonProps = {
  icon?: string;
  iconSet?: IconSet;
  /** Shown beside the icon. Secondary controls are labelled so they can be read from the sofa. */
  label?: string;
  /** Text shown instead of an icon, e.g. the aspect ratio "16:9". */
  text?: string;
  onPress: () => void;
  /** Reported on focus as well as press, so the controls overlay stays awake while the remote moves. */
  onActivity?: () => void;
  tone?: ControlTone;
  /** Marks the control as currently on (subtitles enabled, football showing). */
  active?: boolean;
  disabled?: boolean;
  hasTVPreferredFocus?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
  /** "sm" is for secondary rows where full-size buttons dominate the screen. */
  size?: "md" | "sm";
  /** Lets a screen grab this button's node so it can hand focus back to it
   *  (see requestTvFocus — needed when a panel closes and takes focus with it). */
  viewRef?: React.Ref<View>;
};

/**
 * One button for every player control.
 *
 * Focus inverts the button to solid white with an accent ring — the single
 * most important detail here, because on a remote it is the only thing telling
 * someone where they are. Pressed state reuses the focus styling so touch and
 * D-pad feel the same.
 */
export function ControlButton({
  icon,
  iconSet = "feather",
  label,
  text,
  onPress,
  onActivity,
  tone = "default",
  active = false,
  disabled = false,
  hasTVPreferredFocus,
  accessibilityLabel,
  style,
  size = "md",
  viewRef,
}: ControlButtonProps) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const lit = focused || pressed;

  // A toggle that is BOTH on and focused used to look exactly like any other
  // focused button, so you could not tell the Guide was open while standing on
  // it. Focused-and-on keeps the white fill (focus must stay unmistakable) but
  // colours the content with the accent, so the two states read apart.
  const palette = lit
    ? active
      ? { bg: PlayerUI.focus.bg, border: PlayerUI.focus.border, fg: PlayerUI.active.fg }
      : PlayerUI.focus
    : tone === "primary"
      ? PlayerUI.primary
      : active || tone === "active"
        ? PlayerUI.active
        : PlayerUI.rest;

  const Icon = iconSet === "material" ? MaterialCommunityIcons : Feather;
  const compact = size === "sm";
  const iconSize = compact
    ? PlayerUI.iconSize - 3
    : tone === "primary" ? PlayerUI.primaryIconSize : PlayerUI.iconSize;

  return (
    <Pressable
      ref={viewRef as never}
      onPress={() => {
        onActivity?.();
        onPress();
      }}
      onFocus={() => {
        setFocused(true);
        onActivity?.();
      }}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
      focusable={!disabled}
      hasTVPreferredFocus={hasTVPreferredFocus}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label ?? text ?? icon}
      style={[
        styles.base,
        compact && styles.compact,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: lit ? 2 : 1,
          opacity: disabled ? 0.35 : 1,
          transform: [{ scale: lit ? 1.04 : 1 }],
        },
        tone === "primary" && !compact && styles.primary,
        style,
      ]}
    >
      {icon ? <Icon name={icon as never} size={iconSize} color={palette.fg} /> : null}
      {text ? (
        <Text style={[styles.text, { color: palette.fg }]} numberOfLines={1}>
          {text}
        </Text>
      ) : null}
      {label ? (
        <Text style={[styles.label, compact && styles.labelSm, { color: palette.fg }]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Groups buttons with consistent spacing; wraps rather than overflowing on a phone. */
export function ControlRow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    height: PlayerUI.btnHeight,
    minWidth: PlayerUI.btnMinWidth,
    paddingHorizontal: PlayerUI.btnPadX,
    borderRadius: PlayerUI.radius,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  compact: {
    height: 38,
    minWidth: 38,
    paddingHorizontal: 12,
    gap: 6,
  },
  primary: {
    minWidth: 64,
    paddingHorizontal: PlayerUI.btnPadX + 4,
  },
  labelSm: { fontSize: PlayerUI.label.size - 1 },
  label: {
    fontFamily: PlayerUI.font.ui,
    fontSize: PlayerUI.label.size,
    letterSpacing: PlayerUI.label.spacing,
  },
  text: {
    fontFamily: PlayerUI.font.ui,
    fontSize: PlayerUI.label.size + 1,
    fontVariant: ["tabular-nums"],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: PlayerUI.btnGap,
    flexWrap: "wrap",
  },
});
