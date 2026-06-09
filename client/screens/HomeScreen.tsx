import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { View, StyleSheet, Pressable, Image, useWindowDimensions, Modal, BackHandler, Platform, ActivityIndicator, Alert, AppState, ScrollView } from "react-native";
import Constants from "expo-constants";
import { getApiUrl } from "@/lib/query-client";
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
import { useProfile, makeGuestProfile, type Profile } from "@/contexts/ProfileContext";
import { loadGuestPlayerPrefs } from "@/lib/guest-prefs";
import { useMessages } from "@/contexts/MessageContext";
import { useVpn } from "@/contexts/VpnContext";
import { useWatchHistory } from "@/contexts/WatchHistoryContext";
import { useAppTheme, useAccent } from "@/contexts/ThemeContext";
import { useApkInstaller } from "@/hooks/useApkInstaller";
import AdvertCarousel from "@/components/AdvertCarousel";
import AnnouncementTicker from "@/components/AnnouncementTicker";
import RecentlyWatchedCard, { type WatchSectionConfig } from "@/components/RecentlyWatchedCard";
import GuestPrompt from "@/components/GuestPrompt";
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

function formatCount(n: number) {
  return n.toLocaleString("en-US");
}

// ── Sidebar item (landscape / TV) ─────────────────────────────────────────
function SidebarItem({
  icon, mciIcon, label, active = false, count, isNew = false, onPress, preferFocus,
}: {
  icon?: keyof typeof Feather.glyphMap;
  mciIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  active?: boolean;
  count?: number;
  isNew?: boolean;
  onPress: () => void;
  preferFocus?: boolean;
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
        styles.sidebarItem,
        highlight && {
          backgroundColor: accent.withAlpha(accent.accent, active ? 0.16 : 0.1),
          borderColor: accent.accent,
        },
      ]}
    >
      {active ? <View style={[styles.sidebarActiveBar, { backgroundColor: accent.accent }]} /> : null}
      <View style={styles.sidebarIconWrap}>
        {mciIcon ? (
          <MaterialCommunityIcons name={mciIcon} size={20} color={tint} />
        ) : (
          <Feather name={icon ?? "circle"} size={18} color={tint} />
        )}
      </View>
      <ThemedText style={[styles.sidebarLabel, highlight && { color: accent.accent }]} numberOfLines={1}>
        {label}
      </ThemedText>
      {isNew ? (
        <View style={[styles.newBadge, { backgroundColor: accent.accent }]}>
          <ThemedText style={styles.newBadgeText}>NEW</ThemedText>
        </View>
      ) : typeof count === "number" ? (
        <View style={[styles.sidebarCount, { borderColor: accent.withAlpha(accent.accent, 0.4) }]}>
          <ThemedText style={[styles.sidebarCountText, { color: tint }]}>{formatCount(count)}</ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

// ── Quick-action card (advert row + grid) ─────────────────────────────────
function QuickActionCard({
  icon, mciIcon, title, subtitle, onPress, loading = false, preferFocus, style, compact = false,
}: {
  icon?: keyof typeof Feather.glyphMap;
  mciIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  loading?: boolean;
  preferFocus?: boolean;
  style?: any;
  compact?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const accent = useAccent();
  const isActive = focused || pressed || hovered || loading;
  const iconColor = isActive ? accent.hover : accent.accent;

  return (
    <Pressable
      hasTVPreferredFocus={preferFocus}
      onPress={loading ? undefined : onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.qaCard,
        { borderColor: accent.withAlpha(accent.accent, 0.3) },
        isActive && styles.qaCardActive,
        isActive && { borderColor: accent.accent, shadowColor: accent.accent },
        style,
      ]}
    >
      <LinearGradient
        colors={isActive ? accent.gradStrong : accent.gradSoft}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
      />
      <View style={[styles.qaIconWrap, compact && styles.qaIconWrapCompact, isActive && { backgroundColor: accent.accentDim }]}>
        {loading ? (
          <ActivityIndicator color={accent.accent} />
        ) : mciIcon ? (
          <MaterialCommunityIcons name={mciIcon} size={compact ? 22 : 24} color={iconColor} />
        ) : (
          <Feather name={icon ?? "circle"} size={compact ? 20 : 22} color={iconColor} />
        )}
      </View>
      <View style={styles.qaTextCol}>
        <ThemedText
          style={[styles.qaTitle, compact && styles.qaTitleCompact, isActive && { color: accent.accent }]}
          numberOfLines={2}
        >
          {loading ? "Loading…" : title}
        </ThemedText>
        {compact ? null : (
          <ThemedText style={styles.qaSubtitle} numberOfLines={1}>{subtitle}</ThemedText>
        )}
      </View>
    </Pressable>
  );
}

// ── Top-bar action with a caption underneath ──────────────────────────────
function LabelledAction({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <View style={styles.labelledAction}>
      {children}
      {label ? (
        <ThemedText style={styles.actionCaption} numberOfLines={1}>{label}</ThemedText>
      ) : null}
    </View>
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
      onHoverIn={() => setFocused(true)}
      onHoverOut={() => setFocused(false)}
    >
      <Feather name="search" size={18} color={isActive ? accent.accent : Colors.dark.textSecondary} />
    </Pressable>
  );
}

function ProfileDropdownRow({
  preferFocus,
  onPress,
  children,
}: {
  preferFocus?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isActive = pressed || focused || hovered;
  return (
    <Pressable
      hasTVPreferredFocus={preferFocus}
      style={[styles.profileRow, isActive && styles.profileRowActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      {children}
    </Pressable>
  );
}

function ProfileButton({ compact = false }: { compact?: boolean }) {
  const { activeProfile, setActiveProfile } = useProfile();
  const navigation = useNavigation<NavigationProp>();
  const { userInfo } = useAuth();
  const username = userInfo?.user_info?.username ?? "";

  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const isActive = pressed || focused;

  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<View>(null);
  const { width: winW } = useWindowDimensions();

  const openDropdown = useCallback(() => {
    btnRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ top: y + h + Spacing.xs, right: Math.max(Spacing.md, winW - (x + w)) });
    });
    setOpen(true);
    setLoading(true);
    const url = new URL("/api/profiles", getApiUrl());
    url.searchParams.set("username", username);
    fetch(url.toString())
      .then((res) => (res.ok ? res.json() : []))
      .then((list: Profile[]) => setProfiles(Array.isArray(list) ? list : []))
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false));
  }, [username, winW]);

  const selectProfile = useCallback(
    (profile: Profile) => {
      setOpen(false);
      if (profile.pin) {
        navigation.navigate("PinEntry", { profile, fromHome: true });
      } else {
        setActiveProfile(profile);
      }
    },
    [navigation, setActiveProfile],
  );

  const selectGuest = useCallback(async () => {
    setOpen(false);
    const prefs = await loadGuestPlayerPrefs();
    setActiveProfile(makeGuestProfile(username, prefs));
  }, [username, setActiveProfile]);

  const createProfile = useCallback(() => {
    setOpen(false);
    navigation.navigate("CreateProfile", {});
  }, [navigation]);

  if (!activeProfile) return null;

  return (
    <>
      <Pressable
        ref={btnRef}
        style={[
          styles.profileBtn,
          compact && styles.profileBtnCompact,
          isActive && styles.profileBtnActive,
          { borderColor: activeProfile.avatar_color + "66" },
        ]}
        onPress={openDropdown}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onHoverIn={() => setFocused(true)}
        onHoverOut={() => setFocused(false)}
      >
        <View style={[styles.profileBtnAvatar, { backgroundColor: activeProfile.avatar_color + "33", borderColor: activeProfile.avatar_color }]}>
          <Feather name={activeProfile.avatar_icon as any} size={14} color={activeProfile.avatar_color} />
        </View>
        {compact ? null : (
          <>
            <ThemedText style={[styles.profileBtnName, { color: activeProfile.avatar_color }]} numberOfLines={1}>
              {activeProfile.name}
            </ThemedText>
            <Feather name={open ? "chevron-up" : "chevron-down"} size={12} color={activeProfile.avatar_color + "99"} />
          </>
        )}
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        supportedOrientations={["portrait", "landscape"]}
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.profileDropdownBackdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.profileDropdown, anchor ? { top: anchor.top, right: anchor.right } : { top: 64, right: Spacing.md }]}
            onPress={(e) => e.stopPropagation()}
          >
            {loading ? (
              <View style={styles.profileDropdownLoading}>
                <ActivityIndicator color={Colors.dark.accent} />
              </View>
            ) : (
              <ScrollView style={styles.profileDropdownScroll} contentContainerStyle={styles.profileDropdownContent}>
                {profiles.map((p) => {
                  const selected = p.id === activeProfile.id;
                  return (
                    <ProfileDropdownRow key={p.id} preferFocus={selected} onPress={() => selectProfile(p)}>
                      <View style={[styles.profileRowAvatar, { backgroundColor: p.avatar_color + "33", borderColor: p.avatar_color }]}>
                        <Feather name={p.avatar_icon as any} size={16} color={p.avatar_color} />
                      </View>
                      <ThemedText style={[styles.profileRowName, { color: p.avatar_color }]} numberOfLines={1}>
                        {p.name}
                      </ThemedText>
                      {p.pin ? <Feather name="lock" size={12} color={Colors.dark.textSecondary} /> : null}
                      {selected ? <Feather name="check" size={16} color={Colors.dark.accent} /> : null}
                    </ProfileDropdownRow>
                  );
                })}

                <ProfileDropdownRow preferFocus={activeProfile.id === "guest"} onPress={selectGuest}>
                  <View style={[styles.profileRowAvatar, { backgroundColor: "#FF660033", borderColor: "#FF6600" }]}>
                    <Feather name="user" size={16} color="#FF6600" />
                  </View>
                  <ThemedText style={[styles.profileRowName, { color: Colors.dark.text }]} numberOfLines={1}>
                    Guest
                  </ThemedText>
                  {activeProfile.id === "guest" ? <Feather name="check" size={16} color={Colors.dark.accent} /> : null}
                </ProfileDropdownRow>

                <View style={styles.profileDropdownDivider} />

                <ProfileDropdownRow onPress={createProfile}>
                  <View style={[styles.profileRowAvatar, styles.profileRowAvatarAdd]}>
                    <Feather name="plus" size={16} color={Colors.dark.textSecondary} />
                  </View>
                  <ThemedText style={[styles.profileRowName, { color: Colors.dark.text }]} numberOfLines={1}>
                    Create a Profile
                  </ThemedText>
                </ProfileDropdownRow>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
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
      onHoverIn={() => setFocused(true)}
      onHoverOut={() => setFocused(false)}
      disabled={refreshing}
    >
      <Feather name="refresh-cw" size={16} color={refreshing || isActive ? accent.accent : Colors.dark.textSecondary} />
    </Pressable>
  );
}

