import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Image,
  FlatList,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useAuth } from "@/contexts/AuthContext";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { LinearGradient } from "expo-linear-gradient";
import { fetchServers, IptvServer } from "@/lib/supabase";

type Step = "server" | "credentials";

function ServerCard({
  server,
  selected,
  onPress,
}: {
  server: IptvServer;
  selected: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = selected || focused || pressed;

  return (
    <Pressable
      style={[styles.serverCard, isActive && styles.serverCardActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {isActive ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.18)", "rgba(255,102,0,0.04)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}

      <View style={styles.serverCardLeft}>
        {server.logo_url ? (
          <Image
            source={{ uri: server.logo_url }}
            style={styles.serverLogo}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.serverLogoPlaceholder, isActive && styles.serverLogoPlaceholderActive]}>
            <Feather name="server" size={18} color={isActive ? Colors.dark.accent : Colors.dark.textSecondary} />
          </View>
        )}
        <ThemedText style={[styles.serverName, isActive && styles.serverNameActive]} numberOfLines={1}>
          {server.name}
        </ThemedText>
      </View>

      <View style={[styles.serverRadio, isActive && styles.serverRadioActive]}>
        {selected ? <View style={styles.serverRadioDot} /> : null}
      </View>

      {isActive ? <View style={styles.serverCardBar} /> : null}
    </Pressable>
  );
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const { login } = useAuth();

  const [step, setStep] = useState<Step>("server");
  const [servers, setServers] = useState<IptvServer[]>([]);
  const [serversLoading, setServersLoading] = useState(true);
  const [serversError, setServersError] = useState("");

  const [selectedServer, setSelectedServer] = useState<IptvServer | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const padH = Math.max(insets.left + Spacing.sm, Spacing.xl);
  const padT = Math.max(insets.top + Spacing.sm, Spacing.lg);
  const padB = Math.max(insets.bottom + Spacing.sm, Spacing.lg);

  const loadServers = useCallback(async () => {
    setServersLoading(true);
    setServersError("");
    try {
      const data = await fetchServers();
      setServers(data);
    } catch (err) {
      setServersError(err instanceof Error ? err.message : "Failed to load servers");
    } finally {
      setServersLoading(false);
    }
  }, []);

  useEffect(() => { loadServers(); }, [loadServers]);

  const handleSelectServer = (server: IptvServer) => {
    setSelectedServer(server);
    setError("");
  };

  const handleContinue = () => {
    if (!selectedServer) {
      setError("Please select a server");
      return;
    }
    setError("");
    setStep("credentials");
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError("Please enter your username and password");
      return;
    }
    if (!selectedServer) return;
    setIsLoading(true);
    setError("");
    try {
      await login({
        serverUrl: selectedServer.server_url,
        username: username.trim(),
        password: password.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setStep("server");
    setError("");
    setUsername("");
    setPassword("");
  };

  const inputStyle = (field: string) => [
    styles.input,
    focusedField === field && styles.inputFocused,
  ];

  return (
    <ThemedView style={styles.container}>
      <LinearGradient
        colors={["rgba(255,102,0,0.07)", "transparent"]}
        style={styles.topGlow}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
      />

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: padT,
            paddingBottom: padB,
            paddingHorizontal: padH,
            flexDirection: isLandscape ? "row" : "column",
          },
        ]}
      >
        {/* Brand panel */}
        <View style={[styles.brand, isLandscape ? styles.brandLandscape : styles.brandPortrait]}>
          <Image
            source={require("../../assets/images/icon.png")}
            style={isLandscape ? styles.logoLarge : styles.logoSmall}
            resizeMode="contain"
          />
          <View style={isLandscape ? { alignItems: "center" } : { flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <ThemedText style={styles.appName}>Ultra Cast</ThemedText>
            <ThemedText style={styles.appVersion}>v3</ThemedText>
          </View>
          {isLandscape ? (
            <ThemedText style={styles.tagline}>Your stream. Your way.</ThemedText>
          ) : null}
        </View>

        {/* Step: Server selection */}
        {step === "server" ? (
          <View style={[styles.panel, isLandscape && styles.panelLandscape]}>
            <ThemedText style={styles.panelTitle}>Choose a Server</ThemedText>
            <ThemedText style={styles.panelSubtitle}>Select your IPTV provider</ThemedText>

            {serversLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={Colors.dark.accent} size="large" />
                <ThemedText style={styles.loadingText}>Loading servers...</ThemedText>
              </View>
            ) : serversError ? (
              <View style={styles.centered}>
                <Feather name="alert-circle" size={32} color={Colors.dark.error} />
                <ThemedText style={styles.errorText}>{serversError}</ThemedText>
                <Pressable style={styles.retryBtn} onPress={loadServers}>
                  <ThemedText style={styles.retryBtnText}>Retry</ThemedText>
                </Pressable>
              </View>
            ) : servers.length === 0 ? (
              <View style={styles.centered}>
                <Feather name="server" size={32} color={Colors.dark.textSecondary} />
                <ThemedText style={styles.emptyText}>No servers available</ThemedText>
              </View>
            ) : (
              <FlatList
                data={servers}
                keyExtractor={(s) => s.id}
                style={styles.serverList}
                contentContainerStyle={{ gap: Spacing.sm }}
                showsVerticalScrollIndicator={false}
                scrollEnabled={servers.length > 4}
                renderItem={({ item }) => (
                  <ServerCard
                    server={item}
                    selected={selectedServer?.id === item.id}
                    onPress={() => handleSelectServer(item)}
                  />
                )}
              />
            )}

            {error ? (
              <View style={styles.errorBox}>
                <ThemedText style={styles.errorBoxText}>{error}</ThemedText>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.primaryBtnPressed,
                (!selectedServer || serversLoading) && styles.primaryBtnDisabled,
              ]}
              onPress={handleContinue}
              disabled={!selectedServer || serversLoading}
            >
              <LinearGradient
                colors={["#FF8C1A", "#FF5500"]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              />
              <ThemedText style={styles.primaryBtnText}>Continue</ThemedText>
              <Feather name="arrow-right" size={18} color="#fff" />
            </Pressable>
          </View>
        ) : (
          /* Step: Credentials */
          <View style={[styles.panel, isLandscape && styles.panelLandscape]}>
            {/* Selected server indicator */}
            <Pressable style={styles.selectedServerRow} onPress={handleBack}>
              {selectedServer?.logo_url ? (
                <Image source={{ uri: selectedServer.logo_url }} style={styles.selectedServerLogo} resizeMode="contain" />
              ) : (
                <View style={styles.selectedServerIcon}>
                  <Feather name="server" size={14} color={Colors.dark.accent} />
                </View>
              )}
              <ThemedText style={styles.selectedServerName} numberOfLines={1}>
                {selectedServer?.name}
              </ThemedText>
              <Feather name="chevron-down" size={14} color={Colors.dark.textSecondary} />
            </Pressable>

            <ThemedText style={styles.panelTitle}>Sign In</ThemedText>
            <ThemedText style={styles.panelSubtitle}>Enter your credentials for {selectedServer?.name}</ThemedText>

            <View style={styles.field}>
              <ThemedText style={styles.label}>Username</ThemedText>
              <TextInput
                style={inputStyle("user")}
                placeholder="Enter username"
                placeholderTextColor={Colors.dark.border}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
                onFocus={() => setFocusedField("user")}
                onBlur={() => setFocusedField(null)}
              />
            </View>

            <View style={styles.field}>
              <ThemedText style={styles.label}>Password</ThemedText>
              <TextInput
                style={inputStyle("pass")}
                placeholder="Enter password"
                placeholderTextColor={Colors.dark.border}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
                onFocus={() => setFocusedField("pass")}
                onBlur={() => setFocusedField(null)}
              />
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <ThemedText style={styles.errorBoxText}>{error}</ThemedText>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.primaryBtnPressed,
                isLoading && styles.primaryBtnDisabled,
              ]}
              onPress={handleLogin}
              disabled={isLoading}
            >
              <LinearGradient
                colors={["#FF8C1A", "#FF5500"]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              />
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <ThemedText style={styles.primaryBtnText}>Connect</ThemedText>
                  <Feather name="arrow-right" size={18} color="#fff" />
                </>
              )}
            </Pressable>

            <Pressable style={styles.backBtn} onPress={handleBack} disabled={isLoading}>
              <Feather name="arrow-left" size={14} color={Colors.dark.textSecondary} />
              <ThemedText style={styles.backBtnText}>Back to servers</ThemedText>
            </Pressable>
          </View>
        )}
      </KeyboardAwareScrollViewCompat>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  topGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 220,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing["2xl"],
  },
  brand: {
    alignItems: "center",
  },
  brandPortrait: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    alignSelf: "flex-start",
  },
  brandLandscape: {
    flex: 1,
    justifyContent: "center",
    paddingRight: Spacing.xl,
    gap: Spacing.sm,
  },
  logoSmall: {
    width: 44,
    height: 44,
  },
  logoLarge: {
    width: 80,
    height: 80,
    marginBottom: Spacing.sm,
  },
  appName: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 0.5,
  },
  appVersion: {
    fontSize: 12,
    color: Colors.dark.accent,
    fontWeight: "700",
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.sm,
  },
  panel: {
    width: "100%",
    maxWidth: 460,
    gap: Spacing.md,
  },
  panelLandscape: {
    flex: 1,
  },
  panelTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: 0,
  },
  panelSubtitle: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    marginTop: -Spacing.xs,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
  },
  emptyText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
  },
  errorText: {
    color: Colors.dark.error,
    fontSize: 13,
    textAlign: "center",
  },
  retryBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.accentDim,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.3)",
  },
  retryBtnText: {
    color: Colors.dark.accent,
    fontWeight: "600",
    fontSize: 13,
  },
  serverList: {
    maxHeight: 260,
  },
  serverCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    overflow: "hidden",
    gap: Spacing.sm,
  },
  serverCardActive: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  serverCardLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  serverLogo: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.xs,
  },
  serverLogoPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
  },
  serverLogoPlaceholderActive: {
    backgroundColor: Colors.dark.accentDim,
    borderColor: "rgba(255,102,0,0.3)",
  },
  serverName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  serverNameActive: {
    color: Colors.dark.text,
  },
  serverRadio: {
    width: 20,
    height: 20,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
  },
  serverRadioActive: {
    borderColor: Colors.dark.accent,
  },
  serverRadioDot: {
    width: 10,
    height: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  serverCardBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  selectedServerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.3)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    alignSelf: "flex-start",
  },
  selectedServerIcon: {
    width: 22,
    height: 22,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.dark.accentDim,
    justifyContent: "center",
    alignItems: "center",
  },
  selectedServerLogo: {
    width: 22,
    height: 22,
    borderRadius: BorderRadius.xs,
  },
  selectedServerName: {
    color: Colors.dark.accent,
    fontSize: 12,
    fontWeight: "600",
    maxWidth: 180,
  },
  field: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  input: {
    height: 48,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    color: Colors.dark.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  inputFocused: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.backgroundSecondary,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  errorBox: {
    backgroundColor: "rgba(255, 59, 59, 0.1)",
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    borderColor: "rgba(255, 59, 59, 0.3)",
    padding: Spacing.sm,
  },
  errorBoxText: {
    color: Colors.dark.error,
    fontSize: 13,
    textAlign: "center",
  },
  primaryBtn: {
    height: 50,
    borderRadius: BorderRadius.sm,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    gap: Spacing.sm,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  primaryBtnDisabled: {
    opacity: 0.4,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: Typography.button.fontSize,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  backBtnText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
  },
});
