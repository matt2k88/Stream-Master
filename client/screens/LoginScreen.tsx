import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Image,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useAuth } from "@/contexts/AuthContext";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { LinearGradient } from "expo-linear-gradient";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const { login } = useAuth();
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!serverUrl.trim() || !username.trim() || !password.trim()) {
      setError("Please fill in all fields");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      await login({
        serverUrl: serverUrl.trim(),
        username: username.trim(),
        password: password.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  const padH = Math.max(insets.left + Spacing.sm, Spacing.xl);
  const padT = Math.max(insets.top + Spacing.sm, Spacing.lg);
  const padB = Math.max(insets.bottom + Spacing.sm, Spacing.lg);

  const inputStyle = (field: string) => [
    styles.input,
    focusedField === field && styles.inputFocused,
  ];

  return (
    <ThemedView style={styles.container}>
      {/* Subtle orange glow at top */}
      <LinearGradient
        colors={["rgba(255,102,0,0.08)", "transparent"]}
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
        {/* Brand side */}
        <View style={[styles.brand, isLandscape ? styles.brandLandscape : styles.brandPortrait]}>
          <Image
            source={require("../../assets/images/icon.png")}
            style={isLandscape ? styles.logoLarge : styles.logoSmall}
            resizeMode="contain"
          />
          <ThemedText style={styles.appName}>Ultra Cast</ThemedText>
          <ThemedText style={styles.appVersion}>v3</ThemedText>
          {isLandscape ? (
            <ThemedText style={styles.tagline}>Your stream. Your way.</ThemedText>
          ) : null}
        </View>

        {/* Form */}
        <View style={[styles.form, isLandscape && styles.formLandscape]}>
          <ThemedText style={styles.formTitle}>Sign In</ThemedText>
          <ThemedText style={styles.formSubtitle}>Enter your Xtream Codes credentials</ThemedText>

          <View style={styles.field}>
            <ThemedText style={styles.label}>Server URL</ThemedText>
            <TextInput
              style={inputStyle("url")}
              placeholder="http://example.com:port"
              placeholderTextColor={Colors.dark.border}
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!isLoading}
              onFocus={() => setFocusedField("url")}
              onBlur={() => setFocusedField(null)}
            />
          </View>

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
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.loginBtn, pressed && styles.loginBtnPressed, isLoading && styles.loginBtnDisabled]}
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
              <ThemedText style={styles.loginBtnText}>Connect</ThemedText>
            )}
          </Pressable>
        </View>
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
    height: 200,
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
  form: {
    width: "100%",
    maxWidth: 460,
  },
  formLandscape: {
    flex: 1,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  formSubtitle: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xl,
  },
  field: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xs,
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
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  errorBox: {
    backgroundColor: "rgba(255, 59, 59, 0.1)",
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    borderColor: "rgba(255, 59, 59, 0.3)",
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  errorText: {
    color: Colors.dark.error,
    fontSize: 13,
    textAlign: "center",
  },
  loginBtn: {
    height: 50,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    marginTop: Spacing.xs,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  loginBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  loginBtnDisabled: {
    opacity: 0.5,
  },
  loginBtnText: {
    color: "#fff",
    fontSize: Typography.button.fontSize,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
