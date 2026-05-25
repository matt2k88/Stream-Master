import { Text, StyleSheet, type TextProps, type TextStyle } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { useUISettingsSafe } from "@/contexts/UISettingsContext";
import { Typography } from "@/constants/theme";

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: "h1" | "h2" | "h3" | "h4" | "body" | "small" | "link";
  /**
   * Opt out of the global text-size scaling (driven by UISettings).
   * Use for pre-scaled text, fixed-size badges, or any layout that must
   * NOT grow when the user picks "medium"/"large" in Profile.
   */
  disableAutoScale?: boolean;
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = "body",
  disableAutoScale,
  ...rest
}: ThemedTextProps) {
  const { theme, isDark } = useTheme();
  const { textScale } = useUISettings();

  const getColor = () => {
    if (isDark && darkColor) return darkColor;
    if (!isDark && lightColor) return lightColor;
    if (type === "link") return theme.link;
    return theme.text;
  };

  const getTypeStyle = (): TextStyle => {
    switch (type) {
      case "h1":
        return Typography.h1;
      case "h2":
        return Typography.h2;
      case "h3":
        return Typography.h3;
      case "h4":
        return Typography.h4;
      case "body":
        return Typography.body;
      case "small":
        return Typography.small;
      case "link":
        return Typography.link;
      default:
        return Typography.body;
    }
  };

  // App-wide auto-scaling: flatten incoming style, then multiply fontSize and
  // lineHeight by the user's selected textScale. Applied LAST so it overrides
  // any explicit fontSize the caller passed.
  let scaledOverride: TextStyle | null = null;
  if (!disableAutoScale && textScale !== 1) {
    const flat = StyleSheet.flatten([getTypeStyle(), style]) as TextStyle | undefined;
    const baseFontSize = typeof flat?.fontSize === "number" ? flat.fontSize : undefined;
    const baseLineHeight = typeof flat?.lineHeight === "number" ? flat.lineHeight : undefined;
    const next: TextStyle = {};
    if (baseFontSize) next.fontSize = Math.round(baseFontSize * textScale);
    if (baseLineHeight) next.lineHeight = Math.round(baseLineHeight * textScale);
    if (next.fontSize || next.lineHeight) scaledOverride = next;
  }

  return (
    <Text
      style={[{ color: getColor() }, getTypeStyle(), style, scaledOverride]}
      {...rest}
    />
  );
}
