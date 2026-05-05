import React, { useState, useCallback } from "react";
import { View, StyleSheet, Pressable, Image, useWindowDimensions } from "react-native";
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
import { useProfile } from "@/contexts/ProfileContext";
import { useMessages } from "@/contexts/MessageContext";
import AdvertCarousel from "@/components/AdvertCarousel";
import AnnouncementTicker from "@/components/AnnouncementTicker";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface NavButtonProps {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  large?: boolean;
  tall?: boolean;
  medium?: boolean;
}

function NavButton({ title, icon, onPress, large, tall, medium }: NavButtonProps) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;

  return (
    <Pressable
      style={[
        styles.navButton,
        large && styles.navButtonLarge,
        tall && styles.navButtonTall,
        medium && styles.navButtonMedium,
        isActive && styles.navButtonActive,
      ]}
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
      <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
        <Feather
          name={icon}
          size={large || tall ? 34 : medium ? 28 : 26}
          color={isActive ? Colors.dark.accent : Colors.dark.textSecondary}
        />
      </View>
      <ThemedText
        style={[
          styles.navButtonText,
          (large || tall) && styles.navButtonTextLarge,
          isActive && styles.navButtonTextActive,
        ]}
      >
        {title}
      </ThemedText>
      {isActive ? <View style={styles.activeIndicator} /> : null}
    </Pressable>
  );
}

function SearchButton({ onPress, slim }: { onPress: () => void; slim?: boolean }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;

  return (
    <Pressable
      style={[
        styles.searchButton,
        slim && styles.searchButtonSlim,
        isActive && styles.searchButtonActive,
      ]}
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
        <Feather name="search" size={slim ? 16 : 18} color={Colors.dark.accent} />
      </View>
      <ThemedText style={[styles.searchBtnText, slim && styles.searchBtnTextSlim, isActive && styles.searchBtnTextActive]}>
        {slim ? "Search" : "Search All Content"}
      </ThemedText>
      {!slim ? (
        <ThemedText style={styles.searchBtnHint}>channels, movies, series</ThemedText>
      ) : null}
      {isActive ? <View style={styles.activeIndicator} /> : null}
    </Pressable>
  );
}

