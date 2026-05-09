import type { ImageSourcePropType } from "react-native";

export type ThemeKey =
  | "default"
  | "halloween"
  | "bonfire"
  | "christmas"
  | "valentines"
  | "newyear";

export type ThemeIconKey = "liveTv" | "movies" | "series" | "catchUp" | "tvGuide";

export interface ThemePalette {
  accent: string;
  accentLight: string;
  accentDim: string;
  accentGlow: string;
  accentGlowSoft: string;
  borderAccent: string;
  link: string;
  tabIconSelected: string;
  glowShadow: string;
}

export interface ThemeIcons {
  liveTv?: ImageSourcePropType;
  movies?: ImageSourcePropType;
  series?: ImageSourcePropType;
  catchUp?: ImageSourcePropType;
  tvGuide?: ImageSourcePropType;
}

export interface ThemeDef {
  key: ThemeKey;
  label: string;
  palette: ThemePalette;
  icons: ThemeIcons;
}

const DEFAULT_PALETTE: ThemePalette = {
  accent: "#FF6600",
  accentLight: "#FF8C1A",
  accentDim: "rgba(255, 102, 0, 0.15)",
  accentGlow: "rgba(255, 102, 0, 0.6)",
  accentGlowSoft: "rgba(255, 102, 0, 0.25)",
  borderAccent: "#FF6600",
  link: "#FF6600",
  tabIconSelected: "#FF6600",
  glowShadow: "#FF6600",
};

// Themed dashboard icon images. Each theme provides 5 PNG icons
// for the LIVE TV / MOVIES / SERIES / CATCH UP / TV GUIDE buttons.
// Default theme leaves icons undefined so the existing vector glyphs
// (Feather / MaterialCommunityIcons) keep rendering.
const ICONS: Record<Exclude<ThemeKey, "default">, ThemeIcons> = {
  halloween: {
    liveTv: require("../../assets/images/themes/halloween/liveTv.png"),
    movies: require("../../assets/images/themes/halloween/movies.png"),
    series: require("../../assets/images/themes/halloween/series.png"),
    catchUp: require("../../assets/images/themes/halloween/catchUp.png"),
    tvGuide: require("../../assets/images/themes/halloween/tvGuide.png"),
  },
  bonfire: {
    liveTv: require("../../assets/images/themes/bonfire/liveTv.png"),
    movies: require("../../assets/images/themes/bonfire/movies.png"),
    series: require("../../assets/images/themes/bonfire/series.png"),
    catchUp: require("../../assets/images/themes/bonfire/catchUp.png"),
    tvGuide: require("../../assets/images/themes/bonfire/tvGuide.png"),
  },
  christmas: {
    liveTv: require("../../assets/images/themes/christmas/liveTv.png"),
    movies: require("../../assets/images/themes/christmas/movies.png"),
    series: require("../../assets/images/themes/christmas/series.png"),
    catchUp: require("../../assets/images/themes/christmas/catchUp.png"),
    tvGuide: require("../../assets/images/themes/christmas/tvGuide.png"),
  },
  valentines: {
    liveTv: require("../../assets/images/themes/valentines/liveTv.png"),
    movies: require("../../assets/images/themes/valentines/movies.png"),
    series: require("../../assets/images/themes/valentines/series.png"),
    catchUp: require("../../assets/images/themes/valentines/catchUp.png"),
    tvGuide: require("../../assets/images/themes/valentines/tvGuide.png"),
  },
  newyear: {
    liveTv: require("../../assets/images/themes/newyear/liveTv.png"),
    movies: require("../../assets/images/themes/newyear/movies.png"),
    series: require("../../assets/images/themes/newyear/series.png"),
    catchUp: require("../../assets/images/themes/newyear/catchUp.png"),
    tvGuide: require("../../assets/images/themes/newyear/tvGuide.png"),
  },
};

export const THEMES: Record<ThemeKey, ThemeDef> = {
  default: {
    key: "default",
    label: "Default (Orange Neon)",
    palette: DEFAULT_PALETTE,
    icons: {},
  },
  halloween: {
    key: "halloween",
    label: "Halloween",
    palette: {
      accent: "#FF7518",
      accentLight: "#FFA552",
      accentDim: "rgba(255, 117, 24, 0.16)",
      accentGlow: "rgba(255, 117, 24, 0.65)",
      accentGlowSoft: "rgba(255, 117, 24, 0.28)",
      borderAccent: "#FF7518",
      link: "#FF7518",
      tabIconSelected: "#FF7518",
      glowShadow: "#FF7518",
    },
    icons: ICONS.halloween,
  },
  bonfire: {
    key: "bonfire",
    label: "Bonfire Night",
    palette: {
      accent: "#C04CFF",
      accentLight: "#FF5BD3",
      accentDim: "rgba(192, 76, 255, 0.18)",
      accentGlow: "rgba(255, 91, 211, 0.65)",
      accentGlowSoft: "rgba(192, 76, 255, 0.28)",
      borderAccent: "#C04CFF",
      link: "#FF5BD3",
      tabIconSelected: "#C04CFF",
      glowShadow: "#C04CFF",
    },
    icons: ICONS.bonfire,
  },
  christmas: {
    key: "christmas",
    label: "Christmas",
    palette: {
      accent: "#E63946",
      accentLight: "#F77F88",
      accentDim: "rgba(230, 57, 70, 0.16)",
      accentGlow: "rgba(230, 57, 70, 0.65)",
      accentGlowSoft: "rgba(230, 57, 70, 0.28)",
      borderAccent: "#FFFFFF",
      link: "#F77F88",
      tabIconSelected: "#E63946",
      glowShadow: "#E63946",
    },
    icons: ICONS.christmas,
  },
  valentines: {
    key: "valentines",
    label: "Valentines",
    palette: {
      accent: "#FF3D8A",
      accentLight: "#FF8FB8",
      accentDim: "rgba(255, 61, 138, 0.16)",
      accentGlow: "rgba(255, 61, 138, 0.65)",
      accentGlowSoft: "rgba(255, 61, 138, 0.28)",
      borderAccent: "#FF3D8A",
      link: "#FF8FB8",
      tabIconSelected: "#FF3D8A",
      glowShadow: "#FF3D8A",
    },
    icons: ICONS.valentines,
  },
  newyear: {
    key: "newyear",
    label: "New Year",
    palette: {
      accent: "#FFD700",
      accentLight: "#FFE96B",
      accentDim: "rgba(255, 215, 0, 0.16)",
      accentGlow: "rgba(255, 215, 0, 0.65)",
      accentGlowSoft: "rgba(255, 215, 0, 0.28)",
      borderAccent: "#FFD700",
      link: "#FFE96B",
      tabIconSelected: "#FFD700",
      glowShadow: "#FFD700",
    },
    icons: ICONS.newyear,
  },
};

export function isThemeKey(value: unknown): value is ThemeKey {
  return (
    value === "default" ||
    value === "halloween" ||
    value === "bonfire" ||
    value === "christmas" ||
    value === "valentines" ||
    value === "newyear"
  );
}

export function getTheme(key: string | null | undefined): ThemeDef {
  if (key && isThemeKey(key)) return THEMES[key];
  return THEMES.default;
}
