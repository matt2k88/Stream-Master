import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Modal,
  Animated,
  Image,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { navigationRef } from "@/lib/navigation-ref";
import { useData } from "@/contexts/DataContext";
import { useAccent } from "@/contexts/ThemeContext";
import { useSideMenu } from "@/contexts/SideMenuContext";

const DRAWER_WIDTH = 248;

type ContentType = "live" | "movies" | "series";

function MenuItem({
  icon,
  mciIcon,
  label,
  active = false,
  isNew = false,
  preferFocus,
  onPress,
}: {
  icon?: keyof typeof Feather.glyphMap;
  mciIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  active?: boolean;
  isNew?: boolean;
  preferFocus?: boolean;
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
      hasTVPreferredFocus={preferFocus}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.item,
        highlight && {
          backgroundColor: accent.withAlpha(accent.accent, active ? 0.16 : 0.1),
          borderColor: accent.accent,
        },
      ]}
    >
      {active ? <View style={[styles.activeBar, { backgroundColor: accent.accent }]} /> : null}
      <View style={styles.iconWrap}>
        {mciIcon ? (
          <MaterialCommunityIcons name={mciIcon} size={20} color={tint} />
        ) : (
          <Feather name={icon ?? "circle"} size={18} color={tint} />
        )}
      </View>
      <ThemedText style={[styles.label, highlight && { color: accent.accent }]} numberOfLines={1}>
        {label}
      </ThemedText>
      {isNew ? (
        <View style={[styles.newBadge, { backgroundColor: accent.accent }]}>
          <ThemedText style={styles.newBadgeText}>NEW</ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function SideMenuDrawer() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const insets = useSafeAreaInsets();
  const accent = useAccent();
  const { liveCategories } = useData();
  const { isOpen, close } = useSideMenu();

  // Keep the Modal mounted long enough to play the slide-out animation.
  const [mounted, setMounted] = useState(false);
  const slide = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fade = useRef(new Animated.Value(0)).current;

  const [routeName, setRouteName] = useState<string | undefined>(() =>
    navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined,
  );
  const [routeType, setRouteType] = useState<ContentType | undefined>(() =>
    navigationRef.isReady()
      ? ((navigationRef.getCurrentRoute()?.params as any)?.type as ContentType | undefined)
      : undefined,
  );

  useEffect(() => {
    const sync = () => {
      const r = navigationRef.getCurrentRoute();
      setRouteName(r?.name);
      setRouteType((r?.params as any)?.type as ContentType | undefined);
    };
    const unsub = navigationRef.addListener("state", sync);
    sync();
    return unsub;
  }, []);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(slide, { toValue: -DRAWER_WIDTH, duration: 180, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [isOpen, mounted, slide, fade]);

  // Orientation change while open: drop back to the portrait bottom bar.
  useEffect(() => {
    if (!isLandscape && isOpen) close();
  }, [isLandscape, isOpen, close]);

  if (!mounted) return null;

  const onContent = routeName === "ContentList";

  const navTo = (fn: () => void) => {
    fn();
    close();
  };

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

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={close}
      supportedOrientations={["portrait", "landscape", "landscape-left", "landscape-right"]}
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: fade }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        </Animated.View>

        <Animated.View
          style={[
            styles.drawer,
            {
              width: DRAWER_WIDTH + insets.left,
              paddingTop: Math.max(insets.top, Spacing.md),
              paddingBottom: Math.max(insets.bottom, Spacing.md),
              paddingLeft: Math.max(insets.left, Spacing.sm) + Spacing.xs,
              transform: [{ translateX: slide }],
            },
          ]}
        >
          <View style={styles.brand}>
            <Image
              source={require("../../assets/images/icon.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <View>
              <ThemedText style={styles.appName}>Ultra Cast</ThemedText>
              <ThemedText style={[styles.appVersion, { color: accent.accent }]}>v3</ThemedText>
            </View>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <MenuItem
              label="Home"
              icon="home"
              active={routeName === "Home"}
              preferFocus
              onPress={() => navTo(() => navigationRef.navigate("Home"))}
            />
            <MenuItem
              label="Live TV"
              mciIcon="television-classic"
              active={onContent && routeType === "live"}
              onPress={() => navTo(() => goContent("live"))}
            />
            <MenuItem
              label="Movies"
              mciIcon="movie-open-outline"
              active={onContent && routeType === "movies"}
              onPress={() => navTo(() => goContent("movies"))}
            />
            <MenuItem
              label="Series"
              mciIcon="play-box-multiple-outline"
              active={onContent && routeType === "series"}
              onPress={() => navTo(() => goContent("series"))}
            />
            <MenuItem
              label="Catch Up"
              icon="clock"
              active={routeName === "CatchUp"}
              onPress={() => navTo(() => navigationRef.navigate("CatchUp"))}
            />
            <MenuItem
              label="TV Guide"
              icon="calendar"
              active={routeName === "TvGuide"}
              onPress={() => navTo(() => navigationRef.navigate("TvGuide"))}
            />

            <View style={styles.divider} />

            <MenuItem
              label="Search"
              icon="search"
              active={routeName === "Search"}
              onPress={() => navTo(() => navigationRef.navigate("Search"))}
            />
            <MenuItem
              label="Football Centre"
              mciIcon="soccer"
              isNew
              active={routeName === "FootballCentre"}
              onPress={() => navTo(() => navigationRef.navigate("FootballCentre"))}
            />
            <MenuItem
              label="Settings"
              icon="settings"
              active={routeName === "AccountInfo"}
              onPress={() => navTo(() => navigationRef.navigate("AccountInfo"))}
            />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  drawer: {
    height: "100%",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRightWidth: 1,
    borderRightColor: Colors.dark.border,
    paddingRight: Spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 6, height: 0 },
    elevation: 16,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  logo: { width: 34, height: 34 },
  appName: { fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  appVersion: { fontSize: 11, fontWeight: "700" },
  scroll: { flex: 1 },
  scrollContent: { gap: Spacing.xs, paddingBottom: Spacing.lg },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
    overflow: "hidden",
  },
  activeBar: { position: "absolute", left: 0, top: 6, bottom: 6, width: 3, borderRadius: 2 },
  iconWrap: { width: 24, alignItems: "center" },
  label: { flex: 1, fontSize: 13, fontWeight: "600", color: Colors.dark.text },
  divider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: Spacing.sm,
    marginHorizontal: Spacing.sm,
  },
  newBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: BorderRadius.xs },
  newBadgeText: { fontSize: 8, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },
});
