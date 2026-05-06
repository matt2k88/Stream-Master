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
} from "react-native";
import Constants from "expo-constants";
import { reloadAppAsync } from "expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/contexts/ProfileContext";
import { LinearGradient } from "expo-linear-gradient";
import { getApiUrl } from "@/lib/query-client";

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
}: {
  label: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
}) {
  return (
    <View style={styles.infoRow}>
      <Feather name={icon} size={14} color={Colors.dark.accent} />
      <View style={styles.infoContent}>
        <ThemedText style={styles.infoLabel}>{label}</ThemedText>
        <ThemedText style={styles.infoValue} numberOfLines={1}>{value}</ThemedText>
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [devDetails, setDevDetails] = useState<DeveloperDetails | null>(null);
  const [devLoading, setDevLoading] = useState(true);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [isLifetime, setIsLifetime] = useState(false);

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
          `A new version (v${remoteVersion}) is available.\n\nUse downloader code ${code ?? "N/A"} to install.`,
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

  // Check lifetime DB whenever username is known
  useEffect(() => {
    const username = userInfo?.user_info?.username;
    if (!username) return;
    const url = new URL("/api/lifetime-check", getApiUrl());
    url.searchParams.set("username", username);
    fetch(url.toString())
      .then((r) => r.ok ? r.json() : { isLifetime: false })
      .then((d) => setIsLifetime(!!d?.isLifetime))
      .catch(() => {});
  }, [userInfo?.user_info?.username]);

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

            {/* App version + update check */}
            <View style={styles.versionBlock}>
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
                          if (Platform.OS !== "web") {
                            try { BackHandler.exitApp(); } catch {}
                          }
                          try { await reloadAppAsync(); } catch {}
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
              {/* Subscription card */}
              <View style={styles.infoCard}>
                <ThemedText style={styles.cardLabel}>Subscription</ThemedText>
                {isLifetime ? (
                  <View style={styles.lifetimeBadge}>
                    <Feather name="star" size={14} color={Colors.dark.accent} />
                    <ThemedText style={styles.lifetimeText}>Lifetime Access</ThemedText>
                  </View>
                ) : (
                  <InfoRow label="Expires" value={formatDate(user.exp_date)} icon="calendar" />
                )}
                <InfoRow label="Connections" value={`${user.active_cons || 0} / ${user.max_connections || "N/A"}`} icon="users" />
                <InfoRow label="Trial" value={user.is_trial === "1" ? "Yes" : "No"} icon="flag" />
              </View>

              {/* Developer card */}
              <View style={styles.infoCard}>
                <ThemedText style={styles.cardLabel}>Developer</ThemedText>
                {devLoading ? (
                  <View style={styles.devLoading}>
                    <ActivityIndicator size="small" color={Colors.dark.accent} />
                  </View>
                ) : devDetails && (devDetails.developer_name || devDetails.developer_contact) ? (
                  <>
                    {devDetails.developer_name ? (
                      <InfoRow label="Name" value={devDetails.developer_name} icon="code" />
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
                  </>
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
          <Pressable style={styles.retryBtn} onPress={handleRefresh}>
            <ThemedText style={styles.retryBtnText}>Retry</ThemedText>
          </Pressable>
        </View>
      )}
    </ThemedView>
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
  retryBtnText: { color: "#fff", fontWeight: "700" },
});
