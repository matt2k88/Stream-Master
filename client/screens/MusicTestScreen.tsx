import React from "react";
import { View, StyleSheet, BackHandler, Platform } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Colors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const MUSIC_TEST_URL = "https://youtube-music-player-ax3a.bolt.host/";

// react-native-webview is native-only; import lazily so web bundle doesn't break
let WebView: any = null;
if (Platform.OS !== "web") {
  WebView = require("react-native-webview").WebView;
}

export default function MusicTestScreen() {
  const navigation = useNavigation<NavigationProp>();

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

  // Web preview fallback — WebView only works on native (Android / Fire TV APK)
  if (Platform.OS === "web") {
    return (
      <View style={styles.container}>
        <View style={styles.webFallback}>
          <ThemedText style={styles.webFallbackTitle}>Music Test</ThemedText>
          <ThemedText style={styles.webFallbackBody}>
            This screen uses a native WebView which only works on Android / Fire TV.{"\n"}
            Open the app via Expo Go or the APK to play music here.
          </ThemedText>
          <ThemedText style={styles.webFallbackUrl}>{MUSIC_TEST_URL}</ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: MUSIC_TEST_URL }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        allowsFullscreenVideo
        mediaPlaybackRequiresUserGesture={false}
        allowsInlineMediaPlayback
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  webview: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  webFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  webFallbackTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.accent,
  },
  webFallbackBody: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  webFallbackUrl: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    opacity: 0.5,
    textAlign: "center",
  },
});
