import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, BackHandler, Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { LinearGradient } from "expo-linear-gradient";
import { useAccent } from "@/contexts/ThemeContext";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const MUSIC_TEST_URL = "https://youtube-music-player-ax3a.bolt.host/";

export default function MusicTestScreen() {
  const navigation = useNavigation<NavigationProp>();
  const accent = useAccent();
  const [opening, setOpening] = useState(false);

  const openPlayer = async () => {
    setOpening(true);
    try {
      await WebBrowser.openBrowserAsync(MUSIC_TEST_URL, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        showTitle: false,
        enableBarCollapsing: true,
      });
    } finally {
      setOpening(false);
    }
  };

  // Auto-open on first mount
  useEffect(() => {
    openPlayer();
  }, []);

  // Hardware back exits the screen
  useFocusEffect(
    React.useCallback(() => {
      if (Platform.OS !== "android") return;
      const handler = BackHandler.addEventListener("hardwareBackPress", () => {
        navigation.goBack();
        return true;
      });
      return () => handler.remove();
    }, [navigation]),
  );

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#0a0a0a", "#111111", "#0a0a0a"]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        <View style={[styles.iconCircle, { borderColor: accent.accent + "44", backgroundColor: accent.accentDim }]}>
          <Feather name="headphones" size={40} color={accent.accent} />
        </View>

        <ThemedText style={[styles.title, { color: accent.accent }]}>Music Test</ThemedText>
        <ThemedText style={styles.subtitle}>
          Opens in your device browser where YouTube playback is fully supported.
        </ThemedText>

        <Pressable
          style={({ pressed, focused }: any) => [
            styles.btn,
            { borderColor: accent.accent },
            (pressed || focused) && { backgroundColor: accent.accentDim },
          ]}
          onPress={openPlayer}
          disabled={opening}
        >
          <Feather name="external-link" size={18} color={accent.accent} />
          <ThemedText style={[styles.btnText, { color: accent.accent }]}>
            {opening ? "Opening…" : "Open Music Player"}
          </ThemedText>
        </Pressable>

        <Pressable
          style={({ pressed, focused }: any) => [
            styles.backBtn,
            (pressed || focused) && { opacity: 0.7 },
          ]}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={14} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.backBtnText}>Back</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
    padding: Spacing.xl,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 320,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    marginTop: Spacing.sm,
  },
  btnText: {
    fontSize: 16,
    fontWeight: "600",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.xs,
    padding: Spacing.sm,
  },
  backBtnText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
});