function FootballCentreButton({ onPress }: { onPress: () => void }) {
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
      onHoverIn={() => setFocused(true)}
      onHoverOut={() => setFocused(false)}
    >
      <MaterialCommunityIcons name="soccer" size={18} color={isActive ? accent.accent : Colors.dark.textSecondary} />
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
      onHoverIn={() => setFocused(true)}
      onHoverOut={() => setFocused(false)}
    >
      <Feather name="settings" size={18} color={accent.accent} />
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
        onHoverIn={() => setFocused(true)}
        onHoverOut={() => setFocused(false)}
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

// Local copy of the AccountInfoScreen APP_VERSION lookup so the
// dashboard can do its own update check without importing that whole
// screen.
const APP_VERSION: string =
  ((Constants.expoConfig as any)?.version as string | undefined) ?? "0.0.0";

// Header button shown ONLY when /api/app-version reports a newer
// version than the one bundled in this build. Mirrors the alert from
// AccountInfoScreen's "Check for Updates" so users get the downloader
// code without having to dig into the Account screen.
function UpdateAvailableButton() {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const isActive = pressed || focused;
  const accent = useAccent();
  const apkInstaller = useApkInstaller();
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [downloaderCode, setDownloaderCode] = useState<string | null>(null);

  // Re-check the version frequently so users on long-running TV
  // sessions notice a release without restarting the app:
  //   - on mount
  //   - every 15 minutes while mounted
  //   - whenever the app returns to the foreground
  // The button stays mounted on the dashboard for the whole session,
  // so this single hook owns the polling lifecycle.
  useEffect(() => {
    let cancelled = false;

    const checkOnce = async () => {
      try {
        const url = new URL("/api/app-version", getApiUrl());
        const res = await fetch(url.toString(), { cache: "no-store" as RequestCache });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const v = typeof data?.version === "string" ? data.version : null;
        const c = typeof data?.downloader_code === "string" ? data.downloader_code : null;
        if (v && v !== APP_VERSION) {
          setRemoteVersion(v);
          setDownloaderCode(c);
        } else {
          // Clear if the server has been rolled back to match the
          // installed version (or if a previously-stale cache cleared).
          setRemoteVersion(null);
          setDownloaderCode(null);
        }
      } catch {
        // silent — header button just won't appear if the check fails
      }
    };

    checkOnce();
    const intervalId = setInterval(checkOnce, 15 * 60 * 1000);

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkOnce();
    });

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      sub.remove();
    };
  }, []);

  if (!remoteVersion) return null;

  const onPress = () => {
    const v = remoteVersion;
    if (!v) return;
    const baseMsg = `A new version (v${v}) is available.`;
    const manualBtn = {
      text: "Manual Update",
      onPress: () =>
        Alert.alert(
          "Manual Update",
          `Use downloader code ${downloaderCode ?? "N/A"} to install.\n\nIMPORTANT: Clear the cache in Downloader first so you receive the latest version and not an older cached copy.`,
        ),
    };
    if (apkInstaller.isAndroid) {
      Alert.alert(
        "Update Available",
        `${baseMsg}\n\nDownload and install it now, or use the manual downloader code.`,
        [
          { text: "Later", style: "cancel" },
          manualBtn,
          { text: "Download & Install", onPress: apkInstaller.start },
        ],
      );
    } else {
      Alert.alert(
        "Update Available",
        `${baseMsg}\n\nUse downloader code ${downloaderCode ?? "N/A"} to install.\n\nIMPORTANT: Clear the cache in Downloader first so you receive the latest version and not an older cached copy.`,
      );
    }
  };

  return (
    <>
      {apkInstaller.modal}
      <Pressable
        style={[
          styles.headerBtn,
          styles.headerBtnAlert,
          { borderColor: accent.withAlpha(accent.accent, 0.5), backgroundColor: accent.accentDim },
          isActive && { borderColor: accent.accent },
        ]}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onHoverIn={() => setFocused(true)}
        onHoverOut={() => setFocused(false)}
      >
        <Feather name="download" size={18} color={accent.accent} />
        <View style={[styles.unreadBadge, { backgroundColor: accent.accent, minWidth: 8, height: 8, paddingHorizontal: 0 }]} />
      </Pressable>
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
      onHoverIn={() => setFocused(true)}
      onHoverOut={() => setFocused(false)}
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
  const { refreshActiveProfile, isGuest, activeProfile } = useProfile();
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
      // Re-pull the active profile from the server so player engine
      // changes made externally (e.g. admin panel flipping
      // player_vod / player_live) take effect on the next navigation
      // without forcing the user to log out.
      refreshActiveProfile();
      setRecentRefreshKey((k) => k + 1);
      return () => setOnDashboard(false);
    }, [setOnDashboard, refetchHistory, refreshActiveProfile])
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
      maxItems: 12,
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
      maxItems: 12,
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
        categoryId: "recently",
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

  const watchRows = isGuest ? (
    <View style={[styles.watchCard, styles.guestPromptCard]}>
      <GuestPrompt
        variant="compact"
        icon="clock"
        title="No Watch History"
        message="Create a profile to keep your watch history and continue watching."
        onCreateProfile={() => navigation.navigate("ProfilePicker", { fromHome: true })}
      />
    </View>
  ) : (
    <RecentlyWatchedCard
      style={styles.watchCard}
      refreshKey={recentRefreshKey}
      maxItems={2}
      sections={watchSections}
      onPress={handleRecentPress}
    />
  );

  return (
    <ThemedView style={styles.container}>
      {isLandscape ? (
        // ── Landscape / TV layout: persistent sidebar + content column ───────
        <View style={styles.landscapeRoot}>
          {/* ── Sidebar ───────────────────────────────────────────────────── */}
          <View
            style={[
              styles.sidebar,
              { paddingTop: padT, paddingBottom: padB, paddingLeft: Math.max(insets.left, Spacing.sm) },
            ]}
          >
            <View style={styles.sidebarBrand}>
              <Image
                source={require("../../assets/images/icon.png")}
                style={styles.sidebarLogo}
                resizeMode="contain"
              />
              <View>
                <ThemedText style={styles.appName}>Ultra Cast</ThemedText>
                <ThemedText style={[styles.appVersion, { color: themeAccent.accent }]}>v3</ThemedText>
              </View>
            </View>

            <ScrollView
              style={styles.sidebarScroll}
              contentContainerStyle={styles.sidebarScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <SidebarItem label="Home" icon="home" active onPress={() => {}} />
              <SidebarItem
                label="Live TV"
                mciIcon="television-classic"
                onPress={() => goToContent("live", "Live TV")}
              />
              <SidebarItem
                label="Movies"
                mciIcon="movie-open-outline"
                onPress={() => goToContent("movies", "Movies")}
              />
              <SidebarItem
                label="Series"
                mciIcon="play-box-multiple-outline"
                onPress={() => goToContent("series", "Series")}
              />
              <SidebarItem label="Catch Up" icon="clock" onPress={() => goToScreen("catchup", "CatchUp")} />
              <SidebarItem label="TV Guide" icon="calendar" onPress={() => goToScreen("tvguide", "TvGuide")} />

              <View style={styles.sidebarDivider} />

              <SidebarItem label="Search" icon="search" onPress={() => navigation.navigate("Search")} />
              {/* Football Centre stays reachable regardless of the kill-switch —
                  the switch only hides the in-player GOAL tracker overlay, not the
                  dedicated Centre (whose scores keep updating server-side). */}
              <SidebarItem label="Football Centre" mciIcon="soccer" isNew onPress={() => navigation.navigate("FootballCentre")} />
              <SidebarItem label="Settings" icon="settings" onPress={() => navigation.navigate("AccountInfo")} />
            </ScrollView>
          </View>

          {/* ── Content column ────────────────────────────────────────────── */}
          <View style={[styles.contentArea, { paddingTop: padT, paddingRight: padH, paddingBottom: padB }]}>
            {/* Top bar: greeting + labelled action icons + profile dropdown */}
            <View style={styles.topBar}>
              <View style={styles.greetingWrap}>
                <ThemedText style={styles.greetingHello}>Welcome back,</ThemedText>
                <ThemedText style={[styles.greetingName, { color: themeAccent.accent }]} numberOfLines={1}>
                  {activeProfile?.name ?? "Guest"}
                </ThemedText>
              </View>

              <View style={styles.topBarActions}>
                <LabelledAction label="Search">
                  <SearchHeaderButton onPress={() => navigation.navigate("Search")} />
                </LabelledAction>
                <LabelledAction label="Refresh">
                  <RefreshButton onPress={handleRefresh} refreshing={refreshing} />
                </LabelledAction>
                <LabelledAction label="Football">
                  <FootballCentreButton onPress={() => navigation.navigate("FootballCentre")} />
                </LabelledAction>
                <LabelledAction label="VPN">
                  <VpnButton />
                </LabelledAction>
                {/* Conditional update alert — renders nothing unless a newer
                    build exists, so it carries no caption. */}
                <UpdateAvailableButton />
                <LabelledAction label="Alerts">
                  <MessagesButton onPress={() => navigation.navigate("Messages")} />
                </LabelledAction>
                <LabelledAction label="Settings">
                  <AccountButton onPress={() => navigation.navigate("AccountInfo")} />
                </LabelledAction>
                <ProfileButton />
              </View>
            </View>

            <View style={styles.topDivider} />
            <ExpiryBanner status={expiryStatus} onPress={handleRenewalReopen} />
            <AnnouncementTicker />

            <ScrollView
              style={styles.contentScroll}
              contentContainerStyle={styles.contentBody}
              showsVerticalScrollIndicator={false}
            >
              {/* Advert banner — grows to fill remaining height; pushes the
                  quick actions + watch rows down to the bottom on large screens
                  and shrinks (to minHeight) on smaller ones. contentContainer
                  flexGrow:1 lets short landscape viewports scroll instead of
                  clipping. */}
              <View style={styles.advertBannerLandscape}>
                <AdvertCarousel orientation="landscape" style={StyleSheet.absoluteFill} />
              </View>

              {/* Quick-action cards */}
              <View style={styles.quickRow}>
                <QuickActionCard
                  title="Live TV"
                  subtitle={`${formatCount(liveStreams.length)} Channels`}
                  mciIcon="television-classic"
                  onPress={() => goToContent("live", "Live TV")}
                  loading={navigatingTo === "live"}
                  preferFocus
                />
                <QuickActionCard
                  title="Movies"
                  subtitle={`${formatCount(vodStreams.length)} Movies`}
                  mciIcon="movie-open-outline"
                  onPress={() => goToContent("movies", "Movies")}
                  loading={navigatingTo === "movies"}
                />
                <QuickActionCard
                  title="Series"
                  subtitle={`${formatCount(seriesList.length)} Series`}
                  mciIcon="play-box-multiple-outline"
                  onPress={() => goToContent("series", "Series")}
                  loading={navigatingTo === "series"}
                />
                <QuickActionCard
                  title="Catch Up"
                  subtitle="Never miss a show"
                  icon="clock"
                  onPress={() => goToScreen("catchup", "CatchUp")}
                  loading={navigatingTo === "catchup"}
                />
                <QuickActionCard
                  title="TV Guide"
                  subtitle="What's on now"
                  icon="calendar"
                  onPress={() => goToScreen("tvguide", "TvGuide")}
                  loading={navigatingTo === "tvguide"}
                />
              </View>

              {/* Continue Watching + Recently Watched — pinned to the bottom */}
              {watchRows}
            </ScrollView>
          </View>
        </View>
      ) : (
        // ── Portrait / Mobile layout: compact top bar + grid + bottom nav ────
        <View style={styles.portraitRoot}>
          <View style={[styles.portraitTopBar, { paddingTop: padT, paddingHorizontal: padH }]}>
            <View style={styles.headerBrand}>
              <Image
                source={require("../../assets/images/icon.png")}
                style={styles.headerLogo}
                resizeMode="contain"
              />
            </View>
            <View style={styles.portraitActions}>
              <SearchHeaderButton onPress={() => navigation.navigate("Search")} />
              <RefreshButton onPress={handleRefresh} refreshing={refreshing} />
              <FootballCentreButton onPress={() => navigation.navigate("FootballCentre")} />
              <VpnButton />
              <UpdateAvailableButton />
              <MessagesButton onPress={() => navigation.navigate("Messages")} />
              <ProfileButton compact />
            </View>
          </View>

          <View style={[styles.portraitDivider, { marginHorizontal: padH }]} />
          <ExpiryBanner status={expiryStatus} onPress={handleRenewalReopen} />
          <AnnouncementTicker />

          <ScrollView
            style={styles.portraitScroll}
            contentContainerStyle={[styles.portraitScrollInner, { paddingHorizontal: padH, paddingBottom: padB }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.advertBannerPortrait}>
              <AdvertCarousel orientation="portrait" style={StyleSheet.absoluteFill} />
            </View>

            <View style={styles.gridWrap}>
              <QuickActionCard
                compact
                style={styles.gridCard}
                title="Live TV"
                subtitle={`${formatCount(liveStreams.length)} Channels`}
                mciIcon="television-classic"
                onPress={() => goToContent("live", "Live TV")}
                loading={navigatingTo === "live"}
              />
              <QuickActionCard
                compact
                style={styles.gridCard}
                title="Movies"
                subtitle={`${formatCount(vodStreams.length)} Movies`}
                mciIcon="movie-open-outline"
                onPress={() => goToContent("movies", "Movies")}
                loading={navigatingTo === "movies"}
              />
              <QuickActionCard
                compact
                style={styles.gridCard}
                title="Series"
                subtitle={`${formatCount(seriesList.length)} Series`}
                mciIcon="play-box-multiple-outline"
                onPress={() => goToContent("series", "Series")}
                loading={navigatingTo === "series"}
              />
              <QuickActionCard
                compact
                style={styles.gridCard}
                title="Catch Up"
                subtitle="Never miss a show"
                icon="clock"
                onPress={() => goToScreen("catchup", "CatchUp")}
                loading={navigatingTo === "catchup"}
              />
              <QuickActionCard
                compact
                style={styles.gridCard}
                title="TV Guide"
                subtitle="What's on now"
                icon="calendar"
                onPress={() => goToScreen("tvguide", "TvGuide")}
                loading={navigatingTo === "tvguide"}
              />
              <QuickActionCard
                compact
                style={styles.gridCard}
                title="Football Centre"
                subtitle="Live Matches & More"
                mciIcon="soccer"
                onPress={() => navigation.navigate("FootballCentre")}
              />
            </View>

            {watchRows}
          </ScrollView>
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
  const [hovered, setHovered] = useState(false);
  const isActive = focused || pressed || hovered;
  const isPrimary = variant === "primary";
  return (
    <Pressable
      hasTVPreferredFocus={autoFocus}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
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

  // ── Brand ───────────────────────────────────────────────────────────────
  headerBrand: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  headerLogo: { width: 36, height: 36 },
  appName: { fontSize: 18, fontWeight: "700", color: Colors.dark.text, letterSpacing: 0.5 },
  appVersion: { fontSize: 11, color: Colors.dark.accent, fontWeight: "600", letterSpacing: 1 },
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
  profileBtnCompact: { paddingHorizontal: Spacing.xs, paddingVertical: Spacing.xs },
  profileBtnActive: { backgroundColor: Colors.dark.backgroundSecondary },
  profileBtnAvatar: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1, justifyContent: "center", alignItems: "center",
  },
  profileBtnName: { fontSize: 12, fontWeight: "600", flex: 1 },
  profileDropdownBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  profileDropdown: {
    position: "absolute",
    width: 240,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingVertical: Spacing.xs,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  profileDropdownLoading: { paddingVertical: Spacing.lg, alignItems: "center" },
  profileDropdownScroll: { maxHeight: 320 },
  profileDropdownContent: { paddingHorizontal: Spacing.xs },
  profileDropdownDivider: { height: 1, backgroundColor: Colors.dark.border, marginVertical: Spacing.xs, marginHorizontal: Spacing.xs },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  profileRowActive: { backgroundColor: Colors.dark.backgroundDefault, borderColor: Colors.dark.accent + "66" },
  profileRowAvatar: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1, justifyContent: "center", alignItems: "center",
  },
  profileRowAvatarAdd: { backgroundColor: Colors.dark.backgroundDefault, borderColor: Colors.dark.border },
  profileRowName: { fontSize: 14, fontWeight: "600", flex: 1 },
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

  // ── Landscape: sidebar + content column ───────────────────────────────────
  landscapeRoot: { flex: 1, flexDirection: "row" },

  sidebar: {
    width: 200,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRightWidth: 1,
    borderRightColor: Colors.dark.border,
    paddingHorizontal: Spacing.sm,
  },
  sidebarBrand: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    paddingHorizontal: Spacing.sm, paddingBottom: Spacing.md,
  },
  sidebarLogo: { width: 34, height: 34 },
  sidebarScroll: { flex: 1 },
  sidebarScrollContent: { gap: Spacing.xs, paddingBottom: Spacing.lg },
  sidebarItem: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: "transparent",
    overflow: "hidden",
  },
  sidebarActiveBar: { position: "absolute", left: 0, top: 6, bottom: 6, width: 3, borderRadius: 2 },
  sidebarIconWrap: { width: 24, alignItems: "center" },
  sidebarLabel: { flex: 1, fontSize: 13, fontWeight: "600", color: Colors.dark.text },
  sidebarCount: {
    paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: BorderRadius.full, borderWidth: 1,
  },
  sidebarCountText: { fontSize: 10, fontWeight: "700" },
  sidebarDivider: {
    height: 1, backgroundColor: Colors.dark.border,
    marginVertical: Spacing.sm, marginHorizontal: Spacing.sm,
  },
  newBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: BorderRadius.xs },
  newBadgeText: { fontSize: 8, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },

  contentArea: { flex: 1, paddingLeft: Spacing.lg },
  topBar: {
    flexDirection: "row", alignItems: "flex-start",
    justifyContent: "space-between", paddingBottom: Spacing.md,
  },
  greetingWrap: { justifyContent: "center", flexShrink: 1, paddingTop: Spacing.xs },
  greetingHello: { fontSize: 13, color: Colors.dark.textSecondary, fontWeight: "500" },
  greetingName: { fontSize: 22, fontWeight: "800", letterSpacing: 0.3 },
  topBarActions: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.md },
  labelledAction: { alignItems: "center", gap: 4 },
  actionCaption: {
    fontSize: 9, fontWeight: "600", color: Colors.dark.textSecondary,
    letterSpacing: 0.4, textTransform: "uppercase",
  },
  topDivider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.xs },

  contentScroll: { flex: 1 },
  contentBody: { flexGrow: 1, gap: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.lg },

  advertBannerLandscape: {
    width: "100%",
    flex: 1,
    minHeight: 130,
    borderRadius: BorderRadius.md, overflow: "hidden",
  },
  advertBannerPortrait: {
    width: "100%", aspectRatio: 16 / 9,
    borderRadius: BorderRadius.md, overflow: "hidden",
  },

  quickRow: { flexDirection: "row", gap: Spacing.sm },

  // ── Quick-action card ─────────────────────────────────────────────────────
  qaCard: {
    flex: 1,
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(20,12,6,0.85)",
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: "rgba(255,102,0,0.3)",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    gap: Spacing.xs,
    overflow: "hidden",
  },
  qaCardActive: {
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1, shadowRadius: 16, elevation: 12,
  },
  qaIconWrap: {
    width: 36, height: 36, borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,102,0,0.1)",
    justifyContent: "center", alignItems: "center",
    flexShrink: 0,
  },
  qaIconWrapCompact: { width: 32, height: 32 },
  qaTextCol: { flex: 1, minWidth: 0, gap: 1 },
  qaTitle: { fontSize: 13, fontWeight: "800", color: "#fff", letterSpacing: 0.2, lineHeight: 16 },
  qaTitleCompact: { fontSize: 12, lineHeight: 15 },
  qaSubtitle: { fontSize: 10, fontWeight: "500", color: Colors.dark.textSecondary },

  // ── Portrait ──────────────────────────────────────────────────────────────
  portraitRoot: { flex: 1 },
  portraitTopBar: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", paddingBottom: Spacing.sm,
  },
  portraitActions: { flexDirection: "row", gap: Spacing.sm, alignItems: "center" },
  portraitDivider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.xs },
  portraitScroll: { flex: 1 },
  portraitScrollInner: { gap: Spacing.md, paddingTop: Spacing.sm },
  gridWrap: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: Spacing.sm },
  // flexGrow/Shrink 0 + flexBasis override the qaCard `flex:1` (which sets
  // flexBasis:0 and would otherwise squash all 6 cards onto a single row).
  // 48.5% basis = 2 cards per row, so 6 cards form a 3-row x 2-col grid.
  gridCard: { flexGrow: 0, flexShrink: 0, flexBasis: "48.5%", width: "48.5%" },

  // Continue Watching / Recently Watched container
  watchCard: { width: "100%" },
  guestPromptCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
    justifyContent: "center",
  },
});
