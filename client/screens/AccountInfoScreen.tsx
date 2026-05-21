import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  ScrollView,
  Alert,
  BackHandler,
  Platform,
  Modal,
} from "react-native";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { markReplayIntroOnResume } from "@/lib/intro-flag";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/contexts/ProfileContext";
import { useUISettings } from "@/contexts/UISettingsContext";
import { LinearGradient } from "expo-linear-gradient";
import { getApiUrl } from "@/lib/query-client";
import { useExpiryStatus } from "@/hooks/useExpiryStatus";
import { useApkInstaller, clearDownloadedUpdates } from "@/hooks/useApkInstaller";

// Shown when /api/app-version reports a newer version. Always offers a
// "Manual Update" path (downloader code, unchanged from previous releases)
// and — on Android only — a one-tap "Download & Install" path that pulls
// the APK and hands it to the OS package installer.
function showUpdateAvailableAlert(
  remoteVersion: string,
  code: string | null,
  installer: { isAndroid: boolean; start: () => void },
) {
  const baseMsg = `A new version (v${remoteVersion}) is available.`;
  const manualBtn = {
    text: "Manual Update",
    onPress: () =>
      Alert.alert(
        "Manual Update",
        `Use downloader code ${code ?? "N/A"} to install.\n\nIMPORTANT: Clear the cache in Downloader first so you receive the latest version and not an older cached copy.`,
      ),
  };
  if (installer.isAndroid) {
    Alert.alert(
      "Update Available",
      `${baseMsg}\n\nDownload and install it now, or use the manual downloader code.`,
      [
        { text: "Later", style: "cancel" },
        manualBtn,
        { text: "Download & Install", onPress: installer.start },
      ],
    );
  } else {
    Alert.alert(
      "Update Available",
      `${baseMsg}\n\nUse downloader code ${code ?? "N/A"} to install.\n\nIMPORTANT: Clear the cache in Downloader first so you receive the latest version and not an older cached copy.`,
    );
  }
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const APP_VERSION: string =
  (Constants?.expoConfig?.version as string | undefined) ?? "1.0.0";

function HoverBtn({
  style,
  activeStyle,
  onPress,
  disabled,
  children,
}: {
  style: any;
  activeStyle: any;
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode | ((isActive: boolean) => React.ReactNode);
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[style, isActive && activeStyle]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
    >
      {typeof children === "function" ? children(isActive) : children}
    </Pressable>
  );
}

// Section heading used between groups of tiles on the Account screen.
// Subtle uppercase label flanked by a thin divider line on each side —
// gives the page clear visual rhythm without shouting.
function SectionHeading({ label }: { label: string }) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionHeadingLine} />
      <ThemedText style={styles.sectionHeadingText}>{label}</ThemedText>
      <View style={styles.sectionHeadingLine} />
    </View>
  );
}

// Compact uniform tile used across the settings / updates / support
// grids. Icon-left, two-line label, chevron-right. Always renders the
// same way so every grid row has the same visual weight, which is what
// the old screen was missing in portrait. Supports a busy/disabled
// state and an optional tint override (e.g. red for destructive).
function ActionTile({
  icon,
  title,
  subtitle,
  onPress,
  tint,
  busy,
  disabled,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  tint?: string;
  busy?: boolean;
  disabled?: boolean;
}) {
  const accent = tint ?? Colors.dark.accent;
  return (
    <HoverBtn
      style={styles.actionTile}
      activeStyle={[styles.actionTileActive, { borderColor: accent, backgroundColor: accent + "1A" }]}
      onPress={onPress}
      disabled={disabled || busy}
    >
      {(active) => (
        <>
          <View
            style={[
              styles.actionTileIcon,
              { borderColor: accent + (active ? "" : "55"), backgroundColor: accent + (active ? "26" : "14") },
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={accent} />
            ) : (
              <Feather name={icon} size={16} color={accent} />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <ThemedText
              style={[styles.actionTileTitle, active && { color: accent }]}
              numberOfLines={1}
            >
              {title}
            </ThemedText>
            {subtitle ? (
              <ThemedText style={styles.actionTileSub} numberOfLines={1}>
                {subtitle}
              </ThemedText>
            ) : null}
          </View>
          <Feather
            name="chevron-right"
            size={15}
            color={active ? accent : Colors.dark.textSecondary}
          />
        </>
      )}
    </HoverBtn>
  );
}

interface AppNote {
  id: string;
  type: "change" | "issue" | string;
  text: string;
  sort_order?: number;
  created_at?: string;
  version_id?: string | null;
}

interface AppVersionRow {
  id: string;
  version: string;
  released_at?: string | null;
  created_at?: string | null;
  downloader_code?: string | null;
}

type NotesTab = "whatsnew" | "issues";

interface DeveloperDetails {
  developer_name?: string;
  developer_contact?: string;
  website_link?: string;
  renewal_link?: string;
}

function InfoRow({
  label,
  value,
  icon,
  valueColor,
  iconColor,
}: {
  label: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
  valueColor?: string;
  iconColor?: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Feather name={icon} size={14} color={iconColor ?? Colors.dark.accent} />
      <View style={styles.infoContent}>
        <ThemedText style={styles.infoLabel}>{label}</ThemedText>
        <ThemedText
          style={[
            styles.infoValue,
            valueColor ? { color: valueColor, fontWeight: "700" } : null,
          ]}
          numberOfLines={1}
        >
          {value}
        </ThemedText>
      </View>
    </View>
  );
}

function CopyRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
}) {
  const [copied, setCopied] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const isActive = pressed || focused;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.infoRow}>
      <Feather name={icon} size={14} color={Colors.dark.accent} />
      <View style={styles.infoContent}>
        <ThemedText style={styles.infoLabel}>{label}</ThemedText>
        <ThemedText style={styles.infoValue} numberOfLines={1} selectable={false}>
          {value}
        </ThemedText>
      </View>
      <Pressable
        style={[styles.copyBtn, isActive && styles.copyBtnActive, copied && styles.copyBtnCopied]}
        onPress={handleCopy}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        hitSlop={8}
      >
        <Feather
          name={copied ? "check" : "copy"}
          size={13}
          color={
            copied ? Colors.dark.success : isActive ? Colors.dark.accent : Colors.dark.textSecondary
          }
        />
      </Pressable>
    </View>
  );
}

