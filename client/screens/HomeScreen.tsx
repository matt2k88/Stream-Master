import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { View, StyleSheet, Pressable, Image, useWindowDimensions, Modal, BackHandler, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { markReplayIntroOnResume } from "@/lib/intro-flag";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { LinearGradient } from "expo-linear-gradient";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/contexts/ProfileContext";
import { useMessages } from "@/contexts/MessageContext";
import { useVpn } from "@/contexts/VpnContext";
import { useWatchHistory } from "@/contexts/WatchHistoryContext";
import { useUISettings } from "@/contexts/UISettingsContext";
import { useAppTheme, useAccent } from "@/contexts/ThemeContext";
import type { ThemeIconKey } from "@/constants/themes";
import AdvertCarousel from "@/components/AdvertCarousel";
import AnnouncementTicker from "@/components/AnnouncementTicker";
import RecentlyWatchedCard, { type WatchSectionConfig } from "@/components/RecentlyWatchedCard";
import RenewalNoticeModal from "@/components/RenewalNoticeModal";
import { useExpiryStatus } from "@/hooks/useExpiryStatus";
import { formatExpiryNotice } from "@/lib/expiry";
import { hasSeenRenewalNotice, markRenewalNoticeSeen } from "@/lib/renewal-notice";
import { xtreamApi } from "@/lib/xtream-api";
import type { RecentlyWatched } from "@/components/RecentlyWatchedCard";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

function ExpiryBanner({
  status,
  onPress,
}: {
  status: ReturnType<typeof useExpiryStatus>;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = hovered || focused || pressed;

  if (status.loading) return null;
  if (status.isLifetime) return null;
  if (!status.isExpiringSoon && !status.isExpired) return null;

  return (
    <View style={styles.expiryBannerWrap}>
      <Pressable
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={[styles.expiryBanner, isActive && styles.expiryBannerActive]}
      >
        <Feather name="alert-circle" size={13} color={Colors.dark.error} />
        <ThemedText style={styles.expiryBannerText} numberOfLines={1}>
          {formatExpiryNotice(status)}
        </ThemedText>
        <View style={[styles.expiryBannerHintWrap, isActive && styles.expiryBannerHintWrapActive]}>
          <ThemedText
            style={[styles.expiryBannerHint, isActive && styles.expiryBannerHintActive]}
            numberOfLines={1}
          >
            Tap for details
          </ThemedText>
        </View>
      </Pressable>
    </View>
  );
}

interface NavButtonProps {
  hideCount?: boolean;
  title: string;
  icon: keyof typeof Feather.glyphMap;
  mciIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  /** Theme icon slot — when the active theme provides a themed image
   *  for this slot, it replaces the vector glyph. */
  iconKey?: ThemeIconKey;
  onPress: () => void;
  style?: any;
  iconSize?: number;
  textSize?: number;
  compact?: boolean;
  loading?: boolean;
  count?: number;
  countLabel?: string;
}

function formatCount(n: number) {
  return n.toLocaleString("en-US");
}

function NavButton({
  title, icon, mciIcon, iconKey, onPress, style, iconSize = 30, textSize = 16,
  compact = false, loading = false, count, countLabel, hideCount = false,
}: NavButtonProps) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed || loading;
  const { scaleFont } = useUISettings();
  const { getIcon } = useAppTheme();
  // Only scale the label — leaving icon size untouched preserves the carefully
  // tuned 2x2 button grid layout in landscape (Live TV / Movies / Series / TV Guide).
  const scaledTextSize = scaleFont(textSize);
  const showCount = typeof count === "number" && !hideCount;
  const accent = useAccent();
  const iconColor = isActive ? accent.hover : accent.accent;
  // Themed icon images intentionally disabled — keep the original vector
  // glyphs and let them re-tint via the theme accent instead.
  void iconKey; void getIcon;

  return (
    <Pressable
      style={[
        styles.navButton,
        compact && styles.navButtonCompact,
        { borderColor: accent.withAlpha(accent.accent, compact ? 0.25 : 0.35) },
        isActive && styles.navButtonActive,
        isActive && { borderColor: accent.accent, shadowColor: accent.accent },
        style,
      ]}
      onPress={loading ? undefined : onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {/* Always-on subtle gradient sheen — stronger when focused */}
      <LinearGradient
        colors={isActive ? accent.gradStrong : accent.gradSoft}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
      />
      <View style={[styles.iconWrap, compact && styles.iconWrapCompact, isActive && styles.iconWrapActive]}>
        {loading ? (
          <ActivityIndicator size={Math.max(18, iconSize - 4)} color={accent.accent} />
        ) : mciIcon ? (
          <MaterialCommunityIcons name={mciIcon} size={iconSize} color={iconColor} />
        ) : (
          <Feather name={icon} size={iconSize} color={iconColor} />
        )}
      </View>
      <ThemedText
        style={[
          styles.navButtonText,
          { fontSize: scaledTextSize },
          isActive && styles.navButtonTextActive,
          isActive && { color: accent.accent, textShadowColor: accent.accent, textShadowRadius: 8 },
        ]}
        numberOfLines={1}
      >
        {loading ? "Loading…" : title}
      </ThemedText>
      {showCount ? (
        <View
          style={[
            styles.countChip,
            {
              borderColor: accent.withAlpha(accent.accent, 0.55),
              backgroundColor: accent.withAlpha(accent.accent, 0.08),
            },
            isActive && styles.countChipActive,
            isActive && { borderColor: accent.hover, backgroundColor: accent.accent },
          ]}
        >
          <ThemedText
            style={[
              styles.countChipNumber,
              { color: accent.accent },
              isActive && styles.countChipNumberActive,
            ]}
          >
            {formatCount(count!)}
          </ThemedText>
          {countLabel ? (
            <ThemedText style={[styles.countChipLabel, isActive && styles.countChipLabelActive]} numberOfLines={1}>
              {countLabel}
            </ThemedText>
          ) : null}
        </View>
      ) : null}
      {isActive ? <View style={[styles.activeIndicator, { backgroundColor: accent.accent, shadowColor: accent.accent }]} /> : null}
    </Pressable>
  );
}

function SearchHeaderButton({ onPress }: { onPress: () => void }) {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const isActive = pressed || focused;
  const accent = useAccent();
  return (
    <Pressable
      style={[
        styles.headerBtn,
        isActive && styles.headerBtnActive,
        isActive && { borderColor: accent.accent, backgroundColor: accent.accentDim },
      ]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <Feather name="search" size={18} color={isActive ? accent.accent : Colors.dark.textSecondary} />
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
  const accent = useAccent();
  return (
    <Pressable
      style={[
        styles.headerBtn,
        isActive && styles.headerBtnActive,
        isActive && { borderColor: accent.accent, backgroundColor: accent.accentDim },
      ]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={refreshing}
    >
      <Feather name="refresh-cw" size={16} color={refreshing || isActive ? accent.accent : Colors.dark.textSecondary} />
    </Pressable>
  );
}

function AccountButton({ onPress }: { onPress: () => void }) {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const isActive = pressed || focused;
  const accent = useAccent();
  return (
    <Pressable
      style={[
        styles.headerBtn,
        isActive && styles.headerBtnActive,
        isActive && { borderColor: accent.accent, backgroundColor: accent.accentDim },
      ]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <Feather name="user" size={18} color={accent.accent} />
    </Pressable>
  );
}

function VpnButton() {
  const { status, toggle, toggling } = useVpn();
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const btnRef = useRef<View>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = pressed || focused;
  const isLoading = status === "loading" || toggling;
  const isEnabled = status === "enabled";
  const isSubscribed = status === "enabled" || status === "disabled";

  // Tint:
  // - enabled  → neon green
  // - disabled → mid-grey (subscribed but switched off)
  // - none     → faded grey (no subscription)
  const tint =
    isEnabled ? "#22C55E" :
    status === "disabled" ? Colors.dark.textSecondary :
    "#5a5a5a";

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const closeTooltip = useCallback(() => {
    clearTimer();
    setTooltipVisible(false);
  }, []);

  const openTooltip = useCallback(() => {
    if (btnRef.current && (btnRef.current as any).measureInWindow) {
      (btnRef.current as any).measureInWindow((x: number, y: number, w: number, h: number) => {
        setAnchor({ x, y, w, h });
        setTooltipVisible(true);
        clearTimer();
        timerRef.current = setTimeout(() => setTooltipVisible(false), 6000);
      });
    } else {
      setTooltipVisible(true);
      clearTimer();
      timerRef.current = setTimeout(() => setTooltipVisible(false), 6000);
    }
  }, []);

  useEffect(() => () => clearTimer(), []);

  const handlePress = () => {
    if (isLoading) return;
    if (isSubscribed) {
      toggle();
    } else {
      openTooltip();
    }
  };

  return (
    <>
      <Pressable
        ref={btnRef as any}
        style={[
          styles.headerBtn,
          isActive && styles.headerBtnActive,
          isEnabled && styles.headerBtnVpnOn,
        ]}
        onPress={handlePress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={isEnabled ? "#22C55E" : Colors.dark.textSecondary} />
        ) : (
          <Feather
            name="shield"
            size={18}
            color={isActive ? Colors.dark.accent : tint}
            style={!isSubscribed && !isActive ? { opacity: 0.55 } : undefined}
          />
        )}
        {isEnabled ? <View style={styles.vpnDot} /> : null}
      </Pressable>

      <Modal
        visible={tooltipVisible}
        transparent
        animationType="fade"
        onRequestClose={closeTooltip}
      >
        <Pressable style={styles.vpnTooltipBackdrop} onPress={closeTooltip}>
          {anchor ? (
            <View
              style={[
                styles.vpnTooltip,
                {
                  // Position the tooltip just below the button, right-aligned to
                  // the button so it stays on screen when the button is near
                  // the right edge of the header.
                  top: anchor.y + anchor.h + 8,
                  right: undefined,
                  left: Math.max(8, anchor.x + anchor.w / 2 - 150),
                },
              ]}
            >
              <View
                style={[
                  styles.vpnTooltipArrow,
                  { left: Math.min(280, Math.max(12, anchor.x + anchor.w / 2 - Math.max(8, anchor.x + anchor.w / 2 - 150) - 6)) },
                ]}
              />
              <ThemedText style={styles.vpnTooltipText}>
                You don't currently have a VPN subscription. Contact us now if you'd like to add one.
              </ThemedText>
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

function MessagesButton({ onPress }: { onPress: () => void }) {
  const { unreadCount } = useMessages();
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const hasUnread = unreadCount > 0;
  const isActive = pressed || focused;
  const accent = useAccent();

  return (
    <Pressable
      style={[
        styles.headerBtn,
        isActive && styles.headerBtnActive,
        hasUnread && styles.headerBtnAlert,
        hasUnread && { borderColor: accent.withAlpha(accent.accent, 0.5), backgroundColor: accent.accentDim },
        isActive && { borderColor: accent.accent, backgroundColor: accent.accentDim },
      ]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <Feather name="bell" size={18} color={hasUnread ? accent.accent : Colors.dark.textSecondary} />
      {hasUnread ? (
        <View style={[styles.unreadBadge, { backgroundColor: accent.accent }]}>
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
  const { refresh, liveCategories, vodCategories, seriesCategories, liveStreams, vodStreams, seriesList } = useData();
  const themeAccent = useAccent();
  const { refetch: refetchTheme } = useAppTheme();

  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);

  // Navigate directly to ContentList, pre-selecting the first real category.
  // We defer the heavy navigation work to the next frame so the loading
  // spinner gets a chance to paint first (otherwise on slow TV devices the
  // press feels frozen because the JS thread is busy mounting the next
  // screen before the spinner can render).
  const goToContent = (type: "live" | "movies" | "series", title: string) => {
    setNavigatingTo(type);
    // Movies + Series default to the new "Recently Added" pinned category
    // (newest 30 items). Live still defaults to the first real category.
    if (type === "movies" || type === "series") {
      requestAnimationFrame(() => {
        navigation.navigate("ContentList", {
          type,
          categoryId: "recent",
          categoryName: "Recently Added",
        });
      });
      return;
    }
    const cats = liveCategories;
    const first = cats[0];
    requestAnimationFrame(() => {
      navigation.navigate("ContentList", {
        type,
        categoryId: first?.category_id ?? "",
        categoryName: first?.category_name ?? title,
      });
    });
  };
  const goToScreen = (key: string, screen: "TvGuide" | "CatchUp") => {
    setNavigatingTo(key);
    requestAnimationFrame(() => {
      navigation.navigate(screen);
    });
  };
  const { setOnDashboard } = useMessages();
  const [refreshing, setRefreshing] = useState(false);
  const [recentRefreshKey, setRecentRefreshKey] = useState(0);
  const [exitConfirmVisible, setExitConfirmVisible] = useState(false);

  // ── Renewal notice (auto-popup once per expiry cycle) ──────────────────
  const { userInfo } = useAuth();
  const expiryStatus = useExpiryStatus();
  const renewalUsername = userInfo?.user_info?.username ?? "";
  const renewalExpDate = userInfo?.user_info?.exp_date ?? null;
  const [renewalModalVisible, setRenewalModalVisible] = useState(false);
  const renewalAutoCheckedRef = useRef(false);

  useEffect(() => {
    // Only run the auto-popup check once per mount, after the lifetime
    // lookup has resolved AND the user is genuinely in the warning window.
    if (renewalAutoCheckedRef.current) return;
    if (expiryStatus.loading) return;
    if (expiryStatus.isLifetime) return;
    if (!expiryStatus.isExpiringSoon && !expiryStatus.isExpired) return;
    if (!renewalUsername || !renewalExpDate) return;

    renewalAutoCheckedRef.current = true;
    let cancelled = false;
    (async () => {
      const seen = await hasSeenRenewalNotice(renewalUsername, renewalExpDate);
      if (!cancelled && !seen) setRenewalModalVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    expiryStatus.loading,
    expiryStatus.isLifetime,
    expiryStatus.isExpiringSoon,
    expiryStatus.isExpired,
    renewalUsername,
    renewalExpDate,
  ]);

  const handleRenewalDismiss = useCallback(() => {
    setRenewalModalVisible(false);
    // Persist dismissal per (user, expDate) so it doesn't auto-reappear
    // until the subscription is renewed (which changes exp_date and
    // therefore the storage key).
    void markRenewalNoticeSeen(renewalUsername, renewalExpDate);
  }, [renewalUsername, renewalExpDate]);

  const handleRenewalReopen = useCallback(() => {
    // Manual reopen via the banner — does NOT clear the "seen" flag.
    setRenewalModalVisible(true);
  }, []);

  const { refetch: refetchHistory } = useWatchHistory();
  useFocusEffect(
    useCallback(() => {
      setOnDashboard(true);
      setNavigatingTo(null); // clear loading state when returning to home
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
    // Persist a flag so that on next launch / next foreground the intro
    // replays — guarantees the user sees the intro again next time, even
    // when the OS decides to keep the JS process warm and skip a real
    // cold start.
    try { await markReplayIntroOnResume(); } catch {}
    // Android: actually quits the activity. iOS: per Apple HIG apps cannot
    // programmatically exit, so we just dismiss the dialog (the user can
    // swipe up to background it). On next foreground the AppState listener
    // in App.tsx detects the flag above and replays the intro.
    if (Platform.OS === "android") {
      try { BackHandler.exitApp(); } catch {}
    }
  }, []);

  const padH = Math.max(insets.left + Spacing.sm, Spacing.lg);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.md);

  // Dashboard watch-history sections — Live (recently watched) + in-progress
  // movies/series (continue watching), shown inside one shared card box.
  const watchSections: WatchSectionConfig[] = useMemo(() => [
    {
      label: "Recently Watched",
      icon: "tv",
      filter: (e) => e.content_type === "live",
      emptyText: "No live channels watched yet",
      maxItems: 2,
    },
    {
      label: "Continue Watching",
      icon: "play-circle",
      // Movies disappear when finished. Series stay forever once started —
      // even fully-watched ones — so weekly-release shows aren't lost. The
      // dedupe in RecentlyWatchedCard collapses series entries by series_id
      // so we still only ever see one row per series (the latest episode).
      // Series-wide badging (WATCHED / NEW EPISODES) is applied at render
      // time using getSeriesProgress on the row.
      filter: (e) =>
        (e.content_type === "movie" && !e.is_completed && (e.current_time ?? 0) > 0) ||
        (e.content_type === "series" && e.series_id != null),
      emptyText: "Nothing in progress",
      maxItems: 2,
    },
  ], []);

  // Continue Watching click handler. For series rows where the LAST watched
  // episode is already completed, asynchronously resolve the next episode
  // (next ep_num in same season → first ep of next numeric season) and play
  // THAT episode instead of replaying the finished one. Falls back to the
  // current episode if no next exists (e.g. user finished the series final).
  const handleRecentPress = useCallback(async (item: RecentlyWatched) => {
    if (item.content_type === "live") {
      if (!item.stream_url) return;
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
    if (item.content_type === "movie" && item.stream_id) {
      navigation.navigate("MovieInfo", {
        streamId: Number(item.stream_id),
        name: item.name,
        streamIcon: item.thumbnail_url ?? undefined,
      });
      return;
    }

    // Series flow
    if (item.content_type === "series") {
      // If the last episode is completed, try to advance to the next one.
      if (item.is_completed && item.series_id != null && item.season_num != null && item.episode_num != null) {
        try {
          const info = await xtreamApi.getSeriesInfo(Number(item.series_id));
          if (info?.episodes) {
            const curSeason = Number(item.season_num);
            const curEp = Number(item.episode_num);
            const sameSeasonEps = info.episodes[String(curSeason)] || [];
            let nextEp = sameSeasonEps.find((e) => Number(e.episode_num) === curEp + 1);
            let nextSeason = curSeason;
            if (!nextEp) {
              const seasonKeys = Object.keys(info.episodes)
                .map(Number)
                .filter((n) => !isNaN(n))
                .sort((a, b) => a - b);
              const ns = seasonKeys.find((s) => s > curSeason);
              if (ns != null) {
                const sEps = info.episodes[String(ns)] || [];
                if (sEps.length > 0) {
                  nextEp = sEps[0];
                  nextSeason = ns;
                }
              }
            }
            if (nextEp) {
              navigation.navigate("Player", {
                streamUrl: xtreamApi.getSeriesStreamUrl(nextEp.id, nextEp.container_extension),
                title: `${item.name} - ${nextEp.title}`,
                type: "series",
                thumbnail: nextEp.info?.movie_image ?? item.thumbnail_url ?? undefined,
                streamId: String(nextEp.id),
                seriesId: String(item.series_id),
                seasonNum: nextSeason,
                episodeNum: Number(nextEp.episode_num),
                resumeTime: 0,
              });
              return;
            }
          }
        } catch {
          // Network/API error — fall through to legacy behaviour below.
        }
      }
      // Default series behaviour: resume the saved episode (or replay if
      // completed but no next episode could be resolved).
      if (!item.stream_url) return;
      navigation.navigate("Player", {
        streamUrl: item.stream_url,
        title: item.name,
        type: "series",
        thumbnail: item.thumbnail_url ?? undefined,
        streamId: item.stream_id ?? undefined,
        resumeTime: item.is_completed ? 0 : (item.current_time ?? 0),
        seriesId: item.series_id ?? undefined,
        seasonNum: item.season_num ?? undefined,
        episodeNum: item.episode_num ?? undefined,
      });
    }
  }, [navigation]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    // Re-check the active theme in parallel with content refresh so an
    // admin-flipped theme picks up on the next press without an app restart.
    await Promise.all([refresh(), refetchTheme()]);
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
          {isLandscape ? (
            <View>
              <ThemedText style={styles.appName}>Ultra Cast</ThemedText>
              <ThemedText style={[styles.appVersion, { color: themeAccent.accent }]}>v3</ThemedText>
            </View>
          ) : null}
        </View>

        <View style={styles.headerActions}>
          <SearchHeaderButton onPress={() => navigation.navigate("Search")} />
          <RefreshButton onPress={handleRefresh} refreshing={refreshing} />
          <VpnButton />
          <ProfileButton onPress={() => navigation.navigate("ProfilePicker", { fromHome: true })} />
          <MessagesButton onPress={() => navigation.navigate("Messages")} />
          <AccountButton onPress={() => navigation.navigate("AccountInfo")} />
        </View>
      </View>

      <View style={[styles.headerDivider, { marginHorizontal: padH }]} />

      {/* ── Expiry warning ──────────────────────────────────────────────────── */}
      {/* Subtle one-line banner that only appears when the user's subscription
          is within EXPIRY_WARNING_DAYS (7) of expiring or has expired. Lifetime
          accounts never see this. Tapping opens Account Info. */}
      <ExpiryBanner status={expiryStatus} onPress={handleRenewalReopen} />

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
                title="LIVE TV"
                count={liveStreams.length}
                countLabel="CHANNELS"
                icon="tv"
                mciIcon="television-classic"
                iconKey="liveTv"
                onPress={() => goToContent("live", "Live TV")}
                loading={navigatingTo === "live"}
                style={styles.colATop}
                iconSize={42}
                textSize={18}
              />
              <NavButton
                title="Catch Up"
                icon="clock"
                iconKey="catchUp"
                onPress={() => goToScreen("catchup", "CatchUp")}
                loading={navigatingTo === "catchup"}
                style={styles.catchUpBtn}
                iconSize={16}
                textSize={12}
                compact
              />
              <NavButton
                title="TV Guide"
                icon="calendar"
                iconKey="tvGuide"
                onPress={() => goToScreen("tvguide", "TvGuide")}
                loading={navigatingTo === "tvguide"}
                style={styles.colABot}
                iconSize={22}
                textSize={13}
                compact
              />
            </View>
            {/* Sub-column B: Movies | Series stacked 50/50 */}
            <View style={styles.colB}>
              <NavButton
                title="MOVIES"
                count={vodStreams.length}
                countLabel="MOVIES"
                icon="film"
                mciIcon="movie-open-outline"
                iconKey="movies"
                onPress={() => goToContent("movies", "Movies")}
                loading={navigatingTo === "movies"}
                style={styles.colBBtn}
                iconSize={38}
                textSize={17}
              />
              <NavButton
                title="SERIES"
                count={seriesList.length}
                countLabel="SERIES"
                icon="grid"
                mciIcon="play-box-multiple-outline"
                iconKey="series"
                onPress={() => goToContent("series", "Series")}
                loading={navigatingTo === "series"}
                style={styles.colBBtn}
                iconSize={38}
                textSize={17}
              />
            </View>
          </View>

          {/* RIGHT PANEL */}
          <View style={styles.rightPanel}>
            {/* Advert carousel */}
            <AdvertCarousel style={styles.carouselFill} />
            {/* Recently Watched (live) + Continue Watching (movies/series) */}
            <RecentlyWatchedCard
              style={styles.recentlyWatched}
              refreshKey={recentRefreshKey}
              maxItems={2}
              sections={watchSections}
              onPress={handleRecentPress}
            />
          </View>
        </View>
      ) : (
        // ── Portrait / Mobile layout ────────────────────────────────────────
        <View style={[styles.bodyPortrait, { paddingHorizontal: padH, paddingBottom: padB }]}>
          {/* Portrait top: Live TV full-width */}
          <NavButton
            title="LIVE TV"
            count={liveStreams.length}
            countLabel="CHANNELS"
            icon="tv"
            mciIcon="television-classic"
            iconKey="liveTv"
            onPress={() => goToContent("live", "Live TV")}
            loading={navigatingTo === "live"}
            style={styles.portraitTopFull}
            iconSize={32}
            textSize={16}
            hideCount
          />
          {/* Portrait mid row: Movies + Series */}
          <View style={styles.portraitSubRowMain}>
            <NavButton
              title="MOVIES"
              count={vodStreams.length}
              countLabel="MOVIES"
              icon="film"
              mciIcon="movie-open-outline"
              iconKey="movies"
              onPress={() => goToContent("movies", "Movies")}
              loading={navigatingTo === "movies"}
              style={styles.portraitSubBtnMain}
              iconSize={28}
              textSize={14}
              hideCount
            />
            <NavButton
              title="SERIES"
              count={seriesList.length}
              countLabel="SERIES"
              icon="grid"
              mciIcon="play-box-multiple-outline"
              iconKey="series"
              onPress={() => goToContent("series", "Series")}
              loading={navigatingTo === "series"}
              style={styles.portraitSubBtnMain}
              iconSize={28}
              textSize={14}
              hideCount
            />
          </View>
          {/* Portrait small row: Catch Up + TV Guide */}
          <View style={styles.portraitSubRow}>
            <NavButton
              title="Catch Up"
              icon="clock"
              iconKey="catchUp"
              onPress={() => goToScreen("catchup", "CatchUp")}
              loading={navigatingTo === "catchup"}
              style={styles.portraitSubBtn}
              iconSize={16}
              textSize={11}
              compact
            />
            <NavButton
              title="TV Guide"
              icon="calendar"
              iconKey="tvGuide"
              onPress={() => goToScreen("tvguide", "TvGuide")}
              loading={navigatingTo === "tvguide"}
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
            sections={watchSections}
            onPress={handleRecentPress}
          />
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
      <RenewalNoticeModal
        visible={renewalModalVisible}
        status={expiryStatus}
        onClose={handleRenewalDismiss}
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
  headerBtnVpnOn: {
    borderColor: "#22C55E",
    backgroundColor: "rgba(34,197,94,0.12)",
    shadowColor: "#22C55E",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 4,
  },
  vpnDot: {
    position: "absolute", top: -2, right: -2,
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: "#22C55E",
    borderWidth: 1.5, borderColor: Colors.dark.backgroundRoot,
  },
  vpnTooltipBackdrop: {
    flex: 1,
    backgroundColor: "transparent",
  },
  vpnTooltip: {
    position: "absolute",
    width: 300,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.md,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 8,
  },
  vpnTooltipArrow: {
    position: "absolute",
    top: -6,
    width: 12, height: 12,
    backgroundColor: "#1a1a1a",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: Colors.dark.accent,
    transform: [{ rotate: "45deg" }],
  },
  vpnTooltipText: {
    color: Colors.dark.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
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

  expiryBannerWrap: {
    width: "100%",
    alignItems: "center",
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  expiryBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    alignSelf: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.error + "66",
    backgroundColor: Colors.dark.error + "14",
  },
  expiryBannerActive: {
    borderColor: Colors.dark.error,
    backgroundColor: Colors.dark.error + "26",
    shadowColor: Colors.dark.error,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
  },
  expiryBannerText: {
    color: Colors.dark.error,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  expiryBannerHintWrap: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "transparent",
    marginLeft: Spacing.xs,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  expiryBannerHintWrapActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: "rgba(255,102,0,0.18)",
  },
  expiryBannerHint: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  expiryBannerHintActive: {
    color: Colors.dark.accent,
  },

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
  bodyPortrait: { flex: 1, flexDirection: "column", gap: Spacing.sm, paddingTop: Spacing.sm },
  portraitTopFull: { height: 130, width: "100%", padding: Spacing.md },
  portraitSubRow: { height: 56, flexDirection: "row", gap: Spacing.sm },
  portraitSubBtn: { flex: 1 },
  portraitSubRowMain: { flexDirection: "row", gap: Spacing.sm },
  portraitSubBtnMain: { flex: 1, height: 110, padding: Spacing.md },
  portraitCarousel: { width: "100%", aspectRatio: 16 / 9, minHeight: 0 },

  // ── Nav buttons (base) ──────────────────────────────────────────────────
  navButton: {
    backgroundColor: "rgba(20,12,6,0.85)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: "rgba(255,102,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
    gap: 6,
    overflow: "hidden",
  },
  navButtonCompact: {
    padding: Spacing.sm,
    gap: 4,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.25)",
  },
  navButtonActive: {
    borderColor: Colors.dark.accent,
    borderWidth: 2,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 14,
  },
  iconWrap: {
    width: 60, height: 60, borderRadius: BorderRadius.full,
    backgroundColor: "transparent",
    justifyContent: "center", alignItems: "center",
  },
  iconWrapCompact: { width: 32, height: 32 },
  iconWrapActive: {},
  navButtonText: {
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  navButtonTextActive: { color: "#fff" },
  countChip: {
    marginTop: 6,
    minWidth: 92,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: "rgba(255,102,0,0.55)",
    backgroundColor: "rgba(255,102,0,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  countChipActive: {
    borderColor: "#FFB266",
    backgroundColor: Colors.dark.accent,
  },
  countChipNumber: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.dark.accent,
    letterSpacing: 0.5,
    lineHeight: 22,
  },
  countChipNumberActive: {
    color: "#fff",
  },
  countChipLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    letterSpacing: 1.4,
    marginTop: -1,
  },
  countChipLabelActive: {
    color: "rgba(255,255,255,0.92)",
  },

  activeIndicator: {
    position: "absolute", bottom: 0, left: "20%", right: "20%",
    height: 2, backgroundColor: Colors.dark.accent, borderRadius: 1,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 6,
  },
});
