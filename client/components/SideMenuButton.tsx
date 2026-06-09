import React, { useState } from "react";
import { StyleSheet, Pressable, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useAccent } from "@/contexts/ThemeContext";
import { useSideMenu } from "@/contexts/SideMenuContext";

/**
 * Hamburger button that opens the global slide-in side menu (the same menu as
 * the Home/dashboard sidebar). Landscape only — in portrait the universal
 * bottom nav already covers navigation, so this renders nothing.
 *
 * Placed immediately BEFORE each screen's back button so it sits to the LEFT
 * of it, giving quick access to the menu from any page without going Home.
 */
export default function SideMenuButton({ style }: { style?: any }) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const accent = useAccent();
  const { open } = useSideMenu();
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const active = focused || pressed || hovered;

  if (!isLandscape) return null;

  return (
    <Pressable
      onPress={open}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.btn,
        active && { backgroundColor: accent.withAlpha(accent.accent, 0.14), borderColor: accent.accent },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Open menu"
    >
      <Feather name="menu" size={20} color={active ? accent.accent : Colors.dark.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
});
