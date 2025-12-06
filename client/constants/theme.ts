import { Platform } from "react-native";

const tintColorLight = "#2196F3";
const tintColorDark = "#2196F3";

export const Colors = {
  light: {
    text: "#FFFFFF",
    textSecondary: "#B0B3C1",
    buttonText: "#FFFFFF",
    tabIconDefault: "#687076",
    tabIconSelected: tintColorLight,
    link: "#2196F3",
    backgroundRoot: "#0A0E27",
    backgroundDefault: "#1A1F36",
    backgroundSecondary: "#252A45",
    backgroundTertiary: "#3A3F56",
    accent: "#2196F3",
    error: "#F44336",
    success: "#4CAF50",
    border: "#3A3F56",
    overlay: "rgba(0, 0, 0, 0.8)",
  },
  dark: {
    text: "#FFFFFF",
    textSecondary: "#B0B3C1",
    buttonText: "#FFFFFF",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: tintColorDark,
    link: "#2196F3",
    backgroundRoot: "#0A0E27",
    backgroundDefault: "#1A1F36",
    backgroundSecondary: "#252A45",
    backgroundTertiary: "#3A3F56",
    accent: "#2196F3",
    error: "#F44336",
    success: "#4CAF50",
    border: "#3A3F56",
    overlay: "rgba(0, 0, 0, 0.8)",
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
  "6xl": 64,
  inputHeight: 56,
  buttonHeight: 56,
  tvSafeZone: 48,
};

export const BorderRadius = {
  xs: 8,
  sm: 12,
  md: 18,
  lg: 24,
  xl: 30,
  "2xl": 40,
  "3xl": 50,
  full: 9999,
};

export const Typography = {
  h1: {
    fontSize: 36,
    fontWeight: "700" as const,
  },
  h2: {
    fontSize: 28,
    fontWeight: "700" as const,
  },
  h3: {
    fontSize: 24,
    fontWeight: "600" as const,
  },
  h4: {
    fontSize: 20,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 18,
    fontWeight: "400" as const,
  },
  small: {
    fontSize: 16,
    fontWeight: "400" as const,
  },
  link: {
    fontSize: 18,
    fontWeight: "400" as const,
  },
  button: {
    fontSize: 20,
    fontWeight: "700" as const,
  },
};

export const Shadows = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  focused: {
    shadowColor: "#2196F3",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
