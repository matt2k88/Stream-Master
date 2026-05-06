import React, { useState, useCallback } from "react";
import { View, StyleSheet, Pressable, Image, useWindowDimensions, Modal, BackHandler, Platform } from "react-native";
import { reloadAppAsync } from "expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { LinearGradient } from "expo-linear-gradient";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/contexts/ProfileContext";
import { useMessages } from "@/contexts/MessageContext";
import { useWatchHistory } from "@/contexts/WatchHistoryContext";
import AdvertCarousel from "@/components/AdvertCarousel";
import AnnouncementTicker from "@/components/AnnouncementTicker";
import RecentlyWatchedCard from "@/components/RecentlyWatchedCard";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface NavButtonProps {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  style?: any;
  iconSize?: number;
  textSize?: number;
  compact?: boolean;
}

function NavButton({ title, icon, onPress, style, iconSize = 30, textSize = 16, compact = false }: NavButtonProps) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;

  return (
    <Pressable
      style={[styles.navButton, compact && styles.navButtonCompact, isActive && styles.navButtonActive, style]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {isActive ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.18)", "rgba(255,102,0,0.06)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}
      <View style={[styles.iconWrap, compact && styles.iconWrapCompact, isActive && styles.iconWrapActive]}>
        <Feather
          name={icon}
          size={iconSize}
          color={isActive ? Colors.dark.accent : Colors.dark.textSecondary}
        />
      </View>
      <ThemedText style={[styles.navButtonText, { fontSize: textSize }, isActive && styles.navButtonTextActive]}>
        {title}
      </ThemedText>
      {isActive ? <View style={styles.activeIndicator} /> : null}
    </Pressable>
  );
}

