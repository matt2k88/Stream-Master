import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/contexts/ProfileContext";
import { LinearGradient } from "expo-linear-gradient";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

function InfoRow({ label, value, icon }: { label: string; value: string; icon: keyof typeof Feather.glyphMap }) {
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

export default function AccountInfoScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { userInfo, logout, refreshUserInfo, isLoading } = useAuth();
  const { activeProfile, clearProfile } = useProfile();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  useEffect(() => { handleRefresh(); }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshUserInfo();
    setIsRefreshing(false);
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
  const server = userInfo?.server_info;

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnActive]}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={20} color={Colors.dark.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Account</ThemedText>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnActive]}
          onPress={handleRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing
            ? <ActivityIndicator size="small" color={Colors.dark.accent} />
            : <Feather name="refresh-cw" size={16} color={Colors.dark.textSecondary} />}
        </Pressable>
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
        </View>
      ) : user ? (
        <View style={[styles.body, { paddingHorizontal: padH, paddingBottom: padB, flexDirection: isLandscape ? "row" : "column" }]}>
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
                <Pressable
                  style={({ pressed }) => [styles.profileActionBtn, pressed && styles.profileActionBtnActive]}
                  onPress={() => navigation.navigate("CreateProfile", { profile: activeProfile })}
                >
                  <Feather name="edit-2" size={14} color={Colors.dark.accent} />
                  <ThemedText style={styles.profileActionText}>Edit Profile</ThemedText>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.profileActionBtn, pressed && styles.profileActionBtnActive]}
                  onPress={() => navigation.navigate("ProfilePicker", { fromHome: true })}
                >
                  <Feather name="users" size={14} color={Colors.dark.textSecondary} />
                  <ThemedText style={[styles.profileActionText, { color: Colors.dark.textSecondary }]}>Switch Profile</ThemedText>
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* Info section */}
          <View style={styles.infoSection}>
            <View style={styles.infoGrid}>
              <View style={styles.infoCard}>
                <ThemedText style={styles.cardLabel}>Subscription</ThemedText>
                <InfoRow label="Expires" value={formatDate(user.exp_date)} icon="calendar" />
                <InfoRow label="Connections" value={`${user.active_cons || 0} / ${user.max_connections || "N/A"}`} icon="users" />
                <InfoRow label="Created" value={formatDate(user.created_at)} icon="clock" />
                <InfoRow label="Trial" value={user.is_trial === "1" ? "Yes" : "No"} icon="flag" />
              </View>
              {server ? (
                <View style={styles.infoCard}>
                  <ThemedText style={styles.cardLabel}>Server</ThemedText>
                  <InfoRow label="URL" value={server.url || "N/A"} icon="server" />
                  <InfoRow label="Port" value={server.port || "N/A"} icon="hash" />
                  <InfoRow label="Timezone" value={server.timezone || "N/A"} icon="globe" />
                </View>
              ) : null}
            </View>

            <Pressable
              style={({ pressed }) => [styles.logoutBtn, pressed && styles.logoutBtnPressed]}
              onPress={async () => { clearProfile(); await logout(); }}
            >
              <Feather name="log-out" size={16} color={Colors.dark.error} />
              <ThemedText style={styles.logoutText}>Sign Out</ThemedText>
            </Pressable>
          </View>
        </View>
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
  body: { flex: 1, gap: Spacing.md },
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
  profileActions: { flexDirection: "row", gap: Spacing.sm },
  profileActionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: Spacing.xs, paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.dark.border,
  },
  profileActionBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  profileActionText: { color: Colors.dark.accent, fontSize: 12, fontWeight: "600" },
  infoSection: { flex: 1, gap: Spacing.md },
  infoGrid: { flex: 1, flexDirection: "row", gap: Spacing.md },
  infoCard: {
    flex: 1, backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.dark.border,
    padding: Spacing.md, gap: Spacing.xs,
  },
  cardLabel: {
    fontSize: 11, fontWeight: "700", color: Colors.dark.accent,
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: Spacing.xs,
  },
  infoRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: Spacing.xs, borderBottomWidth: 1, borderBottomColor: Colors.dark.border, gap: Spacing.sm,
  },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 11, color: Colors.dark.textSecondary },
  infoValue: { fontSize: 13, color: Colors.dark.text, fontWeight: "500" },
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.dark.backgroundDefault, borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md, borderWidth: 1, borderColor: "rgba(255,59,59,0.4)", gap: Spacing.sm,
  },
  logoutBtnPressed: { backgroundColor: "rgba(255,59,59,0.08)", borderColor: Colors.dark.error },
  logoutText: { color: Colors.dark.error, fontWeight: "700", fontSize: 14 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: Spacing.md },
  errorText: { color: Colors.dark.error, textAlign: "center" },
  retryBtn: {
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.accent, borderRadius: BorderRadius.sm,
  },
  retryBtnText: { color: "#fff", fontWeight: "700" },
});