export default function AccountInfoScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { userInfo, logout, refreshUserInfo, isLoading } = useAuth();
  const { activeProfile, clearProfile } = useProfile();
  const { textSize, toggleTextSize } = useUISettings();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [devDetails, setDevDetails] = useState<DeveloperDetails | null>(null);
  const [devLoading, setDevLoading] = useState(true);
  const [updateChecking, setUpdateChecking] = useState(false);
  const apkInstaller = useApkInstaller();
  const expiryStatus = useExpiryStatus();
  const isLifetime = expiryStatus.isLifetime;
  const [notesVisible, setNotesVisible] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notes, setNotes] = useState<AppNote[]>([]);
  const [versions, setVersions] = useState<AppVersionRow[]>([]);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notesTab, setNotesTab] = useState<NotesTab>("whatsnew");
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [supportVisible, setSupportVisible] = useState(false);

  const handleOpenNotes = async () => {
    setNotesVisible(true);
    setNotesLoading(true);
    setNotesError(null);
    setNotesTab("whatsnew");
    try {
      const base = getApiUrl();
      const [notesRes, versionsRes] = await Promise.all([
        fetch(new URL("/api/app-notes", base).toString()),
        fetch(new URL("/api/app-versions", base).toString()),
      ]);
      if (!notesRes.ok || !versionsRes.ok) throw new Error("Failed");
      const notesData = (await notesRes.json()) as AppNote[];
      const versionsData = (await versionsRes.json()) as AppVersionRow[];
      const safeNotes = Array.isArray(notesData) ? notesData : [];
      const safeVersions = Array.isArray(versionsData) ? versionsData : [];
      setNotes(safeNotes);
      setVersions(safeVersions);
      // Default the accordion to the latest version that actually has change-notes.
      const knownIds = new Set(safeVersions.map((v) => v.id));
      const changeIds = new Set(
        safeNotes
          .filter((n) => (n.type ?? "").toLowerCase() === "change" && n.version_id && knownIds.has(n.version_id))
          .map((n) => n.version_id as string),
      );
      const firstWithNotes = safeVersions.find((v) => changeIds.has(v.id));
      setExpandedVersion(firstWithNotes?.id ?? "__orphan__");
    } catch {
      setNotesError("Could not load app notes. Try again later.");
      setNotes([]);
      setVersions([]);
    } finally {
      setNotesLoading(false);
    }
  };

  const [clearingCache, setClearingCache] = useState(false);
  const handleClearDownloads = async () => {
    if (clearingCache) return;
    Alert.alert(
      "Clear Cached Files",
      "This will delete cached update files saved on your device to free up storage. Your login, profiles and favourites will not be affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            setClearingCache(true);
            try {
              const { removed, bytesFreed } = await clearDownloadedUpdates();
              const mb = (bytesFreed / (1024 * 1024)).toFixed(1);
              if (removed === 0) {
                Alert.alert("Already Clean", "No cached files were found.");
              } else {
                Alert.alert(
                  "Done",
                  `Removed ${removed} cached file${removed === 1 ? "" : "s"} (${mb} MB freed).`,
                );
              }
            } catch {
              Alert.alert("Clear Cached Files", "Something went wrong. Please try again.");
            } finally {
              setClearingCache(false);
            }
          },
        },
      ],
    );
  };

  const handleCheckForUpdates = async () => {
    if (updateChecking) return;
    setUpdateChecking(true);
    try {
      const url = new URL("/api/app-version", getApiUrl());
      const res = await fetch(url.toString());
      const data = res.ok ? await res.json() : null;
      const remoteVersion = data?.version as string | undefined;
      const code = data?.downloader_code as string | undefined;
      if (!remoteVersion) {
        Alert.alert("Update Check", "Could not reach the update server. Try again later.");
      } else if (remoteVersion === APP_VERSION) {
        Alert.alert("You're Up to Date", `You're running the latest version (v${APP_VERSION}).`);
      } else {
        showUpdateAvailableAlert(remoteVersion, code ?? null, apkInstaller);
      }
    } catch {
      Alert.alert("Update Check", "Could not reach the update server. Try again later.");
    } finally {
      setUpdateChecking(false);
    }
  };
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  useEffect(() => {
    handleRefresh();
    fetchDevDetails();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refreshUserInfo(), fetchDevDetails()]);
    setIsRefreshing(false);
  };

  const fetchDevDetails = async () => {
    setDevLoading(true);
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/developer-details", baseUrl);
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setDevDetails(data);
      }
    } catch {
      // silently fail — developer details are optional
    } finally {
      setDevLoading(false);
    }
  };

  const formatDate = (ts: string) => {
    if (!ts || ts === "0") return "N/A";
    return new Date(parseInt(ts) * 1000).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  };

  const statusColor = (s: string) =>
    s?.toLowerCase() === "active" ? Colors.dark.success
    : s?.toLowerCase() === "expired" ? Colors.dark.error
    : Colors.dark.textSecondary;

  const padH = Math.max(insets.left + Spacing.sm, Spacing.lg);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.md);
  const user = userInfo?.user_info;

  const hasSupport = !!(
    devDetails &&
    (devDetails.developer_name ||
      devDetails.developer_contact ||
      devDetails.website_link ||
      devDetails.renewal_link)
  );

  return (
    <ThemedView style={styles.container}>
      {apkInstaller.modal}
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <HoverBtn style={styles.iconBtn} activeStyle={styles.iconBtnActive} onPress={() => navigation.goBack()}>
          {(active) => <Feather name="arrow-left" size={20} color={active ? Colors.dark.accent : Colors.dark.text} />}
        </HoverBtn>
        <ThemedText style={styles.headerTitle}>Account</ThemedText>
        <HoverBtn style={styles.iconBtn} activeStyle={styles.iconBtnActive} onPress={handleRefresh} disabled={isRefreshing}>
          {isRefreshing
            ? <ActivityIndicator size="small" color={Colors.dark.accent} />
            : <Feather name="refresh-cw" size={16} color={Colors.dark.textSecondary} />}
        </HoverBtn>
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
        </View>
      ) : user ? (
        (() => {
          // ── Reusable section blocks ──────────────────────────────────
          // Defined once and slotted into the portrait single column or
          // the landscape two-column layout below.

          const userHero = (
            <View style={styles.userCard}>
              <LinearGradient
                colors={["rgba(255,102,0,0.14)", "rgba(255,102,0,0.02)"]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <View style={styles.avatarRing}>
                <View style={styles.avatar}>
                  <Feather name="user" size={26} color={Colors.dark.accent} />
                </View>
              </View>
              <ThemedText style={styles.username} numberOfLines={1}>{user.username}</ThemedText>
              <View style={styles.statusBadge}>
                <View style={[styles.statusDot, { backgroundColor: statusColor(user.status) }]} />
                <ThemedText style={[styles.statusText, { color: statusColor(user.status) }]}>
                  {user.status || "Unknown"}
                </ThemedText>
              </View>
              {activeProfile ? (
                <View style={[styles.profilePill, { borderColor: activeProfile.avatar_color + "66" }]}>
                  <View style={[styles.profilePillAvatar, { backgroundColor: activeProfile.avatar_color + "33", borderColor: activeProfile.avatar_color }]}>
                    <Feather name={activeProfile.avatar_icon as any} size={14} color={activeProfile.avatar_color} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ThemedText style={styles.profilePillLabel}>Active Profile</ThemedText>
                    <ThemedText style={[styles.profilePillName, { color: activeProfile.avatar_color }]} numberOfLines={1}>
                      {activeProfile.name}
                    </ThemedText>
                  </View>
                </View>
              ) : null}
            </View>
          );

          const subscriptionCard = (
            <View style={styles.infoCard}>
              <View style={styles.cardLabelRow}>
                <Feather name="credit-card" size={12} color={Colors.dark.accent} />
                <ThemedText style={styles.cardLabel}>Subscription</ThemedText>
              </View>
              {isLifetime ? (
                <View style={styles.lifetimeBadge}>
                  <Feather name="star" size={14} color={Colors.dark.accent} />
                  <ThemedText style={styles.lifetimeText}>Lifetime Access</ThemedText>
                </View>
              ) : (
                (() => {
                  const warn =
                    !expiryStatus.loading &&
                    (expiryStatus.isExpired || expiryStatus.isExpiringSoon);
                  const color = warn ? Colors.dark.error : undefined;
                  return (
                    <InfoRow
                      label="Expires"
                      value={formatDate(user.exp_date)}
                      icon="calendar"
                      valueColor={color}
                      iconColor={color}
                    />
                  );
                })()
              )}
              <InfoRow label="Connections" value={`${user.active_cons || 0} / ${user.max_connections || "N/A"}`} icon="users" />
              <InfoRow label="Trial" value={user.is_trial === "1" ? "Yes" : "No"} icon="flag" />
            </View>
          );

          const profileSection = activeProfile ? (
            <View style={{ gap: Spacing.sm }}>
              <SectionHeading label="Profile" />
              <View style={styles.tileGrid}>
                <View style={styles.tileGridItem}>
                  <ActionTile
                    icon="edit-2"
                    title="Edit Profile"
                    subtitle="Name, icon, colour"
                    onPress={() => navigation.navigate("CreateProfile", { profile: activeProfile })}
                  />
                </View>
                <View style={styles.tileGridItem}>
                  <ActionTile
                    icon="users"
                    title="Switch Profile"
                    subtitle="Change active profile"
                    onPress={() => navigation.navigate("ProfilePicker", { fromHome: true })}
                  />
                </View>
              </View>
            </View>
          ) : null;

          const settingsSection = (
            <View style={{ gap: Spacing.sm }}>
              <SectionHeading label="Settings" />
              <View style={styles.tileGrid}>
                <View style={styles.tileGridItem}>
                  <ActionTile
                    icon="sliders"
                    title="Organise Categories"
                    subtitle="Reorder or hide"
                    onPress={() => navigation.navigate("OrganiseTypePicker")}
                  />
                </View>
                <View style={styles.tileGridItem}>
                  <ActionTile
                    icon="play-circle"
                    title="Player Settings"
                    subtitle="VLC or Expo"
                    onPress={() => navigation.navigate("PlayerSettings")}
                  />
                </View>
                <View style={styles.tileGridItem}>
                  <ActionTile
                    icon="activity"
                    title="Speed Test"
                    subtitle="Ping & download"
                    onPress={() => navigation.navigate("SpeedTest")}
                  />
                </View>
                <View style={styles.tileGridItem}>
                  <ActionTile
                    icon="type"
                    title={`Text Size: ${textSize === "large" ? "Large" : "Normal"}`}
                    subtitle="Tap to toggle"
                    onPress={() => { void toggleTextSize(); }}
                  />
                </View>
              </View>
            </View>
          );

          // Hero update card — the centrepiece of the App section.
          // Big version readout + full-width primary CTA so the version
          // and update button never get lost among the other tiles.
          const updateHero = (
            <View style={styles.updateHero}>
              <LinearGradient
                colors={["rgba(255,102,0,0.22)", "rgba(255,102,0,0.04)"]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                pointerEvents="none"
              />
              <View style={styles.updateHeroTopRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <ThemedText style={styles.updateHeroEyebrow}>ULTRA CAST</ThemedText>
                  <View style={styles.updateHeroVersionRow}>
                    <ThemedText style={styles.updateHeroVersion}>v{APP_VERSION}</ThemedText>
                    <View style={styles.updateHeroInstalledBadge}>
                      <View style={styles.updateHeroInstalledDot} />
                      <ThemedText style={styles.updateHeroInstalledText}>Installed</ThemedText>
                    </View>
                  </View>
                </View>
                <View style={styles.updateHeroIconRing}>
                  <Feather name="package" size={22} color={Colors.dark.accent} />
                </View>
              </View>
              <HoverBtn
                style={styles.updateCta}
                activeStyle={styles.updateCtaActive}
                onPress={handleCheckForUpdates}
                disabled={updateChecking}
              >
                {(active) => (
                  <>
                    {updateChecking ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Feather name="download-cloud" size={16} color="#fff" />
                    )}
                    <ThemedText style={styles.updateCtaText}>
                      {updateChecking ? "Checking..." : "Check for Updates"}
                    </ThemedText>
                    <Feather
                      name="chevron-right"
                      size={16}
                      color={active ? "#fff" : "rgba(255,255,255,0.7)"}
                    />
                  </>
                )}
              </HoverBtn>
            </View>
          );

          const appSection = (
            <View style={{ gap: Spacing.sm, flexShrink: 1 }}>
              <SectionHeading label="App" />
              {updateHero}
              <View style={{ gap: Spacing.xs }}>
                <ActionTile
                  icon="file-text"
                  title="What's New"
                  subtitle="Changelog & issues"
                  onPress={handleOpenNotes}
                />
                <ActionTile
                  icon="trash-2"
                  title={clearingCache ? "Clearing..." : "Clear Cached Files"}
                  subtitle="Free up storage"
                  onPress={handleClearDownloads}
                  busy={clearingCache}
                />
                <ActionTile
                  icon="life-buoy"
                  title="Support"
                  subtitle={
                    devLoading
                      ? "Loading..."
                      : hasSupport
                      ? "Contact & links"
                      : "Not available"
                  }
                  onPress={() => setSupportVisible(true)}
                  busy={devLoading}
                  disabled={!devLoading && !hasSupport}
                />
              </View>
            </View>
          );

          const sessionSection = (
            <View style={{ gap: Spacing.sm }}>
              <SectionHeading label="Session" />
              <HoverBtn
                style={styles.logoutBtn}
                activeStyle={styles.logoutBtnPressed}
                onPress={async () => { clearProfile(); await logout(); }}
              >
                <Feather name="log-out" size={16} color={Colors.dark.error} />
                <ThemedText style={styles.logoutText}>Sign Out</ThemedText>
              </HoverBtn>
              <HoverBtn
                style={styles.exitAppBtn}
                activeStyle={styles.exitAppBtnActive}
                onPress={() => {
                  Alert.alert(
                    "Exit Ultra Cast?",
                    "Are you sure you want to close the app?",
                    [
                      { text: "No", style: "cancel" },
                      {
                        text: "Yes, Exit",
                        style: "destructive",
                        onPress: async () => {
                          try { await markReplayIntroOnResume(); } catch {}
                          if (Platform.OS === "android") {
                            try { BackHandler.exitApp(); } catch {}
                          }
                        },
                      },
                    ],
                  );
                }}
              >
                <Feather name="power" size={13} color={Colors.dark.error} />
                <ThemedText style={styles.exitAppBtnText}>Exit App</ThemedText>
              </HoverBtn>
            </View>
          );

          if (isLandscape) {
            // Landscape / TV — fixed 3-column layout that fits in the
            // viewport without scrolling. Left = identity + session,
            // middle = Profile + Settings, right = App panel with the
            // prominent version hero + Check for Updates CTA.
            return (
              <View
                style={[
                  styles.landscapeBody,
                  { paddingHorizontal: padH, paddingBottom: padB },
                ]}
              >
                <View style={styles.leftColLandscape}>
                  {userHero}
                  {subscriptionCard}
                  {sessionSection}
                </View>
                <View style={styles.midColLandscape}>
                  {profileSection}
                  {settingsSection}
                </View>
                <View style={styles.rightColLandscape}>{appSection}</View>
              </View>
            );
          }

          return (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={[
                styles.body,
                { paddingHorizontal: padH, paddingBottom: padB },
              ]}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.portraitCol}>
                {userHero}
                {subscriptionCard}
                {profileSection}
                {settingsSection}
                {appSection}
                {sessionSection}
              </View>
            </ScrollView>
          );
        })()
      ) : (
        <View style={styles.centered}>
          <Feather name="alert-circle" size={40} color={Colors.dark.error} />
          <ThemedText style={styles.errorText}>Failed to load account info</ThemedText>
          <HoverBtn
            style={styles.retryBtn}
            activeStyle={styles.retryBtnActive}
            onPress={handleRefresh}
          >
            <ThemedText style={styles.retryBtnText}>Retry</ThemedText>
          </HoverBtn>
        </View>
      )}

      {/* Support modal — contact details + helpful links */}
      <Modal
        visible={supportVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSupportVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSupportVisible(false)}>
          <Pressable style={styles.supportModal} onPress={(e) => e.stopPropagation()}>
            <LinearGradient
              colors={["rgba(255,102,0,0.12)", "rgba(255,102,0,0.02)"]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              pointerEvents="none"
            />
            <View style={styles.notesHeader}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.notesEyebrow}>ULTRA CAST</ThemedText>
                <ThemedText style={styles.notesTitle}>Support</ThemedText>
                <ThemedText style={styles.notesSub}>Contact &amp; helpful links</ThemedText>
              </View>
              <HoverBtn
                style={styles.notesCloseBtn}
                activeStyle={styles.notesCloseBtnActive}
                onPress={() => setSupportVisible(false)}
              >
                {(active) => (
                  <Feather name="x" size={18} color={active ? Colors.dark.accent : Colors.dark.text} />
                )}
              </HoverBtn>
            </View>
            <View style={styles.notesDivider} />
            <ScrollView
              style={styles.notesScroll}
              contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.sm }}
              showsVerticalScrollIndicator
              indicatorStyle="white"
            >
              {devLoading ? (
                <View style={styles.notesCentered}>
                  <ActivityIndicator size="large" color={Colors.dark.accent} />
                </View>
              ) : hasSupport && devDetails ? (
                <>
                  {devDetails.developer_name ? (
                    <InfoRow label="Name" value={devDetails.developer_name} icon="user" />
                  ) : null}
                  {devDetails.developer_contact ? (
                    <InfoRow label="Contact" value={devDetails.developer_contact} icon="message-circle" />
                  ) : null}
                  {devDetails.website_link ? (
                    <CopyRow label="Website" value={devDetails.website_link} icon="globe" />
                  ) : null}
                  {devDetails.renewal_link ? (
                    <CopyRow label="Renewal" value={devDetails.renewal_link} icon="refresh-cw" />
                  ) : null}
                  <ThemedText style={styles.supportFootnote}>
                    Tap the copy icon to copy a link to your clipboard.
                  </ThemedText>
                </>
              ) : (
                <View style={styles.notesCentered}>
                  <Feather name="inbox" size={28} color={Colors.dark.border} />
                  <ThemedText style={styles.notesEmpty}>No support details available.</ThemedText>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* App Notes modal — changelog + known issues */}
      <Modal
        visible={notesVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNotesVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setNotesVisible(false)}>
          <Pressable style={styles.notesModal} onPress={(e) => e.stopPropagation()}>
            <LinearGradient
              colors={["rgba(255,102,0,0.12)", "rgba(255,102,0,0.02)"]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              pointerEvents="none"
            />
            <View style={styles.notesHeader}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.notesEyebrow}>ULTRA CAST</ThemedText>
                <ThemedText style={styles.notesTitle}>What&apos;s New &amp; Known Issues</ThemedText>
                <ThemedText style={styles.notesSub}>v{APP_VERSION}</ThemedText>
              </View>
              <HoverBtn
                style={styles.notesCloseBtn}
                activeStyle={styles.notesCloseBtnActive}
                onPress={() => setNotesVisible(false)}
              >
                {(active) => (
                  <Feather name="x" size={18} color={active ? Colors.dark.accent : Colors.dark.text} />
                )}
              </HoverBtn>
            </View>

            <View style={styles.notesDivider} />

            {/* Tabs */}
            {!notesLoading && !notesError ? (
              <View style={styles.notesTabs}>
                <NotesTabBtn
                  label="What's New"
                  icon="zap"
                  active={notesTab === "whatsnew"}
                  onPress={() => setNotesTab("whatsnew")}
                />
                <NotesTabBtn
                  label="Known Issues"
                  icon="alert-triangle"
                  active={notesTab === "issues"}
                  activeTint={Colors.dark.error}
                  onPress={() => setNotesTab("issues")}
                  badge={notes.filter((n) => (n.type ?? "").toLowerCase() === "issue").length}
                />
              </View>
            ) : null}

            {notesLoading ? (
              <View style={styles.notesCentered}>
                <ActivityIndicator size="large" color={Colors.dark.accent} />
              </View>
            ) : notesError ? (
              <View style={styles.notesCentered}>
                <Feather name="alert-circle" size={28} color={Colors.dark.error} />
                <ThemedText style={styles.notesErrorText}>{notesError}</ThemedText>
                <HoverBtn
                  style={styles.retryBtn}
                  activeStyle={styles.retryBtnActive}
                  onPress={handleOpenNotes}
                >
                  <ThemedText style={styles.retryBtnText}>Retry</ThemedText>
                </HoverBtn>
              </View>
            ) : (
              <ScrollView
                style={styles.notesScroll}
                contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}
                showsVerticalScrollIndicator
                indicatorStyle="white"
                nestedScrollEnabled
              >
                {(() => {
                  const changes = notes.filter((n) => (n.type ?? "").toLowerCase() === "change");
                  const issues = notes.filter((n) => (n.type ?? "").toLowerCase() === "issue");

                  if (notesTab === "issues") {
                    if (issues.length === 0) {
                      return (
                        <View style={styles.notesCentered}>
                          <Feather name="check-circle" size={28} color={Colors.dark.success} />
                          <ThemedText style={styles.notesEmpty}>
                            No known issues right now.
                          </ThemedText>
                        </View>
                      );
                    }
                    return (
                      <NotesSection
                        label="Known Issues"
                        icon="alert-triangle"
                        tint={Colors.dark.error}
                        items={issues}
                      />
                    );
                  }

                  // ── What's New: group changes by version, newest first ──
                  // Build version order from /api/app-versions (already
                  // released_at desc). Append an "Other" bucket at the end
                  // for any change rows whose version_id is NULL OR doesn't
                  // match a known version row (stale FK).
                  const knownIds = new Set(versions.map((v) => v.id));
                  const byVersion = new Map<string, AppNote[]>();
                  const orphans: AppNote[] = [];
                  for (const n of changes) {
                    if (n.version_id && knownIds.has(n.version_id)) {
                      const arr = byVersion.get(n.version_id) ?? [];
                      arr.push(n);
                      byVersion.set(n.version_id, arr);
                    } else {
                      orphans.push(n);
                    }
                  }
                  const groups: { version: AppVersionRow | null; items: AppNote[] }[] = [];
                  for (const v of versions) {
                    const arr = byVersion.get(v.id);
                    if (arr && arr.length > 0) groups.push({ version: v, items: arr });
                  }
                  if (orphans.length > 0) groups.push({ version: null, items: orphans });

                  if (groups.length === 0) {
                    return (
                      <View style={styles.notesCentered}>
                        <Feather name="inbox" size={28} color={Colors.dark.border} />
                        <ThemedText style={styles.notesEmpty}>No release notes yet.</ThemedText>
                      </View>
                    );
                  }
                  return (
                    <>
                      {groups.map((g, idx) => {
                        const key = g.version?.id ?? "__orphan__";
                        const isOpen = expandedVersion === key;
                        return (
                          <VersionGroup
                            key={key}
                            version={g.version}
                            items={g.items}
                            isLatest={idx === 0}
                            expanded={isOpen}
                            onToggle={() => setExpandedVersion(isOpen ? null : key)}
                          />
                        );
                      })}
                    </>
                  );
                })()}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

function NotesTabBtn({
  label,
  icon,
  active,
  onPress,
  badge,
  activeTint = Colors.dark.accent,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  active: boolean;
  onPress: () => void;
  badge?: number;
  activeTint?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isHover = focused || pressed;
  const tint = active ? activeTint : isHover ? Colors.dark.text : Colors.dark.textSecondary;
  return (
    <Pressable
      style={[
        styles.notesTabBtn,
        active && { borderColor: activeTint, backgroundColor: activeTint + "15" },
        isHover && !active && styles.notesTabBtnHover,
      ]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      <Feather name={icon} size={13} color={tint} />
      <ThemedText style={[styles.notesTabBtnText, { color: tint }]}>{label}</ThemedText>
      {badge && badge > 0 ? (
        <View style={[styles.notesTabBadge, { borderColor: tint + "55", backgroundColor: tint + "20" }]}>
          <ThemedText style={[styles.notesTabBadgeText, { color: tint }]}>{badge}</ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

function VersionGroup({
  version,
  items,
  isLatest,
  expanded,
  onToggle,
}: {
  version: AppVersionRow | null;
  items: AppNote[];
  isLatest: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isHover = focused || pressed;
  const label = version ? `v${version.version}` : "Other Changes";
  const date = version?.released_at ?? version?.created_at;
  return (
    <View style={[styles.versionGroup, expanded && styles.versionGroupOpen]}>
      <Pressable
        style={[
          styles.versionHeaderBtn,
          isHover && styles.versionHeaderBtnHover,
          expanded && styles.versionHeaderBtnActive,
        ]}
        onPress={onToggle}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
      >
        <Feather
          name={expanded ? "chevron-down" : "chevron-right"}
          size={18}
          color={Colors.dark.accent}
        />
        <View style={styles.versionTitleRow}>
          <ThemedText style={styles.versionTitle}>{label}</ThemedText>
          {isLatest ? (
            <View style={styles.versionLatestPill}>
              <ThemedText style={styles.versionLatestText}>LATEST</ThemedText>
            </View>
          ) : null}
          <View style={styles.versionCountChip}>
            <ThemedText style={styles.versionCountText}>{items.length}</ThemedText>
          </View>
        </View>
        {date ? (
          <ThemedText style={styles.versionDate}>
            {new Date(date).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </ThemedText>
        ) : null}
      </Pressable>
      {expanded ? (
        <View style={styles.versionBody}>
          {items.map((n) => (
            <View
              key={n.id}
              style={[
                styles.noteRow,
                { borderLeftColor: Colors.dark.accent, backgroundColor: "rgba(255,255,255,0.025)" },
              ]}
            >
              <ThemedText style={styles.noteText}>{n.text}</ThemedText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function NotesSection({
  label,
  icon,
  tint,
  items,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  tint: string;
  items: AppNote[];
}) {
  return (
    <View style={{ gap: Spacing.xs, marginBottom: Spacing.sm }}>
      <View style={styles.notesSectionHeader}>
        <Feather name={icon} size={13} color={tint} />
        <ThemedText style={[styles.notesSectionLabel, { color: tint }]}>{label}</ThemedText>
        <View style={[styles.notesCountPill, { borderColor: tint + "55", backgroundColor: tint + "15" }]}>
          <ThemedText style={[styles.notesCountText, { color: tint }]}>{items.length}</ThemedText>
        </View>
      </View>
      {items.map((n) => (
        <View
          key={n.id}
          style={[
            styles.noteRow,
            { borderLeftColor: tint, backgroundColor: "rgba(255,255,255,0.025)" },
          ]}
        >
          <ThemedText style={styles.noteText}>{n.text}</ThemedText>
          {n.created_at ? (
            <ThemedText style={styles.noteDate}>
              {new Date(n.created_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </ThemedText>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { flexDirection: "row", alignItems: "center", paddingBottom: Spacing.md, gap: Spacing.md },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: Colors.dark.text },
  divider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.md },
  iconBtn: {
    width: 40, height: 40, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  iconBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  body: { gap: Spacing.md },
  leftCol: { gap: Spacing.sm },
  // Landscape body = fixed full-height row, no scrolling.
  landscapeBody: {
    flex: 1, flexDirection: "row", gap: Spacing.md,
  },
  leftColLandscape: { width: 250, flexShrink: 0, gap: Spacing.sm },
  midColLandscape: { flex: 1, gap: Spacing.md, minWidth: 0 },
  rightColLandscape: { width: 290, flexShrink: 0, gap: Spacing.md },
  portraitCol: { gap: Spacing.lg },

  // ── Update Hero (App section centrepiece) ──────────────────────────
  updateHero: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: "rgba(255,102,0,0.55)",
    padding: Spacing.md, gap: Spacing.sm, overflow: "hidden",
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45, shadowRadius: 14, elevation: 6,
  },
  updateHeroTopRow: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
  },
  updateHeroEyebrow: {
    color: Colors.dark.accent, fontSize: 10, fontWeight: "800",
    letterSpacing: 2.4,
  },
  updateHeroVersionRow: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    marginTop: 4, flexWrap: "wrap",
  },
  updateHeroVersion: {
    color: Colors.dark.text, fontSize: 26, fontWeight: "900",
    letterSpacing: 0.5,
  },
  updateHeroInstalledBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: BorderRadius.full, borderWidth: 1,
    borderColor: "rgba(34,197,94,0.45)",
    backgroundColor: "rgba(34,197,94,0.10)",
  },
  updateHeroInstalledDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: Colors.dark.success,
  },
  updateHeroInstalledText: {
    fontSize: 9, fontWeight: "800", color: Colors.dark.success,
    letterSpacing: 0.6, textTransform: "uppercase",
  },
  updateHeroIconRing: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1.5, borderColor: Colors.dark.accent,
    backgroundColor: "rgba(255,102,0,0.12)",
    justifyContent: "center", alignItems: "center",
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55, shadowRadius: 10,
  },
  updateCta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.md,
    backgroundColor: Colors.dark.accent,
    borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 10, elevation: 5,
  },
  updateCtaActive: {
    shadowOpacity: 0.95, shadowRadius: 14, elevation: 8,
    transform: [{ scale: 1.02 }],
  },
  updateCtaText: {
    color: "#fff", fontSize: 13.5, fontWeight: "800",
    letterSpacing: 0.4, flex: 1, textAlign: "center",
  },

  // Section heading (between tile groups)
  sectionHeading: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  sectionHeadingLine: {
    flex: 1, height: 1, backgroundColor: "rgba(255,102,0,0.18)",
  },
  sectionHeadingText: {
    fontSize: 10, fontWeight: "800", color: Colors.dark.accent,
    letterSpacing: 2, textTransform: "uppercase",
  },

  // Reusable ActionTile (used in Profile / Settings / App grids)
  actionTile: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.dark.border,
    paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.sm + 2,
    minHeight: 56,
  },
  actionTileActive: {
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45, shadowRadius: 8, elevation: 4,
  },
  actionTileIcon: {
    width: 34, height: 34, borderRadius: BorderRadius.sm,
    borderWidth: 1, justifyContent: "center", alignItems: "center",
  },
  actionTileTitle: { color: Colors.dark.text, fontSize: 12.5, fontWeight: "700" },
  actionTileSub: { color: Colors.dark.textSecondary, fontSize: 10.5, marginTop: 1 },

  // Responsive 2-col tile grid (wraps automatically)
  tileGrid: {
    flexDirection: "row", flexWrap: "wrap",
    marginHorizontal: -Spacing.xs / 2,
    rowGap: Spacing.sm, columnGap: 0,
  },
  tileGridItem: {
    width: "50%", paddingHorizontal: Spacing.xs / 2,
  },

  // Active profile pill inside user hero card
  profilePill: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    paddingVertical: Spacing.xs + 2, paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full, borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignSelf: "stretch", marginTop: Spacing.xs,
  },
  profilePillAvatar: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 1.5,
    justifyContent: "center", alignItems: "center",
  },
  profilePillLabel: {
    fontSize: 9, fontWeight: "700", color: Colors.dark.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.8,
  },
  profilePillName: { fontSize: 12.5, fontWeight: "800" },

  // Inline label row above InfoRows in the subscription card
  cardLabelRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginBottom: 2,
  },

  // Support modal (re-uses notes modal styling)
  supportModal: {
    width: "100%", maxWidth: 520, maxHeight: "85%",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: "rgba(255,102,0,0.4)",
    overflow: "hidden",
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 14,
  },
  supportFootnote: {
    color: Colors.dark.textSecondary, fontSize: 11, fontStyle: "italic",
    marginTop: Spacing.xs, textAlign: "center",
  },
  userCard: {
    backgroundColor: Colors.dark.backgroundDefault, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: "rgba(255,102,0,0.3)",
    padding: Spacing.lg, alignItems: "center", gap: Spacing.sm, overflow: "hidden",
  },
  avatarRing: {
    width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: Colors.dark.accent,
    justifyContent: "center", alignItems: "center",
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 12,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.dark.accentDim, justifyContent: "center", alignItems: "center",
  },
  username: { fontSize: 16, fontWeight: "700", color: Colors.dark.text },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  profileCard: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.dark.border,
    padding: Spacing.md,
  },
  profileAvatar: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 2, justifyContent: "center", alignItems: "center",
  },
  profileCardLabel: { fontSize: 10, color: Colors.dark.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  profileCardName: { fontSize: 14, fontWeight: "700" },
  profileActions: { flexDirection: "column", gap: Spacing.sm },
  profileActionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: Spacing.xs, paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.dark.border,
  },
  profileActionBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  profileActionText: { color: Colors.dark.accent, fontSize: 12, fontWeight: "600" },
  versionBlock: { alignItems: "center", gap: Spacing.xs, marginTop: Spacing.xs },
  utilityBlockLandscape: { marginTop: 0, alignSelf: "stretch" },
  utilityCardLandscape: { padding: Spacing.sm, justifyContent: "center" },
  subRowLandscape: {
    flexDirection: "row", gap: Spacing.md, alignItems: "stretch",
  },
  infoCardHalf: { flex: 1 },
  exitAppWrap: { marginTop: Spacing.xs },
  devGrid: {
    flexDirection: "row", flexWrap: "wrap",
    marginHorizontal: -Spacing.xs,
  },
  devGridItem: {
    width: "50%", paddingHorizontal: Spacing.xs,
  },
  versionText: {
    color: Colors.dark.textSecondary, fontSize: 11, fontWeight: "600",
    letterSpacing: 0.5,
  },
  updateBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    alignSelf: "stretch",
    gap: 6, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: "rgba(255,102,0,0.35)",
  },
  updateBtnActive: {
    borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim,
  },
  updateBtnText: { color: Colors.dark.accent, fontSize: 11, fontWeight: "700" },
  notesBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    alignSelf: "stretch",
    gap: 6, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm,
    backgroundColor: "transparent",
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: "rgba(255,102,0,0.25)",
  },
  notesBtnActive: {
    borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim,
  },

  // ── App Notes modal ─────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center", alignItems: "center",
    padding: Spacing.lg,
  },
  notesModal: {
    width: "100%", maxWidth: 640, maxHeight: "90%",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: "rgba(255,102,0,0.4)",
    overflow: "hidden",
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 14,
  },
  notesScroll: { flexShrink: 1 },
  notesHeader: {
    flexDirection: "row", alignItems: "center", gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md,
  },
  notesEyebrow: {
    color: Colors.dark.accent, fontSize: 10, fontWeight: "800",
    letterSpacing: 2.5,
  },
  notesTitle: {
    color: Colors.dark.text, fontSize: 18, fontWeight: "800",
    marginTop: 2, letterSpacing: 0.3,
  },
  notesSub: {
    color: Colors.dark.textSecondary, fontSize: 11, fontWeight: "600",
    marginTop: 2,
  },
  notesCloseBtn: {
    width: 36, height: 36, borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  notesCloseBtnActive: {
    borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim,
  },
  notesDivider: { height: 1, backgroundColor: "rgba(255,102,0,0.2)" },
  notesTabs: {
    flexDirection: "row", gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md,
  },
  notesTabBtn: {
    flexDirection: "row", alignItems: "center", gap: Spacing.xs,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  notesTabBtnHover: { borderColor: Colors.dark.textSecondary },
  notesTabBtnText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  notesTabBadge: {
    paddingHorizontal: 7, paddingVertical: 1,
    borderRadius: BorderRadius.full, borderWidth: 1, marginLeft: 2,
  },
  notesTabBadgeText: { fontSize: 10, fontWeight: "800" },
  versionGroup: {
    borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
    overflow: "hidden",
  },
  versionGroupOpen: {
    borderColor: "rgba(255,102,0,0.45)",
  },
  versionHeaderBtn: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
  },
  versionHeaderBtnHover: {
    backgroundColor: "rgba(255,102,0,0.08)",
  },
  versionHeaderBtnActive: {
    backgroundColor: "rgba(255,102,0,0.06)",
    borderBottomWidth: 1, borderBottomColor: "rgba(255,102,0,0.22)",
  },
  versionBody: {
    padding: Spacing.md, gap: Spacing.xs,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  versionCountChip: {
    paddingHorizontal: 8, paddingVertical: 1,
    borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.05)",
    marginLeft: 2,
  },
  versionCountText: {
    fontSize: 10, fontWeight: "800", color: Colors.dark.textSecondary,
  },
  versionTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  versionTitle: {
    fontSize: 16, fontWeight: "800", color: Colors.dark.accent,
    letterSpacing: 0.5,
  },
  versionLatestPill: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accentDim,
  },
  versionLatestText: {
    fontSize: 9, fontWeight: "800", color: Colors.dark.accent,
    letterSpacing: 1.2,
  },
  versionDate: {
    fontSize: 11, fontWeight: "600", color: Colors.dark.textSecondary,
    letterSpacing: 0.3,
  },
  notesCentered: {
    paddingVertical: Spacing["3xl"],
    alignItems: "center", gap: Spacing.sm,
  },
  notesErrorText: { color: Colors.dark.textSecondary, fontSize: 13 },
  notesEmpty: { color: Colors.dark.textSecondary, fontSize: 13 },
  notesSectionHeader: {
    flexDirection: "row", alignItems: "center", gap: Spacing.xs,
    paddingHorizontal: Spacing.xs, paddingBottom: Spacing.xs,
  },
  notesSectionLabel: {
    fontSize: 11, fontWeight: "800",
    textTransform: "uppercase", letterSpacing: 1.2,
  },
  notesCountPill: {
    paddingHorizontal: 8, paddingVertical: 1,
    borderRadius: BorderRadius.full,
    borderWidth: 1, marginLeft: 4,
  },
  notesCountText: { fontSize: 10, fontWeight: "800" },
  noteRow: {
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderLeftWidth: 3,
    gap: 4,
  },
  noteText: { color: Colors.dark.text, fontSize: 13, fontWeight: "500", lineHeight: 18 },
  noteDate: { color: Colors.dark.textSecondary, fontSize: 10, fontWeight: "600", letterSpacing: 0.3 },
  infoSection: { flex: 1, gap: Spacing.md },
  infoGrid: { flexDirection: "column", gap: Spacing.md },
  infoCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.dark.border,
    padding: Spacing.md, gap: Spacing.xs,
  },
  cardLabel: {
    fontSize: 11, fontWeight: "700", color: Colors.dark.accent,
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: Spacing.xs,
  },
  infoRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
    gap: Spacing.sm,
  },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 11, color: Colors.dark.textSecondary },
  infoValue: { fontSize: 13, color: Colors.dark.text, fontWeight: "500" },

  // Copy button
  copyBtn: {
    width: 28, height: 28, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  copyBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  copyBtnCopied: { borderColor: Colors.dark.success, backgroundColor: "rgba(34,197,94,0.1)" },

  // Organise Categories button
  organiseBtn: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.dark.border,
    padding: Spacing.md,
  },
  organiseBtnActive: {
    borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim,
  },
  organiseTitle: { color: Colors.dark.text, fontSize: 13, fontWeight: "700" },
  organiseSub: { color: Colors.dark.textSecondary, fontSize: 11, marginTop: 2 },
  // 50/50 row holding Organise Categories + Player Settings buttons
  settingsRow: { flexDirection: "row", gap: Spacing.sm },
  settingsRowItem: { flex: 1, minWidth: 0 },

  // Developer card states
  devLoading: { paddingVertical: Spacing.md, alignItems: "center" },
  devEmpty: { paddingVertical: Spacing.md, alignItems: "center", gap: Spacing.xs },
  devEmptyText: { color: Colors.dark.textSecondary, fontSize: 12 },

  lifetimeBadge: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    backgroundColor: "rgba(255,102,0,0.12)",
    borderRadius: BorderRadius.sm, borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
    alignSelf: "flex-start",
  },
  lifetimeText: {
    color: Colors.dark.accent, fontWeight: "700", fontSize: 14,
  },
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.dark.backgroundDefault, borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md, borderWidth: 1, borderColor: "rgba(255,59,59,0.4)", gap: Spacing.sm,
  },
  logoutBtnPressed: { backgroundColor: "rgba(255,59,59,0.08)", borderColor: Colors.dark.error },
  exitAppBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: "transparent",
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    borderColor: "rgba(255,59,59,0.45)",
  },
  exitAppBtnActive: {
    backgroundColor: "rgba(255,59,59,0.12)",
    borderColor: Colors.dark.error,
    shadowColor: "#FF3B3B",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 4,
  },
  exitAppBtnText: { color: Colors.dark.error, fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  logoutText: { color: Colors.dark.error, fontWeight: "700", fontSize: 14 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: Spacing.md },
  errorText: { color: Colors.dark.error, textAlign: "center" },
  retryBtn: {
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.accent, borderRadius: BorderRadius.sm,
  },
  retryBtnActive: {
    backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85, shadowRadius: 10, elevation: 6,
    transform: [{ scale: 1.03 }],
  },
  retryBtnText: { color: "#fff", fontWeight: "700" },
});
