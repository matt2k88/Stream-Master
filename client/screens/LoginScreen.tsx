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

  const padH = Math.max(insets.left + Spacing.lg, Spacing.xl);
  const padT = Math.max(insets.top + Spacing.sm, Spacing.lg);
  const padB = Math.max(insets.bottom + Spacing.sm, Spacing.lg);

  return (
    <ThemedView style={styles.container}>
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
        {isLandscape ? (
          <View style={styles.brandSideLandscape}>
            <Image
              source={require("../../assets/images/icon.png")}
              style={styles.logoLandscape}
              resizeMode="contain"
            />
            <ThemedText type="h2" style={styles.title}>
              IPTV Player
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              Xtream Codes credentials
            </ThemedText>
          </View>
        ) : (
          <View style={styles.brandTopPortrait}>
            <Image
              source={require("../../assets/images/icon.png")}
              style={styles.logoPortrait}
              resizeMode="contain"
            />
            <ThemedText type="h2" style={styles.title}>
              IPTV Player
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              Enter your Xtream Codes credentials
            </ThemedText>
          </View>
        )}

        <View style={[styles.formContainer, isLandscape && styles.formContainerLandscape]}>
          <View style={styles.inputContainer}>
            <ThemedText style={styles.label}>Server URL</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="http://example.com:port"
              placeholderTextColor={Colors.dark.textSecondary}
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!isLoading}
            />
          </View>

          <View style={styles.inputContainer}>
            <ThemedText style={styles.label}>Username</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="Enter username"
              placeholderTextColor={Colors.dark.textSecondary}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />
          </View>

          <View style={styles.inputContainer}>
            <ThemedText style={styles.label}>Password</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="Enter password"
              placeholderTextColor={Colors.dark.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.loginButton,
              pressed && styles.loginButtonPressed,
              isLoading && styles.loginButtonDisabled,
            ]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={Colors.dark.buttonText} size="small" />
            ) : (
              <ThemedText style={styles.loginButtonText}>Login</ThemedText>
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xl,
  },
  brandTopPortrait: {
    alignItems: "center",
  },
  brandSideLandscape: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingRight: Spacing.xl,
  },
  logoPortrait: {
    width: 64,
    height: 64,
    marginBottom: Spacing.sm,
  },
  logoLandscape: {
    width: 72,
    height: 72,
    marginBottom: Spacing.md,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  subtitle: {
    color: Colors.dark.textSecondary,
    textAlign: "center",
    fontSize: 14,
  },
  formContainer: {
    width: "100%",
    maxWidth: 480,
  },
  formContainerLandscape: {
    flex: 1,
  },
  inputContainer: {
    width: "100%",
    marginBottom: Spacing.md,
  },
  label: {
    marginBottom: Spacing.xs,
    color: Colors.dark.textSecondary,
    fontSize: 14,
  },
  input: {
    width: "100%",
    height: 48,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    color: Colors.dark.text,
    fontSize: Typography.body.fontSize,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  errorContainer: {
    width: "100%",
    backgroundColor: "rgba(244, 67, 54, 0.1)",
    borderRadius: BorderRadius.xs,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  errorText: {
    color: Colors.dark.error,
    textAlign: "center",
    fontSize: 14,
  },
  loginButton: {
    width: "100%",
    height: 48,
    backgroundColor: Colors.dark.accent,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.xs,
  },
  loginButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: Colors.dark.buttonText,
    fontSize: Typography.button.fontSize,
    fontWeight: Typography.button.fontWeight,
  },
});
