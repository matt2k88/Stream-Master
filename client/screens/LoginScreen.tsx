import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useAuth } from "@/contexts/AuthContext";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
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

  return (
    <ThemedView style={styles.container}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + Spacing.tvSafeZone,
            paddingBottom: insets.bottom + Spacing.tvSafeZone,
            paddingLeft: insets.left + Spacing.tvSafeZone,
            paddingRight: insets.right + Spacing.tvSafeZone,
          },
        ]}
      >
        <View style={styles.formContainer}>
          <Image
            source={require("../../assets/images/icon.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <ThemedText type="h1" style={styles.title}>
            IPTV Player
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            Enter your Xtream Codes credentials
          </ThemedText>

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
  },
  formContainer: {
    width: "100%",
    maxWidth: 500,
    alignItems: "center",
    padding: Spacing["3xl"],
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: Spacing.xl,
  },
  title: {
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  subtitle: {
    color: Colors.dark.textSecondary,
    marginBottom: Spacing["3xl"],
    textAlign: "center",
  },
  inputContainer: {
    width: "100%",
    marginBottom: Spacing.lg,
  },
  label: {
    marginBottom: Spacing.sm,
    color: Colors.dark.textSecondary,
  },
  input: {
    width: "100%",
    height: Spacing.inputHeight,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    color: Colors.dark.text,
    fontSize: Typography.body.fontSize,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  errorContainer: {
    width: "100%",
    backgroundColor: "rgba(244, 67, 54, 0.1)",
    borderRadius: BorderRadius.xs,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  errorText: {
    color: Colors.dark.error,
    textAlign: "center",
  },
  loginButton: {
    width: "100%",
    height: Spacing.buttonHeight,
    backgroundColor: Colors.dark.accent,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.lg,
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
