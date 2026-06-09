import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, useWindowDimensions } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { navigationRef } from "@/lib/navigation-ref";
import { useData } from "@/contexts/DataContext";
import { useAccent } from "@/contexts/ThemeContext";

// Routes where the universal bottom bar must NOT appear (players, auth flow,
// and multi-screen/landscape-locked experiences).
const HIDDEN_ROUTES = new Set<string>([
  "Login",
  "ProfilePicker",
  "CreateProfile",
  "PinEntry",
  "Player",
  "LivePreview",
  "MultiScreenLayout",
  "MultiScreen",
  "MultiScreenPicker",
]);

type ContentType = "live" | "movies" | "series";

function NavItem({
  icon,
  mciIcon,
  label,
  active = false,
  onPress,
}: {
  icon?: keyof typeof Feather.glyphMap;
  mciIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const accent = useAccent();
  const highlight = focused || pressed || hovered || active;
  const tint = highlight ? accent.accent : Colors.dark.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.item, highlight && styles.itemActive]}
    >
      {mciIcon ? (
        <MaterialCommunityIcons name={mciIcon} size={22} color={tint} />
      ) : (
        <Feather name={icon ?? "circle"} size={20} color={tint} />
      )}
      <ThemedText style={[styles.label, highlight && { color: accent.accent }]} numberOfLines={1}>
        {label}
      </ThemedText>
      <View style={[styles.activeDot, active && { backgroundColor: accent.accent }]} />
    </Pressable>
  );
}

export default function PortraitBottomNav() {
  const { width, height } = useWindowDimensions();
  const isPortrait = height >= width;
  const insets = useSafeAreaInsets();
  const { liveCategories } = useData();

  const [route, setRoute] = useState<{ name?: string; type?: ContentType }>(() => {
    if (navigationRef.isReady()) {
      const r = navigationRef.getCurrentRoute();
      return { name: r?.name, type: (r?.params as any)?.type };
    }
    return {};
  });

  useEffect(() => {
    const sync = () => {
      const r = navigationRef.getCurrentRoute();
      setRoute({ name: r?.name, type: (r?.params as any)?.type });
    };
    const unsub = navigationRef.addListener("state", sync);
    sync();
    return unsub;
  }, []);

  if (!isPortrait) return null;
  if (!route.name || HIDDEN_ROUTES.has(route.name)) return null;

  const goHome = () => navigationRef.navigate("Home");
  const goSettings = () => navigationRef.navigate("AccountInfo");
  const goContent = (type: ContentType) => {
    if (type === "live") {
      const first = liveCategories[0];
      navigationRef.navigate("ContentList", {
        type,
        categoryId: first?.category_id ?? "",
        categoryName: first?.category_name ?? "Live TV",
      });
      return;
    }
    navigationRef.navigate("ContentList", {
      type,
      categoryId: "recent",
      categoryName: "Recently Added",
    });
  };

  const onContent = route.name === "ContentList";

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, Spacing.xs) }]}>
      <NavItem label="Home" icon="home" active={route.name === "Home"} onPress={goHome} />
      <NavItem
        label="Live TV"
        mciIcon="television-classic"
        active={onContent && route.type === "live"}
        onPress={() => goContent("live")}
      />
      <NavItem
        label="Movies"
        mciIcon="movie-open-outline"
        active={onContent && route.type === "movies"}
        onPress={() => goContent("movies")}
      />
      <NavItem
        label="Series"
        mciIcon="play-box-multiple-outline"
        active={onContent && route.type === "series"}
        onPress={() => goContent("series")}
      />
      <NavItem
        label="Settings"
        icon="settings"
        active={route.name === "AccountInfo"}
        onPress={goSettings}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundDefault,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  item: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  itemActive: { backgroundColor: "rgba(255,255,255,0.06)" },
  label: { fontSize: 10, fontWeight: "600", color: Colors.dark.textSecondary },
  activeDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "transparent" },
});
