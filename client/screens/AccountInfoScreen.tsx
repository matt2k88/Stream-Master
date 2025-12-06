import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
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
      <View style={styles.infoIconContainer}>
        <Feather name={icon} size={20} color={Colors.dark.accent} />
      </View>
      <View style={styles.infoContent}>
        <ThemedText style={styles.infoLabel}>{label}</ThemedText>
        <ThemedText type="body" style={styles.infoValue}>
          {value}
        </ThemedText>
      </View>
    </View>
  );
}

export default function AccountInfoScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { userInfo, logout, refreshUserInfo, isLoading } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

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
      month: "long",
      day: "numeric",
    });
  };

  const getStatusColor = (status: string): string => {
    switch (status?.toLowerCase()) {
      case "active":
        return Colors.dark.success;
      case "expired":
        return Colors.dark.error;
      default:
        return Colors.dark.textSecondary;
    }
  };

  const user = userInfo?.user_info;
  const server = userInfo?.server_info;

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Spacing.lg,
            paddingHorizontal: insets.left + Spacing.tvSafeZone,
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.backButtonPressed,
          ]}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={24} color={Colors.dark.text} />
        </Pressable>
        <ThemedText type="h2" style={styles.headerTitle}>
          Account Info
        </ThemedText>
        <Pressable
          style={({ pressed }) => [
            styles.refreshButton,
            pressed && styles.refreshButtonPressed,
          ]}
          onPress={handleRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color={Colors.dark.text} />
          ) : (
            <Feather name="refresh-cw" size={20} color={Colors.dark.text} />
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: insets.bottom + Spacing.tvSafeZone,
            paddingHorizontal: insets.left + Spacing.tvSafeZone,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.accent} />
          </View>
        ) : user ? (
          <>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.userIconContainer}>
                  <Feather name="user" size={32} color={Colors.dark.accent} />
                </View>
                <View style={styles.userInfo}>
                  <ThemedText type="h3" style={styles.username}>
                    {user.username}
                  </ThemedText>
                  <View style={styles.statusBadge}>
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: getStatusColor(user.status) },
                      ]}
                    />
                    <ThemedText
                      style={[
                        styles.statusText,
                        { color: getStatusColor(user.status) },
                      ]}
                    >
                      {user.status || "Unknown"}
                    </ThemedText>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <ThemedText type="h4" style={styles.cardTitle}>
                Subscription Details
              </ThemedText>
              <InfoRow
                label="Expiration Date"
                value={formatDate(user.exp_date)}
                icon="calendar"
              />
              <InfoRow
                label="Active Connections"
                value={`${user.active_cons || 0} / ${user.max_connections || "N/A"}`}
                icon="users"
              />
              <InfoRow
                label="Account Created"
                value={formatDate(user.created_at)}
                icon="clock"
              />
              <InfoRow
                label="Trial Account"
                value={user.is_trial === "1" ? "Yes" : "No"}
                icon="flag"
              />
            </View>

            {server ? (
              <View style={styles.card}>
                <ThemedText type="h4" style={styles.cardTitle}>
                  Server Info
                </ThemedText>
                <InfoRow
                  label="Server URL"
                  value={server.url || "N/A"}
                  icon="server"
                />
                <InfoRow
                  label="Port"
                  value={server.port || "N/A"}
                  icon="hash"
                />
                <InfoRow
                  label="Timezone"
                  value={server.timezone || "N/A"}
                  icon="globe"
                />
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.logoutButton,
                pressed && styles.logoutButtonPressed,
              ]}
              onPress={handleLogout}
            >
              <Feather name="log-out" size={20} color={Colors.dark.error} />
              <ThemedText style={styles.logoutButtonText}>Logout</ThemedText>
            </Pressable>
          </>
        ) : (
          <View style={styles.errorContainer}>
            <Feather name="alert-circle" size={48} color={Colors.dark.error} />
            <ThemedText style={styles.errorText}>
              Failed to load account info
            </ThemedText>
            <Pressable style={styles.retryButton} onPress={handleRefresh}>
              <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
            </Pressable>
          </View>
        )}
      </ScrollView>
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
    paddingBottom: Spacing.lg,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.lg,
  },
  backButtonPressed: {
    opacity: 0.7,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  headerTitle: {
    flex: 1,
    color: Colors.dark.text,
  },
  refreshButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    justifyContent: "center",
    alignItems: "center",
  },
  refreshButtonPressed: {
    opacity: 0.7,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  scrollContent: {
    paddingTop: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: Spacing["6xl"],
  },
  card: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    ...Shadows.card,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  userIconContainer: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.lg,
  },
  userInfo: {
    flex: 1,
  },
  username: {
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.sm,
  },
  statusText: {
    fontSize: 14,
    textTransform: "capitalize",
  },
  cardTitle: {
    color: Colors.dark.text,
    marginBottom: Spacing.lg,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    marginBottom: Spacing.xs,
  },
  infoValue: {
    color: Colors.dark.text,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.error,
    marginTop: Spacing.xl,
  },
  logoutButtonPressed: {
    opacity: 0.8,
    backgroundColor: "rgba(244, 67, 54, 0.1)",
  },
  logoutButtonText: {
    color: Colors.dark.error,
    marginLeft: Spacing.sm,
    fontWeight: "600",
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: Spacing["6xl"],
  },
  errorText: {
    color: Colors.dark.error,
    marginTop: Spacing.lg,
    textAlign: "center",
  },
  retryButton: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing["2xl"],
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.accent,
    borderRadius: BorderRadius.sm,
  },
  retryButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
});
