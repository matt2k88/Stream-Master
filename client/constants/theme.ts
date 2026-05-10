import { Platform } from "react-native";

export const Colors = {
  light: {
    text: "#FFFFFF",
    textSecondary: "#999999",
    buttonText: "#FFFFFF",
    tabIconDefault: "#555555",
    tabIconSelected: "#FF6600",
    link: "#FF6600",
    backgroundRoot: "#080808",
    backgroundDefault: "#0F0F0F",
    backgroundSecondary: "#161616",
    backgroundTertiary: "#1E1E1E",
    accent: "#FF6600",
    accentLight: "#FF8C1A",
    accentHover: "#FFB266",
    accentDim: "rgba(255, 102, 0, 0.15)",
    accentGlow: "rgba(255, 102, 0, 0.6)",
    accentGlowSoft: "rgba(255, 102, 0, 0.25)",
    error: "#FF3B3B",
    success: "#00E676",
    border: "#242424",
    borderAccent: "#FF6600",
    overlay: "rgba(0, 0, 0, 0.85)",
  },
  dark: {
    text: "#FFFFFF",
    textSecondary: "#999999",
    buttonText: "#FFFFFF",
    tabIconDefault: "#555555",
    tabIconSelected: "#FF6600",
    link: "#FF6600",
    backgroundRoot: "#080808",
    backgroundDefault: "#0F0F0F",
    backgroundSecondary: "#161616",
    backgroundTertiary: "#1E1E1E",
    accent: "#FF6600",
    accentLight: "#FF8C1A",
    accentHover: "#FFB266",
    accentDim: "rgba(255, 102, 0, 0.15)",
    accentGlow: "rgba(255, 102, 0, 0.6)",
    accentGlowSoft: "rgba(255, 102, 0, 0.25)",
    error: "#FF3B3B",
    success: "#00E676",
    border: "#242424",
    borderAccent: "#FF6600",
    overlay: "rgba(0, 0, 0, 0.85)",
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
  inputHeight: 52,
  buttonHeight: 52,
  tvSafeZone: 32,
};

export const BorderRadius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  "2xl": 36,
  "3xl": 48,
  full: 9999,
};

export const Typography = {
  h1: { fontSize: 34, fontWeight: "700" as const },
  h2: { fontSize: 26, fontWeight: "700" as const },
  h3: { fontSize: 22, fontWeight: "600" as const },
  h4: { fontSize: 18, fontWeight: "600" as const },
  body: { fontSize: 16, fontWeight: "400" as const },
  small: { fontSize: 14, fontWeight: "400" as const },
  link: { fontSize: 16, fontWeight: "400" as const },
  button: { fontSize: 18, fontWeight: "700" as const },
};

export const Shadows = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  glow: {
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 20,
    elevation: 14,
  },
  glowSoft: {
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
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
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