function SearchButton({ onPress }: { onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;

  return (
    <Pressable
      style={[styles.searchButton, isActive && styles.searchButtonActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <LinearGradient
        colors={isActive
          ? ["rgba(255,102,0,0.22)", "rgba(255,102,0,0.10)"]
          : ["rgba(255,102,0,0.09)", "rgba(255,102,0,0.03)"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <View style={[styles.searchBtnIconWrap, isActive && styles.searchBtnIconWrapActive]}>
        <Feather name="search" size={18} color={Colors.dark.accent} />
      </View>
      <View style={styles.searchBtnTextCol}>
        <ThemedText style={[styles.searchBtnText, isActive && styles.searchBtnTextActive]}>
          Search All Content
        </ThemedText>
        <ThemedText style={styles.searchBtnHint}>channels, movies, series</ThemedText>
      </View>
      <Feather name="chevron-right" size={16} color={Colors.dark.accent + "88"} />
      {isActive ? <View style={styles.activeIndicator} /> : null}
    </Pressable>
  );
}

function ProfileButton({ onPress }: { onPress: () => void }) {
  const { activeProfile } = useProfile();
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const isActive = pressed || focused;

  if (!activeProfile) return null;

  return (
    <Pressable
      style={[styles.profileBtn, isActive && styles.profileBtnActive, { borderColor: activeProfile.avatar_color + "66" }]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <View style={[styles.profileBtnAvatar, { backgroundColor: activeProfile.avatar_color + "33", borderColor: activeProfile.avatar_color }]}>
        <Feather name={activeProfile.avatar_icon as any} size={14} color={activeProfile.avatar_color} />
      </View>
      <ThemedText style={[styles.profileBtnName, { color: activeProfile.avatar_color }]} numberOfLines={1}>
        {activeProfile.name}
      </ThemedText>
      <Feather name="chevron-down" size={12} color={activeProfile.avatar_color + "99"} />
    </Pressable>
  );
}

function RefreshButton({ onPress, refreshing }: { onPress: () => void; refreshing: boolean }) {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const isActive = pressed || focused;
  return (
    <Pressable
      style={[styles.headerBtn, isActive && styles.headerBtnActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={refreshing}
    >
      <Feather name="refresh-cw" size={16} color={refreshing || isActive ? Colors.dark.accent : Colors.dark.textSecondary} />
    </Pressable>
  );
}

function AccountButton({ onPress }: { onPress: () => void }) {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const isActive = pressed || focused;
  return (
    <Pressable
      style={[styles.headerBtn, isActive && styles.headerBtnActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <Feather name="user" size={18} color={isActive ? Colors.dark.accent : Colors.dark.accent} />
    </Pressable>
  );
}

function MessagesButton({ onPress }: { onPress: () => void }) {
  const { unreadCount } = useMessages();
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const hasUnread = unreadCount > 0;

  return (
    <Pressable
      style={[styles.headerBtn, (pressed || focused) && styles.headerBtnActive, hasUnread && styles.headerBtnAlert]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <Feather name="bell" size={18} color={hasUnread ? Colors.dark.accent : Colors.dark.textSecondary} />
      {hasUnread ? (
        <View style={styles.unreadBadge}>
          <ThemedText style={styles.unreadBadgeText}>
            {unreadCount > 9 ? "9+" : String(unreadCount)}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const { refresh, liveCategories, vodCategories, seriesCategories } = useData();

  // Navigate directly to ContentList, pre-selecting the first real category
  const goToContent = (type: "live" | "movies" | "series", title: string) => {
    const cats = type === "live" ? liveCategories : type === "movies" ? vodCategories : seriesCategories;
    const first = cats[0];
    navigation.navigate("ContentList", {
      type,
      categoryId: first?.category_id ?? "",
      categoryName: first?.category_name ?? title,
    });
  };
  const { setOnDashboard } = useMessages();
  const [refreshing, setRefreshing] = useState(false);
  const [recentRefreshKey, setRecentRefreshKey] = useState(0);
  const [exitConfirmVisible, setExitConfirmVisible] = useState(false);

  const { refetch: refetchHistory } = useWatchHistory();
  useFocusEffect(
    useCallback(() => {
      setOnDashboard(true);
      // Refresh watch history every time user returns to home
      refetchHistory();
      setRecentRefreshKey((k) => k + 1);
      return () => setOnDashboard(false);
    }, [setOnDashboard, refetchHistory])
  );

  // Hardware back button on dashboard → confirm exit
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        setExitConfirmVisible(true);
        return true; // prevent default exit
      });
      return () => sub.remove();
    }, [])
  );

  const handleConfirmExit = useCallback(async () => {
    setExitConfirmVisible(false);
    if (Platform.OS !== "web") {
      try { BackHandler.exitApp(); } catch {}
    }
    try { await reloadAppAsync(); } catch {}
  }, []);

  const padH = Math.max(insets.left + Spacing.sm, Spacing.lg);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.md);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <ThemedView style={styles.container}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <View style={styles.headerBrand}>
          <Image
            source={require("../../assets/images/icon.png")}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <View>
            <ThemedText style={styles.appName}>Ultra Cast</ThemedText>
            <ThemedText style={styles.appVersion}>v3</ThemedText>
          </View>
        </View>

        <View style={styles.headerActions}>
          <RefreshButton onPress={handleRefresh} refreshing={refreshing} />

          <ProfileButton onPress={() => navigation.navigate("ProfilePicker", { fromHome: true })} />
          <MessagesButton onPress={() => navigation.navigate("Messages")} />
          <AccountButton onPress={() => navigation.navigate("AccountInfo")} />
        </View>
      </View>

      <View style={[styles.headerDivider, { marginHorizontal: padH }]} />

      {/* ── Announcement Ticker ─────────────────────────────────────────────── */}
      <AnnouncementTicker />

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      {isLandscape ? (
        // ── Landscape / TV layout ──────────────────────────────────────────
        // Left 50%: Live TV (top, large) + Movies | Series (bottom, equal)
        // Right 50%: Advert carousel (fills top) + Search All (bottom)
        <View style={[styles.bodyLandscape, { paddingHorizontal: padH, paddingBottom: padB }]}>

          {/* LEFT PANEL — two sub-columns */}
          <View style={styles.leftPanel}>
            {/* Sub-column A: Live TV | Catch Up | TV Guide */}
            <View style={styles.colA}>
              <NavButton
                title="Live TV"
                icon="tv"
                onPress={() => goToContent("live", "Live TV")}
                style={styles.colATop}
                iconSize={30}
                textSize={17}
              />
              <NavButton
                title="Catch Up"
                icon="clock"
                onPress={() => navigation.navigate("CatchUp")}
                style={styles.catchUpBtn}
                iconSize={16}
                textSize={12}
                compact
              />
              <NavButton
                title="TV Guide"
                icon="calendar"
                onPress={() => navigation.navigate("TvGuide")}
                style={styles.colABot}
                iconSize={22}
                textSize={13}
                compact
              />
            </View>
            {/* Sub-column B: Movies | Series stacked 50/50 */}
            <View style={styles.colB}>
              <NavButton
                title="Movies"
                icon="film"
                onPress={() => goToContent("movies", "Movies")}
                style={styles.colBBtn}
                iconSize={28}
                textSize={16}
              />
              <NavButton
                title="Series"
                icon="grid"
                onPress={() => goToContent("series", "Series")}
                style={styles.colBBtn}
                iconSize={28}
                textSize={16}
              />
            </View>
          </View>

          {/* RIGHT PANEL */}
          <View style={styles.rightPanel}>
            {/* Advert carousel */}
            <AdvertCarousel style={styles.carouselFill} />
            {/* Search All */}
            <SearchButton onPress={() => navigation.navigate("Search")} />
            {/* Previously Watched — fills dead space at bottom */}
            <RecentlyWatchedCard
              style={styles.recentlyWatched}
              refreshKey={recentRefreshKey}
              maxItems={2}
              onPress={(item) => {
                if (!item.stream_url) return;
                if (item.content_type === "live") {
                  navigation.navigate("LivePreview", {
                    streamId: Number(item.stream_id) || 0,
                    name: item.name,
                    streamUrl: item.stream_url,
                    thumbnail: item.thumbnail_url ?? undefined,
                    streamIcon: item.thumbnail_url ?? undefined,
                    initialFullscreen: true,
                  });
                  return;
                }
                navigation.navigate("Player", {
                  streamUrl: item.stream_url,
                  title: item.name,
                  type: item.content_type === "series" ? "series" : "vod",
                  thumbnail: item.thumbnail_url ?? undefined,
                  streamId: item.stream_id ?? undefined,
                  resumeTime: item.is_completed ? 0 : (item.current_time ?? 0),
                  seriesId: item.series_id ?? undefined,
                  seasonNum: item.season_num ?? undefined,
                  episodeNum: item.episode_num ?? undefined,
                });
              }}
            />
          </View>
        </View>
      ) : (
        // ── Portrait / Mobile layout ────────────────────────────────────────
        <View style={[styles.bodyPortrait, { paddingHorizontal: padH, paddingBottom: padB }]}>
          {/* Portrait top: Live TV full-width */}
          <NavButton
            title="Live TV"
            icon="tv"
            onPress={() => goToContent("live", "Live TV")}
            style={styles.portraitTopFull}
            iconSize={26}
            textSize={15}
          />
          {/* Portrait mid row: Movies + Series */}
          <View style={styles.portraitSubRow}>
            <NavButton
              title="Movies"
              icon="film"
              onPress={() => goToContent("movies", "Movies")}
              style={styles.portraitSubBtn}
              iconSize={18}
              textSize={12}
              compact
            />
            <NavButton
              title="Series"
              icon="grid"
              onPress={() => goToContent("series", "Series")}
              style={styles.portraitSubBtn}
              iconSize={18}
              textSize={12}
              compact
            />
          </View>
          {/* Portrait small row: Catch Up + TV Guide */}
          <View style={styles.portraitSubRow}>
            <NavButton
              title="Catch Up"
              icon="clock"
              onPress={() => navigation.navigate("CatchUp")}
              style={styles.portraitSubBtn}
              iconSize={16}
              textSize={11}
              compact
            />
            <NavButton
              title="TV Guide"
              icon="calendar"
              onPress={() => navigation.navigate("TvGuide")}
              style={styles.portraitSubBtn}
              iconSize={16}
              textSize={11}
              compact
            />
          </View>
          <RecentlyWatchedCard
            style={styles.portraitRecent}
            refreshKey={recentRefreshKey}
            maxItems={2}
            onPress={(item) => {
              if (!item.stream_url) return;
              if (item.content_type === "live") {
                navigation.navigate("LivePreview", {
                  streamId: Number(item.stream_id) || 0,
                  name: item.name,
                  streamUrl: item.stream_url,
                  thumbnail: item.thumbnail_url ?? undefined,
                  streamIcon: item.thumbnail_url ?? undefined,
                  initialFullscreen: true,
                });
                return;
              }
              navigation.navigate("Player", {
                streamUrl: item.stream_url,
                title: item.name,
                type: item.content_type === "series" ? "series" : "vod",
                thumbnail: item.thumbnail_url ?? undefined,
                streamId: item.stream_id ?? undefined,
                resumeTime: item.is_completed ? 0 : (item.current_time ?? 0),
                seriesId: item.series_id ?? undefined,
                seasonNum: item.season_num ?? undefined,
                episodeNum: item.episode_num ?? undefined,
              });
            }}
          />
          <SearchButton onPress={() => navigation.navigate("Search")} />
          <View style={styles.portraitCarousel}>
            <AdvertCarousel style={StyleSheet.absoluteFill} />
          </View>
        </View>
      )}
      <ExitConfirmModal
        visible={exitConfirmVisible}
        onCancel={() => setExitConfirmVisible(false)}
        onConfirm={handleConfirmExit}
      />
    </ThemedView>
  );
}

function ExitConfirmModal({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.exitBackdrop}>
        <View style={styles.exitDialog}>
          <View style={styles.exitIconWrap}>
            <Feather name="log-out" size={28} color={Colors.dark.accent} />
          </View>
          <ThemedText style={styles.exitTitle}>Exit Ultra Cast?</ThemedText>
          <ThemedText style={styles.exitMsg}>
            Are you sure you want to close the app?
          </ThemedText>
          <View style={styles.exitBtnRow}>
            <ExitDialogBtn label="No" onPress={onCancel} variant="secondary" autoFocus />
            <ExitDialogBtn label="Yes, Exit" onPress={onConfirm} variant="primary" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ExitDialogBtn({
  label,
  onPress,
  variant,
  autoFocus,
}: {
  label: string;
  onPress: () => void;
  variant: "primary" | "secondary";
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  const isPrimary = variant === "primary";
  return (
    <Pressable
      hasTVPreferredFocus={autoFocus}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.exitBtn,
        isPrimary ? styles.exitBtnPrimary : styles.exitBtnSecondary,
        isActive && (isPrimary ? styles.exitBtnPrimaryActive : styles.exitBtnSecondaryActive),
      ]}
    >
      <ThemedText
        style={[
          styles.exitBtnText,
          isPrimary ? styles.exitBtnTextPrimary : styles.exitBtnTextSecondary,
          isActive && isPrimary && styles.exitBtnTextPrimaryActive,
        ]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // ── Exit confirmation modal ─────────────────────────────────────────────
  exitBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  exitDialog: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.dark.accent,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.md,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  exitIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,102,0,0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(255,102,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  exitTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 0.5,
  },
  exitMsg: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  exitBtnRow: {
    flexDirection: "row",
    gap: Spacing.md,
    width: "100%",
    marginTop: Spacing.sm,
  },
  exitBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  exitBtnSecondary: {
    backgroundColor: "transparent",
    borderColor: Colors.dark.border,
  },
  exitBtnSecondaryActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: "rgba(255,102,0,0.08)",
  },
  exitBtnPrimary: {
    backgroundColor: "rgba(255,102,0,0.15)",
    borderColor: Colors.dark.accent,
  },
  exitBtnPrimaryActive: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 8,
  },
  exitBtnText: { fontSize: 14, fontWeight: "700", letterSpacing: 0.5 },
  exitBtnTextSecondary: { color: Colors.dark.textSecondary },
  exitBtnTextPrimary: { color: Colors.dark.accent },
  exitBtnTextPrimaryActive: { color: "#fff" },

  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", paddingBottom: Spacing.md,
  },
  headerBrand: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  headerLogo: { width: 36, height: 36 },
  appName: { fontSize: 18, fontWeight: "700", color: Colors.dark.text, letterSpacing: 0.5 },
  appVersion: { fontSize: 11, color: Colors.dark.accent, fontWeight: "600", letterSpacing: 1 },
  headerActions: { flexDirection: "row", gap: Spacing.sm, alignItems: "center" },
  headerBtn: {
    width: 38, height: 38, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  headerBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  headerBtnAlert: { borderColor: "rgba(255,102,0,0.5)", backgroundColor: Colors.dark.accentDim },
  unreadBadge: {
    position: "absolute", top: -4, right: -4,
    backgroundColor: Colors.dark.accent, borderRadius: BorderRadius.full,
    minWidth: 16, height: 16, justifyContent: "center", alignItems: "center",
    paddingHorizontal: 3, borderWidth: 1.5, borderColor: Colors.dark.backgroundRoot,
  },
  unreadBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  profileBtn: {
    flexDirection: "row", alignItems: "center", gap: Spacing.xs,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full, backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, maxWidth: 130,
  },
  profileBtnActive: { backgroundColor: Colors.dark.backgroundSecondary },
  profileBtnAvatar: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1, justifyContent: "center", alignItems: "center",
  },
  profileBtnName: { fontSize: 12, fontWeight: "600", flex: 1 },
  headerDivider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.xs },

  // ── Landscape body ───────────────────────────────────────────────────────
  bodyLandscape: {
    flex: 1,
    flexDirection: "row",
    gap: Spacing.lg,
    paddingTop: Spacing.sm,
  },

  // Left panel — 50%, two sub-columns
  leftPanel: {
    flex: 1,
    flexDirection: "row",
    gap: Spacing.sm,
  },
  // Sub-column A: Live TV | Catch Up | TV Guide
  colA: {
    flex: 1,
    flexDirection: "column",
    gap: Spacing.sm,
  },
  colATop: { flex: 2, minHeight: 0 },
  catchUpBtn: { flex: 1, minHeight: 0 },
  colABot: { flex: 1, minHeight: 0 },
  // Sub-column B: Movies | Series 50/50
  colB: {
    flex: 1,
    flexDirection: "column",
    gap: Spacing.sm,
  },
  colBBtn: { flex: 1, minHeight: 0 },

  // Right panel — 50%
  rightPanel: {
    flex: 1,
    flexDirection: "column",
    gap: Spacing.sm,
  },
  // Carousel — grows to fill all available space, pushing search+recent to bottom
  carouselFill: {
    flex: 1,
    width: "100%",
    minHeight: 0,
  },

  // Recently Watched — content-height only, no flex growth
  recentlyWatched: {
    flexShrink: 0,
  },
  portraitRecent: {
    width: "100%",
  },

  // ── Portrait body ────────────────────────────────────────────────────────
  bodyPortrait: { flex: 1, flexDirection: "column", gap: Spacing.md, paddingTop: Spacing.md },
  portraitTopFull: { height: 90, width: "100%" },
  portraitSubRow: { height: 64, flexDirection: "row", gap: Spacing.sm },
  portraitSubBtn: { flex: 1 },
  portraitCarousel: { width: "100%", aspectRatio: 16 / 9, minHeight: 0 },

  // ── Nav buttons (base) ──────────────────────────────────────────────────
  navButton: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
    gap: Spacing.sm,
    overflow: "hidden",
  },
  navButtonCompact: {
    padding: Spacing.sm,
    gap: 4,
  },
  navButtonActive: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 12,
  },
  iconWrap: {
    width: 56, height: 56, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  iconWrapCompact: { width: 36, height: 36 },
  iconWrapActive: { backgroundColor: Colors.dark.accentDim, borderColor: Colors.dark.accent },
  navButtonText: { fontWeight: "700", color: Colors.dark.textSecondary, letterSpacing: 0.3 },
  navButtonTextActive: { color: Colors.dark.accent },

  // ── Search button ────────────────────────────────────────────────────────
  searchButton: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.dark.accent,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    overflow: "hidden",
    flexShrink: 0,
  },
  searchButtonActive: {
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 14,
    elevation: 10,
  },
  searchBtnIconWrap: {
    width: 34, height: 34, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.accentDim,
    borderWidth: 1, borderColor: Colors.dark.accent,
    justifyContent: "center", alignItems: "center",
    flexShrink: 0,
  },
  searchBtnIconWrapActive: { backgroundColor: "rgba(255,102,0,0.3)" },
  searchBtnTextCol: { flex: 1, gap: 1 },
  searchBtnText: {
    color: Colors.dark.accent, fontSize: 15, fontWeight: "700", letterSpacing: 0.2,
  },
  searchBtnTextActive: { color: Colors.dark.accent },
  searchBtnHint: { color: Colors.dark.textSecondary, fontSize: 11 },

  activeIndicator: {
    position: "absolute", bottom: 0, left: "20%", right: "20%",
    height: 2, backgroundColor: Colors.dark.accent, borderRadius: 1,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 6,
  },
});