function ProfileButton({ onPress }: { onPress: () => void }) {
  const { activeProfile } = useProfile();
  const [pressed, setPressed] = useState(false);

  if (!activeProfile) return null;

  return (
    <Pressable
      style={[styles.profileBtn, pressed && styles.profileBtnActive, { borderColor: activeProfile.avatar_color + "66" }]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      <View
        style={[
          styles.profileBtnAvatar,
          { backgroundColor: activeProfile.avatar_color + "33", borderColor: activeProfile.avatar_color },
        ]}
      >
        <Feather name={activeProfile.avatar_icon as any} size={14} color={activeProfile.avatar_color} />
      </View>
      <ThemedText style={[styles.profileBtnName, { color: activeProfile.avatar_color }]} numberOfLines={1}>
        {activeProfile.name}
      </ThemedText>
      <Feather name="chevron-down" size={12} color={activeProfile.avatar_color + "99"} />
    </Pressable>
  );
}

function MessagesButton({ onPress }: { onPress: () => void }) {
  const { unreadCount } = useMessages();
  const [pressed, setPressed] = useState(false);
  const hasUnread = unreadCount > 0;

  return (
    <Pressable
      style={[styles.headerBtn, pressed && styles.headerBtnActive, hasUnread && styles.headerBtnAlert]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
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
  const { refresh } = useData();
  const { setOnDashboard } = useMessages();
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setOnDashboard(true);
      return () => setOnDashboard(false);
    }, [setOnDashboard])
  );

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
      {/* Header */}
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
          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnActive]}
            onPress={handleRefresh}
            disabled={refreshing}
          >
            <Feather
              name="refresh-cw"
              size={16}
              color={refreshing ? Colors.dark.accent : Colors.dark.textSecondary}
            />
          </Pressable>

          <ProfileButton
            onPress={() => navigation.navigate("ProfilePicker", { fromHome: true })}
          />

          <MessagesButton onPress={() => navigation.navigate("Messages")} />

          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnActive]}
            onPress={() => navigation.navigate("AccountInfo")}
          >
            <Feather name="user" size={18} color={Colors.dark.accent} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.headerDivider, { marginHorizontal: padH }]} />

      {/* Announcement Ticker */}
      <AnnouncementTicker />

      {/* Body */}
      {isLandscape ? (
        // ── Landscape / TV ─────────────────────────────────────────────────
        <View style={[styles.bodyLandscape, { paddingHorizontal: padH, paddingBottom: padB }]}>
          <View style={styles.leftPanel}>
            <NavButton
              title="Live TV"
              icon="tv"
              onPress={() => navigation.navigate("Category", { type: "live", title: "Live TV" })}
              large
            />
            <View style={styles.subRow}>
              <NavButton
                title="Movies"
                icon="film"
                onPress={() => navigation.navigate("Category", { type: "movies", title: "Movies" })}
                tall
              />
              <NavButton
                title="Series"
                icon="grid"
                onPress={() => navigation.navigate("Category", { type: "series", title: "Series" })}
                tall
              />
              <View style={styles.searchCol}>
                <SearchButton onPress={() => navigation.navigate("Search")} slim />
              </View>
            </View>
          </View>
          <View style={styles.rightPanel}>
            <AdvertCarousel style={styles.rightPanelCarousel} />
          </View>
        </View>
      ) : (
        // ── Portrait / Mobile ───────────────────────────────────────────────
        <View style={[styles.bodyPortrait, { paddingHorizontal: padH, paddingBottom: padB }]}>
          <NavButton
            title="Live TV"
            icon="tv"
            onPress={() => navigation.navigate("Category", { type: "live", title: "Live TV" })}
            large
          />
          <View style={styles.subRow}>
            <NavButton
              title="Movies"
              icon="film"
              onPress={() => navigation.navigate("Category", { type: "movies", title: "Movies" })}
              medium
            />
            <NavButton
              title="Series"
              icon="grid"
              onPress={() => navigation.navigate("Category", { type: "series", title: "Series" })}
              medium
            />
          </View>

          <SearchButton onPress={() => navigation.navigate("Search")} />

          {/* Advert carousel fills remaining space */}
          <AdvertCarousel style={styles.portraitCarousel} />
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
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
  headerBtnAlert: {
    borderColor: "rgba(255,102,0,0.5)",
    backgroundColor: Colors.dark.accentDim,
  },
  unreadBadge: {
    position: "absolute", top: -4, right: -4,
    backgroundColor: Colors.dark.accent,
    borderRadius: BorderRadius.full,
    minWidth: 16, height: 16,
    justifyContent: "center", alignItems: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: Colors.dark.backgroundRoot,
  },
  unreadBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },

  profileBtn: {
    flexDirection: "row", alignItems: "center", gap: Spacing.xs,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, maxWidth: 130,
  },
  profileBtnActive: { backgroundColor: Colors.dark.backgroundSecondary },
  profileBtnAvatar: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1, justifyContent: "center", alignItems: "center",
  },
  profileBtnName: { fontSize: 12, fontWeight: "600", flex: 1 },
  headerDivider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.md },

  // Body layouts
  bodyLandscape: { flex: 1, flexDirection: "row", gap: Spacing.lg, paddingTop: Spacing.md },
  leftPanel: { flex: 1, flexDirection: "column", gap: Spacing.md },
  rightPanel: { flex: 1, justifyContent: "center", overflow: "hidden" },
  bodyPortrait: { flex: 1, flexDirection: "column", gap: Spacing.md, paddingTop: Spacing.md },

  subRow: { flexDirection: "row", gap: Spacing.md },
  searchCol: { width: "32%", flexShrink: 0 },

  rightPanelCarousel: { width: "100%", aspectRatio: 16 / 9 },
  portraitCarousel: { width: "100%" },

  // Nav buttons
  navButton: {
    flex: 1, backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
    padding: Spacing.lg, gap: Spacing.sm, overflow: "hidden", minHeight: 80,
  },
  navButtonLarge: { minHeight: 88, padding: Spacing.lg },
  navButtonTall: { minHeight: 140, padding: Spacing.xl },
  navButtonMedium: { minHeight: 130, padding: Spacing.xl },
  navButtonActive: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 16, elevation: 12,
  },
  iconWrap: {
    width: 52, height: 52, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  iconWrapActive: { backgroundColor: Colors.dark.accentDim, borderColor: Colors.dark.accent },
  navButtonText: { fontSize: 14, fontWeight: "600", color: Colors.dark.textSecondary, letterSpacing: 0.3 },
  navButtonTextLarge: { fontSize: 18, fontWeight: "700" },
  navButtonTextActive: { color: Colors.dark.accent },

  // Search button
  searchButton: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.dark.accent,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    overflow: "hidden",
  },
  searchButtonSlim: {
    flex: 1,
    height: undefined,
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  searchButtonActive: {
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 14, elevation: 10,
  },
  searchBtnIconWrap: {
    width: 32, height: 32, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.accentDim,
    borderWidth: 1, borderColor: Colors.dark.accent,
    justifyContent: "center", alignItems: "center",
    flexShrink: 0,
  },
  searchBtnIconWrapActive: { backgroundColor: "rgba(255,102,0,0.3)" },
  searchBtnText: {
    color: Colors.dark.accent, fontSize: 15, fontWeight: "700", letterSpacing: 0.2, flex: 1,
  },
  searchBtnTextSlim: { fontSize: 12, flex: 0, textAlign: "center" },
  searchBtnTextActive: { color: Colors.dark.accent },
  searchBtnHint: {
    color: Colors.dark.textSecondary, fontSize: 11, flexShrink: 1,
  },

  activeIndicator: {
    position: "absolute", bottom: 0, left: "20%", right: "20%",
    height: 2, backgroundColor: Colors.dark.accent, borderRadius: 1,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 6,
  },
});
