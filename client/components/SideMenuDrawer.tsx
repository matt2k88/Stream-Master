import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Modal,
  Animated,
  Image,
  ScrollView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { navigationRef } from "@/lib/navigation-ref";
import { useData } from "@/contexts/DataContext";
import { useAccent, useAppTheme, withAlpha } from "@/contexts/ThemeContext";
import { useSideMenu } from "@/contexts/SideMenuContext";
import { useFootball } from "@/contexts/FootballContext";

const DRAWER_WIDTH = 248;

type ContentType = "live" | "movies" | "series";

const FOOTBALL_FINISHED = ["FT", "AET", "PEN", "AWD", "WO"];
const FOOTBALL_NOT_STARTED = ["NS", "PST", "CANC", "TBD", "SUSP"];

function MenuItem({
  icon,
  mciIcon,
  label,
  active = false,
  isNew = false,
  isLive = false,
  activeTint,
  preferFocus,
  onPress,
}: {
  icon?: keyof typeof Feather.glyphMap;
  mciIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  active?: boolean;
  isNew?: boolean;
  isLive?: boolean;
  /** Override the hover/focus/active accent colour (e.g. red for Ultra Tube). */
  activeTint?: string;
  preferFocus?: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const accent = useAccent();
  const highlight = focused || pressed || hovered || active;
  const effectiveTint = activeTint ?? accent.accent;
  const tint = highlight ? effectiveTint : Colors.dark.textSecondary;

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
          backgroundColor: withAlpha(effectiveTint, active ? 0.16 : 0.1),
          borderColor: effectiveTint,
        },
      ]}
    >
      {active ? <View style={[styles.activeBar, { backgroundColor: effectiveTint }]} /> : null}
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
      {isLive ? (
        <View style={styles.liveBadge}>
          <ThemedText style={styles.liveBadgeText}>LIVE</ThemedText>
        </View>
      ) : isNew ? (
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
  const { isOpen, transparent, close } = useSideMenu();
  const { scores } = useFootball();
  const { showTopPicksBadge, showUltraTubeBadge, showSportsTvBadge, showMusicBadge } = useAppTheme();
  const hasLiveGame = scores.some((s) => {
    const st = (s.status_short || "").toUpperCase();
    return !s.finished_at && !FOOTBALL_FINISHED.includes(st) && !FOOTBALL_NOT_STARTED.includes(st);
  });

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
        <Animated.View
          style={[
            styles.backdrop,
            { opacity: fade },
            // Over the video player we dim less so the content stays visible.
            transparent && { backgroundColor: "rgba(0,0,0,0.2)" },
          ]}
        >
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
            // Slightly translucent panel when opened over the player so the
            // viewer can still see what's playing behind the menu.
            transparent && { backgroundColor: "rgba(8,8,8,0.82)" },
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
              label="Downloads"
              icon="download"
              active={routeName === "Downloads"}
              onPress={() => navTo(() => navigationRef.navigate("Downloads"))}
            />
            <MenuItem
              label="Football Centre"
              mciIcon="soccer"
              active={routeName === "FootballCentre"}
              isLive={hasLiveGame}
              onPress={() => navTo(() => navigationRef.navigate("FootballCentre"))}
            />
            <MenuItem
              label="Sports on TV"
              icon="tv"
              isNew={showSportsTvBadge}
              active={routeName === "SportListings"}
              onPress={() => navTo(() => navigationRef.navigate("SportListings" as never))}
            />
            <MenuItem
              label="Top Picks"
              mciIcon="fire"
              isNew={showTopPicksBadge}
              active={routeName === "TopPicks"}
              onPress={() => navTo(() => navigationRef.navigate("TopPicks"))}
            />
            {(width > 768 || Platform.isTV) ? (
              <MenuItem
                label="Ultra Music"
                icon="music"
                active={routeName === "MusicPlayer"}
                activeTint="#a855f7"
                isNew={showMusicBadge}
                onPress={() => navTo(() => navigationRef.navigate("MusicPlayer" as never))}
              />
            ) : null}
            <MenuItem
              label="Ultra Tube"
              icon="play-circle"
              isNew={showUltraTubeBadge}
              activeTint="#ef4444"
              active={routeName === "UltraTube"}
              onPress={() => navTo(() => navigationRef.navigate("UltraTube" as never))}
            />

            {/* ── Utility section — Search + Settings at the bottom ── */}
            <View style={styles.divider} />

            <MenuItem
              label="Search"
              icon="search"
              active={routeName === "Search"}
              onPress={() => navTo(() => navigationRef.navigate("Search"))}
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
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 4, height: 0 },
    elevation: 0,
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
  scrollContent: { gap: 2, paddingBottom: Spacing.lg },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 4,
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
  liveBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: BorderRadius.xs, backgroundColor: "#22c55e" },
  liveBadgeText: { fontSize: 8, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },
});
