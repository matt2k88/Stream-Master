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

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface InfoRowProps {
  label: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
}

function InfoRow({ label, value, icon }: InfoRowProps) {
  return (
    <View style={styles.infoRow}>
      <Feather name={icon} size={16} color={Colors.dark.accent} style={styles.infoIcon} />
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

  const handleLogout = async () => {
    await logout();
  };

  const formatDate = (timestamp: string): string => {
    if (!timestamp || timestamp === "0") return "N/A";
    const date = new Date(parseInt(timestamp) * 1000);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusColor = (status: string): string => {
    switch (status?.toLowerCase()) {
      case "active": return Colors.dark.success;
      case "expired": return Colors.dark.error;
      default: return Colors.dark.textSecondary;
    }
  };

  const user = userInfo?.user_info;
  const server = userInfo?.server_info;

  const padH = Math.max(insets.left + Spacing.md, Spacing.lg);
  const padT = Math.max(insets.top + Spacing.sm, Spacing.lg);
  const padB = Math.max(insets.bottom + Spacing.sm, Spacing.lg);

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={22} color={Colors.dark.text} />
        </Pressable>
        <ThemedText type="h3" style={styles.headerTitle}>Account Info</ThemedText>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
          onPress={handleRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color={Colors.dark.text} />
          ) : (
            <Feather name="refresh-cw" size={18} color={Colors.dark.text} />
          )}
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
        </View>
      ) : user ? (
        <View style={[styles.body, { paddingHorizontal: padH, paddingBottom: padB, flexDirection: isLandscape ? "row" : "column" }]}>
          <View style={[styles.userCard, isLandscape && styles.userCardLandscape]}>
            <View style={styles.userIconContainer}>
              <Feather name="user" size={28} color={Colors.dark.accent} />
            </View>
            <View style={styles.userMeta}>
              <ThemedText type="h3" style={styles.username} numberOfLines={1}>
                {user.username}
              </ThemedText>
              <View style={styles.statusBadge}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(user.status) }]} />
                <ThemedText style={[styles.statusText, { color: getStatusColor(user.status) }]}>
                  {user.status || "Unknown"}
                </ThemedText>
              </View>
            </View>
          </View>

          <View style={[styles.infoSection, isLandscape && styles.infoSectionLandscape]}>
            <View style={styles.infoGrid}>
              <View style={styles.infoCard}>
                <ThemedText style={styles.cardTitle}>Subscription</ThemedText>
                <InfoRow label="Expires" value={formatDate(user.exp_date)} icon="calendar" />
                <InfoRow label="Connections" value={`${user.active_cons || 0} / ${user.max_connections || "N/A"}`} icon="users" />
                <InfoRow label="Created" value={formatDate(user.created_at)} icon="clock" />
                <InfoRow label="Trial" value={user.is_trial === "1" ? "Yes" : "No"} icon="flag" />
              </View>

              {server ? (
                <View style={styles.infoCard}>
                  <ThemedText style={styles.cardTitle}>Server</ThemedText>
                  <InfoRow label="URL" value={server.url || "N/A"} icon="server" />
                  <InfoRow label="Port" value={server.port || "N/A"} icon="hash" />
                  <InfoRow label="Timezone" value={server.timezone || "N/A"} icon="globe" />
                </View>
              ) : null}
            </View>

            <Pressable
              style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutButtonPressed]}
              onPress={handleLogout}
            >
              <Feather name="log-out" size={18} color={Colors.dark.error} />
              <ThemedText style={styles.logoutButtonText}>Logout</ThemedText>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.centered}>
          <Feather name="alert-circle" size={40} color={Colors.dark.error} />
          <ThemedText style={styles.errorText}>Failed to load account info</ThemedText>
          <Pressable style={styles.retryButton} onPress={handleRefresh}>
            <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
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
    color: Colors.dark.text,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  iconBtnPressed: {
    opacity: 0.7,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  body: {
    flex: 1,
    gap: Spacing.md,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: Spacing.md,
  },
  userCardLandscape: {
    flex: 0,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: 160,
    paddingVertical: Spacing.xl,
  },
  userIconContainer: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  userMeta: {
    flex: 1,
  },
  username: {
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 14,
    textTransform: "capitalize",
  },
  infoSection: {
    flex: 1,
    gap: Spacing.md,
  },
  infoSectionLandscape: {
    flex: 1,
  },
  infoGrid: {
    flex: 1,
    flexDirection: "row",
    gap: Spacing.md,
  },
  infoCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cardTitle: {
    color: Colors.dark.accent,
    fontWeight: "600",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  infoIcon: {
    width: 20,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
  },
  infoValue: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: "500",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.error,
    gap: Spacing.sm,
  },
  logoutButtonPressed: {
    opacity: 0.8,
    backgroundColor: "rgba(244, 67, 54, 0.1)",
  },
  logoutButtonText: {
    color: Colors.dark.error,
    fontWeight: "600",
    fontSize: 15,
  },
  errorText: {
    color: Colors.dark.error,
    textAlign: "center",
  },
  retryButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.accent,
    borderRadius: BorderRadius.sm,
  },
  retryButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
});
