import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useAuth, PlayerMode } from "@/contexts/AuthContext";
import { LinearGradient } from "expo-linear-gradient";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

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
        <ThemedText style={styles.infoValue} numberOfLines={1}>
          {value}
        </ThemedText>
      </View>
    </View>
  );
}

function PlayerToggle() {
  const { playerMode, setPlayerMode } = useAuth();

  const options: { mode: PlayerMode; label: string; icon: keyof typeof Feather.glyphMap; desc: string }[] = [
    { mode: "internal", label: "Built-in", icon: "monitor", desc: "Expo video player" },
    { mode: "vlc", label: "VLC", icon: "zap", desc: "All codecs supported" },
  ];

  return (
    <View style={styles.playerSection}>
      <View style={styles.playerHeader}>
        <Feather name="sliders" size={13} color={Colors.dark.accent} />
        <ThemedText style={styles.cardLabel}>Player Engine</ThemedText>
      </View>

      <View style={styles.playerOptions}>
        {options.map((opt) => {
          const active = playerMode === opt.mode;
          return (
            <Pressable
              key={opt.mode}
              style={[styles.playerOption, active && styles.playerOptionActive]}
              onPress={() => setPlayerMode(opt.mode)}
            >
              {active ? (
                <LinearGradient
                  colors={["rgba(255,102,0,0.18)", "rgba(255,102,0,0.06)"]}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
              ) : null}
              <View style={[styles.playerIconWrap, active && styles.playerIconWrapActive]}>
                <Feather
                  name={opt.icon}
                  size={18}
                  color={active ? Colors.dark.accent : Colors.dark.textSecondary}
                />
              </View>
              <View style={styles.playerOptionInfo}>
                <ThemedText
                  style={[styles.playerOptionLabel, active && styles.playerOptionLabelActive]}
                >
                  {opt.label}
                </ThemedText>
                <ThemedText style={styles.playerOptionDesc}>{opt.desc}</ThemedText>
              </View>
              {active ? (
                <View style={styles.activeCheck}>
                  <Feather name="check" size={12} color={Colors.dark.accent} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {Platform.OS === "android" ? (
        <View style={styles.vlcNote}>
          <Feather name="info" size={11} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.vlcNoteText}>
            VLC engine is embedded in the APK and supports all audio/video codecs out of the box.
          </ThemedText>
        </View>
      ) : (
        <View style={styles.vlcNote}>
          <Feather name="info" size={11} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.vlcNoteText}>
            VLC engine is available in the Android APK build only.
          </ThemedText>
        </View>
      )}
    </View>
  );
}

export default function AccountInfoScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { userInfo, logout, refreshUserInfo, isLoading } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  useEffect(() => {
    handleRefresh();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshUserInfo();
    setIsRefreshing(false);
  };

  const formatDate = (ts: string) => {
    if (!ts || ts === "0") return "N/A";
    return new Date(parseInt(ts) * 1000).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const statusColor = (s: string) =>
    s?.toLowerCase() === "active"
      ? Colors.dark.success
      : s?.toLowerCase() === "expired"
      ? Colors.dark.error
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
          {isRefreshing ? (
            <ActivityIndicator size="small" color={Colors.dark.accent} />
          ) : (
            <Feather name="refresh-cw" size={16} color={Colors.dark.textSecondary} />
          )}
        </Pressable>
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
        </View>
      ) : user ? (
        <View
          style={[
            styles.body,
            {
              paddingHorizontal: padH,
              paddingBottom: padB,
              flexDirection: isLandscape ? "row" : "column",
            },
          ]}
        >
          {/* User card */}
          <View style={[styles.userCard, isLandscape && styles.userCardLandscape]}>
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
            <ThemedText style={styles.username} numberOfLines={1}>
              {user.username}
            </ThemedText>
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, { backgroundColor: statusColor(user.status) }]} />
              <ThemedText style={[styles.statusText, { color: statusColor(user.status) }]}>
                {user.status || "Unknown"}
              </ThemedText>
            </View>
          </View>

          {/* Info + Player settings */}
          <View style={styles.infoSection}>
            <View style={styles.infoGrid}>
              <View style={styles.infoCard}>
                <ThemedText style={styles.cardLabel}>Subscription</ThemedText>
                <InfoRow label="Expires" value={formatDate(user.exp_date)} icon="calendar" />
                <InfoRow
                  label="Connections"
                  value={`${user.active_cons || 0} / ${user.max_connections || "N/A"}`}
                  icon="users"
                />
                <InfoRow label="Created" value={formatDate(user.created_at)} icon="clock" />
                <InfoRow
                  label="Trial"
                  value={user.is_trial === "1" ? "Yes" : "No"}
                  icon="flag"
                />
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

            {/* Player engine toggle */}
            <PlayerToggle />

            <Pressable
              style={({ pressed }) => [
                styles.logoutBtn,
                pressed && styles.logoutBtnPressed,
              ]}
              onPress={async () => {
                await logout();
              }}
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
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginBottom: Spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
  },
  iconBtnActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accentDim,
  },
  body: {
    flex: 1,
    gap: Spacing.md,
  },
  userCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.3)",
    padding: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    overflow: "hidden",
  },
  userCardLandscape: {
    width: 150,
    flexShrink: 0,
  },
  avatarRing: {
    width: 68,
    height: 68,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderColor: Colors.dark.accent,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.accentDim,
    justifyContent: "center",
    alignItems: "center",
  },
  username: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  infoSection: {
    flex: 1,
    gap: Spacing.md,
  },
  infoGrid: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  infoCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.accent,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: Spacing.xs,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    gap: Spacing.sm,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
  },
  infoValue: {
    fontSize: 13,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  // Player toggle
  playerSection: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  playerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  playerOptions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  playerOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.sm,
    gap: Spacing.sm,
    overflow: "hidden",
  },
  playerOptionActive: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  playerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
  },
  playerIconWrapActive: {
    backgroundColor: Colors.dark.accentDim,
    borderColor: Colors.dark.accent,
  },
  playerOptionInfo: {
    flex: 1,
  },
  playerOptionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
  },
  playerOptionLabelActive: {
    color: Colors.dark.accent,
  },
  playerOptionDesc: {
    fontSize: 10,
    color: Colors.dark.textSecondary,
    marginTop: 1,
  },
  activeCheck: {
    width: 20,
    height: 20,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.accentDim,
    borderWidth: 1,
    borderColor: Colors.dark.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  vlcNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.xs,
    paddingTop: Spacing.xs,
  },
  vlcNoteText: {
    flex: 1,
    fontSize: 11,
    color: Colors.dark.textSecondary,
    lineHeight: 15,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,59,59,0.4)",
    gap: Spacing.sm,
  },
  logoutBtnPressed: {
    backgroundColor: "rgba(255,59,59,0.08)",
    borderColor: Colors.dark.error,
  },
  logoutText: {
    color: Colors.dark.error,
    fontWeight: "700",
    fontSize: 14,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  errorText: {
    color: Colors.dark.error,
    textAlign: "center",
  },
  retryBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.accent,
    borderRadius: BorderRadius.sm,
  },
  retryBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
});
