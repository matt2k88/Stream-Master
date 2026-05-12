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
        style={[styles.copyBtn, pressed && styles.copyBtnActive, copied && styles.copyBtnCopied]}
        onPress={handleCopy}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        hitSlop={8}
      >
        <Feather
          name={copied ? "check" : "copy"}
          size={13}
          color={copied ? Colors.dark.success : Colors.dark.textSecondary}
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
  const expiryStatus = useExpiryStatus();
  const isLifetime = expiryStatus.isLifetime;
  const [notesVisible, setNotesVisible] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notes, setNotes] = useState<AppNote[]>([]);
  const [versions, setVersions] = useState<AppVersionRow[]>([]);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notesTab, setNotesTab] = useState<NotesTab>("whatsnew");
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

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
        Alert.alert(
          "Update Available",
          `A new version (v${remoteVersion}) is available.\n\nUse downloader code ${code ?? "N/A"} to install.\n\nIMPORTANT: Before downloading, clear the cache in Downloader so you receive the latest version of the app and not an older cached copy.`,
        );
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

  // Reusable utility block (app version + check updates + what's new + text
  // size). Rendered in the LEFT column in portrait, but moved to the RIGHT
  // column (alongside the Subscription card) in landscape so the Sign Out
  // button is visible without scrolling on TV / desktop.
  const utilityBlock = (
    <View style={[styles.versionBlock, isLandscape && styles.utilityBlockLandscape]}>
      <ThemedText style={styles.versionText}>v{APP_VERSION}</ThemedText>
      <HoverBtn
        style={styles.updateBtn}
        activeStyle={styles.updateBtnActive}
        onPress={handleCheckForUpdates}
        disabled={updateChecking}
      >
        {updateChecking ? (
          <ActivityIndicator size="small" color={Colors.dark.accent} />
        ) : (
          <Feather name="download-cloud" size={13} color={Colors.dark.accent} />
        )}
        <ThemedText style={styles.updateBtnText}>
          {updateChecking ? "Checking..." : "Check for Updates"}
        </ThemedText>
      </HoverBtn>
      <HoverBtn
        style={styles.notesBtn}
        activeStyle={styles.notesBtnActive}
        onPress={handleOpenNotes}
      >
        <Feather name="file-text" size={13} color={Colors.dark.accent} />
        <ThemedText style={styles.updateBtnText}>What&apos;s New</ThemedText>
      </HoverBtn>
      <HoverBtn
        style={styles.notesBtn}
        activeStyle={styles.notesBtnActive}
        onPress={() => { void toggleTextSize(); }}
      >
        <Feather name="type" size={13} color={Colors.dark.accent} />
        <ThemedText style={styles.updateBtnText}>
          Text Size: {textSize === "large" ? "Large" : "Normal"}
        </ThemedText>
      </HoverBtn>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
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
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.body,
            {
              paddingHorizontal: padH,
              paddingBottom: padB,
              flexDirection: isLandscape ? "row" : "column",
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Left column */}
          <View style={[styles.leftCol, isLandscape && styles.leftColLandscape]}>
            {/* Account card */}
            <View style={styles.userCard}>
              <LinearGradient
                colors={["rgba(255,102,0,0.12)", "rgba(255,102,0,0.02)"]}
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
            </View>

            {/* Active profile card */}
            {activeProfile ? (
              <View style={styles.profileCard}>
                <View style={[styles.profileAvatar, { backgroundColor: activeProfile.avatar_color + "33", borderColor: activeProfile.avatar_color }]}>
                  <Feather name={activeProfile.avatar_icon as any} size={18} color={activeProfile.avatar_color} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.profileCardLabel}>Active Profile</ThemedText>
                  <ThemedText style={[styles.profileCardName, { color: activeProfile.avatar_color }]} numberOfLines={1}>
                    {activeProfile.name}
                  </ThemedText>
                </View>
              </View>
            ) : null}

            {/* Profile action buttons */}
            {activeProfile ? (
              <View style={styles.profileActions}>
                <HoverBtn
                  style={styles.profileActionBtn}
                  activeStyle={styles.profileActionBtnActive}
                  onPress={() => navigation.navigate("CreateProfile", { profile: activeProfile })}
                >
                  <Feather name="edit-2" size={14} color={Colors.dark.accent} />
                  <ThemedText style={styles.profileActionText}>Edit Profile</ThemedText>
                </HoverBtn>
                <HoverBtn
                  style={styles.profileActionBtn}
                  activeStyle={styles.profileActionBtnActive}
                  onPress={() => navigation.navigate("ProfilePicker", { fromHome: true })}
                >
                  <Feather name="users" size={14} color={Colors.dark.textSecondary} />
                  <ThemedText style={[styles.profileActionText, { color: Colors.dark.textSecondary }]}>Switch Profile</ThemedText>
                </HoverBtn>
              </View>
            ) : null}

            {/* App version + update check.
                In landscape this whole block is moved out of the left column
                and rendered to the right of the Subscription card so the
                Sign Out button is visible without scrolling. The Exit App
                button below stays in the left column either way. */}
            {!isLandscape ? utilityBlock : null}
            <View style={styles.exitAppWrap}>
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
                          // Persist a flag so the intro replays on next
                          // launch / foreground, regardless of whether the
                          // OS actually killed the process.
                          try { await markReplayIntroOnResume(); } catch {}
                          // Android: actually quits the activity. iOS:
                          // cannot exit programmatically per Apple HIG, so
                          // just dismiss the alert. The AppState listener in
                          // App.tsx will replay the intro on next foreground.
                          if (Platform.OS === "android") {
                            try { BackHandler.exitApp(); } catch {}
                          }
                        },
                      },
                    ],
                  );
                }}
              >
                <Feather name="log-out" size={13} color={Colors.dark.error} />
                <ThemedText style={styles.exitAppBtnText}>Exit App</ThemedText>
              </HoverBtn>
            </View>
          </View>

          {/* Info section */}
          <View style={styles.infoSection}>
            <View style={styles.infoGrid}>
              {/* Subscription card — in landscape, paired side-by-side with
                  the utility block (version + update buttons + text size) so
                  the page fits on screen without scrolling. */}
              {(() => {
                const subscriptionCard = (
                  <View style={[styles.infoCard, isLandscape && styles.infoCardHalf]}>
                    <ThemedText style={styles.cardLabel}>Subscription</ThemedText>
                    {isLifetime ? (
                      <View style={styles.lifetimeBadge}>
                        <Feather name="star" size={14} color={Colors.dark.accent} />
                        <ThemedText style={styles.lifetimeText}>Lifetime Access</ThemedText>
                      </View>
                    ) : (
                      (() => {
                        // Only colour the date red once the lifetime check
                        // has definitively resolved — avoids flashing a
                        // warning to true-lifetime users on the first load
                        // while /api/lifetime-check is in flight.
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
                if (!isLandscape) return subscriptionCard;
                return (
                  <View style={styles.subRowLandscape}>
                    {subscriptionCard}
                    <View style={[styles.infoCard, styles.infoCardHalf, styles.utilityCardLandscape]}>
                      {utilityBlock}
                    </View>
                  </View>
                );
              })()}

              {/* Organise Categories + Player Settings — split 50/50 row.
                  Organise was full-width before; we shrunk it to make room
                  for the new Player Settings entry beside it. */}
              <View style={styles.settingsRow}>
                <HoverBtn
                  style={[styles.organiseBtn, styles.settingsRowItem]}
                  activeStyle={styles.organiseBtnActive}
                  onPress={() => navigation.navigate("OrganiseTypePicker")}
                >
                  {(active) => (
                    <>
                      <Feather name="sliders" size={15} color={active ? Colors.dark.accent : Colors.dark.textSecondary} />
                      <View style={{ flex: 1 }}>
                        <ThemedText style={[styles.organiseTitle, active && { color: Colors.dark.accent }]}>
                          Organise Categories
                        </ThemedText>
                        <ThemedText style={styles.organiseSub} numberOfLines={1}>
                          Reorder or hide categories
                        </ThemedText>
                      </View>
                      <Feather name="chevron-right" size={16} color={active ? Colors.dark.accent : Colors.dark.textSecondary} />
                    </>
                  )}
                </HoverBtn>
                <HoverBtn
                  style={[styles.organiseBtn, styles.settingsRowItem]}
                  activeStyle={styles.organiseBtnActive}
                  onPress={() => navigation.navigate("PlayerSettings")}
                >
                  {(active) => (
                    <>
                      <Feather name="play-circle" size={15} color={active ? Colors.dark.accent : Colors.dark.textSecondary} />
                      <View style={{ flex: 1 }}>
                        <ThemedText style={[styles.organiseTitle, active && { color: Colors.dark.accent }]}>
                          Player Settings
                        </ThemedText>
                        <ThemedText style={styles.organiseSub} numberOfLines={1}>
                          VLC or Expo per stream type
                        </ThemedText>
                      </View>
                      <Feather name="chevron-right" size={16} color={active ? Colors.dark.accent : Colors.dark.textSecondary} />
                    </>
                  )}
                </HoverBtn>
              </View>

              {/* Developer card — in landscape, the four entries lay out as
                  a 2×2 grid (Name | Contact on top, Website | Renewal on
                  bottom) so the card stays short and Sign Out remains in
                  view without scrolling. Portrait keeps the original
                  stacked layout. */}
              <View style={styles.infoCard}>
                <ThemedText style={styles.cardLabel}>Developer</ThemedText>
                {devLoading ? (
                  <View style={styles.devLoading}>
                    <ActivityIndicator size="small" color={Colors.dark.accent} />
                  </View>
                ) : devDetails && (devDetails.developer_name || devDetails.developer_contact) ? (
                  <View style={isLandscape ? styles.devGrid : undefined}>
                    {devDetails.developer_name ? (
                      <View style={isLandscape ? styles.devGridItem : undefined}>
                        <InfoRow label="Name" value={devDetails.developer_name} icon="code" />
                      </View>
                    ) : null}
                    {devDetails.developer_contact ? (
                      <View style={isLandscape ? styles.devGridItem : undefined}>
                        <InfoRow label="Contact" value={devDetails.developer_contact} icon="message-circle" />
                      </View>
                    ) : null}
                    {devDetails.website_link ? (
                      <View style={isLandscape ? styles.devGridItem : undefined}>
                        <CopyRow label="Website" value={devDetails.website_link} icon="globe" />
                      </View>
                    ) : null}
                    {devDetails.renewal_link ? (
                      <View style={isLandscape ? styles.devGridItem : undefined}>
                        <CopyRow label="Renewal" value={devDetails.renewal_link} icon="refresh-cw" />
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.devEmpty}>
                    <Feather name="code" size={20} color={Colors.dark.border} />
                    <ThemedText style={styles.devEmptyText}>No details available</ThemedText>
                  </View>
                )}
              </View>
            </View>

            <HoverBtn
              style={styles.logoutBtn}
              activeStyle={styles.logoutBtnPressed}
              onPress={async () => { clearProfile(); await logout(); }}
            >
              <Feather name="log-out" size={16} color={Colors.dark.error} />
              <ThemedText style={styles.logoutText}>Sign Out</ThemedText>
            </HoverBtn>
          </View>
        </ScrollView>
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
  body: { gap: Spacing.md, alignItems: isNaN(0) ? "stretch" : undefined },
  leftCol: { gap: Spacing.sm },
  leftColLandscape: { width: 170, flexShrink: 0 },
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
