import type { ComponentProps } from "react";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";

// Icon registry used by My Groups (creator modal + sidebar + content row).
// Each entry uses either Feather or MaterialCommunityIcons; the renderer
// picks based on `lib`.
export type IconLib = "feather" | "mci";

export interface GroupIconDef {
  key: string;
  lib: IconLib;
  name: string; // valid icon name within the chosen library
  label: string; // for accessibility / search
}

// Curated set of TV / sports / movie / series themed icons. Names are
// confirmed valid for @expo/vector-icons (Feather + MaterialCommunityIcons).
export const GROUP_ICONS: GroupIconDef[] = [
  // Generic / categorisation
  { key: "folder", lib: "feather", name: "folder", label: "Folder" },
  { key: "star", lib: "feather", name: "star", label: "Star" },
  { key: "heart", lib: "feather", name: "heart", label: "Heart" },
  { key: "bookmark", lib: "feather", name: "bookmark", label: "Bookmark" },
  { key: "flag", lib: "feather", name: "flag", label: "Flag" },
  { key: "tag", lib: "feather", name: "tag", label: "Tag" },
  { key: "fire", lib: "mci", name: "fire", label: "Fire" },
  { key: "bolt", lib: "mci", name: "lightning-bolt", label: "Lightning" },
  { key: "crown", lib: "mci", name: "crown", label: "Crown" },
  { key: "trophy", lib: "mci", name: "trophy", label: "Trophy" },

  // TV / Live
  { key: "tv", lib: "feather", name: "tv", label: "TV" },
  { key: "tv-classic", lib: "mci", name: "television-classic", label: "Classic TV" },
  { key: "broadcast", lib: "mci", name: "broadcast", label: "Broadcast" },
  { key: "satellite", lib: "mci", name: "satellite-uplink", label: "Satellite" },
  { key: "news", lib: "mci", name: "newspaper-variant-outline", label: "News" },
  { key: "radio", lib: "feather", name: "radio", label: "Radio" },
  { key: "mic", lib: "feather", name: "mic", label: "Microphone" },
  { key: "music", lib: "feather", name: "music", label: "Music" },

  // Sports
  { key: "soccer", lib: "mci", name: "soccer", label: "Soccer" },
  { key: "basketball", lib: "mci", name: "basketball", label: "Basketball" },
  { key: "football", lib: "mci", name: "football", label: "Football" },
  { key: "baseball", lib: "mci", name: "baseball", label: "Baseball" },
  { key: "tennis", lib: "mci", name: "tennis-ball", label: "Tennis" },
  { key: "golf", lib: "mci", name: "golf", label: "Golf" },
  { key: "hockey", lib: "mci", name: "hockey-sticks", label: "Hockey" },
  { key: "boxing", lib: "mci", name: "boxing-glove", label: "Boxing" },
  { key: "racing", lib: "mci", name: "racing-helmet", label: "Racing" },
  { key: "bike", lib: "mci", name: "bike", label: "Cycling" },
  { key: "weight", lib: "mci", name: "weight-lifter", label: "Fitness" },

  // Movies
  { key: "film", lib: "feather", name: "film", label: "Film" },
  { key: "movie", lib: "mci", name: "movie-open", label: "Movie" },
  { key: "popcorn", lib: "mci", name: "popcorn", label: "Popcorn" },
  { key: "ticket", lib: "mci", name: "ticket", label: "Ticket" },
  { key: "drama", lib: "mci", name: "drama-masks", label: "Drama" },
  { key: "camera", lib: "feather", name: "video", label: "Video" },

  // Series / genres
  { key: "ghost", lib: "mci", name: "ghost-outline", label: "Horror" },
  { key: "alien", lib: "mci", name: "alien", label: "Sci-Fi" },
  { key: "sword", lib: "mci", name: "sword", label: "Action" },
  { key: "magic", lib: "mci", name: "auto-fix", label: "Magic" },
  { key: "robot", lib: "mci", name: "robot", label: "Robot" },
  { key: "skull", lib: "mci", name: "skull", label: "Skull" },
  { key: "rocket", lib: "feather", name: "navigation-2", label: "Rocket" },
  { key: "gamepad", lib: "mci", name: "gamepad-variant", label: "Gaming" },

  // Lifestyle / family / general
  { key: "kid", lib: "mci", name: "baby-face-outline", label: "Kids" },
  { key: "family", lib: "mci", name: "human-male-female-child", label: "Family" },
  { key: "home", lib: "feather", name: "home", label: "Home" },
  { key: "globe", lib: "feather", name: "globe", label: "World" },
  { key: "food", lib: "mci", name: "food-fork-drink", label: "Food" },
  { key: "school", lib: "mci", name: "school", label: "Education" },
];

export const DEFAULT_GROUP_ICON = "folder";

// 12-color palette — bright, TV-safe on dark backgrounds.
export const GROUP_COLORS: string[] = [
  "#FF6600", // orange (default / brand)
  "#FF3B3B", // red
  "#FFD700", // gold
  "#4CAF50", // green
  "#2196F3", // blue
  "#9C27B0", // purple
  "#E91E63", // pink
  "#00BCD4", // cyan
  "#FF9800", // amber
  "#795548", // brown
  "#607D8B", // slate
  "#FFFFFF", // white
];

export const DEFAULT_GROUP_COLOR = "#FF6600";

export function getGroupIconDef(key: string | undefined | null): GroupIconDef {
  if (!key) return GROUP_ICONS[0];
  return GROUP_ICONS.find((i) => i.key === key) ?? GROUP_ICONS[0];
}

// Convenience component-factory for places that want a small inline icon.
export function getGroupIconProps(
  key: string | undefined | null,
): { Component: typeof Feather | typeof MaterialCommunityIcons; name: any } {
  const def = getGroupIconDef(key);
  return {
    Component: def.lib === "feather" ? Feather : MaterialCommunityIcons,
    name: def.name as any,
  };
}

// Used as the second-arg type for vector-icon `name` props if needed
export type AnyIconName =
  | ComponentProps<typeof Feather>["name"]
  | ComponentProps<typeof MaterialCommunityIcons>["name"];
