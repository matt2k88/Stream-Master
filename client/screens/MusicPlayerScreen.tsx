import React, { useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/theme";
import SideMenuButton from "@/components/SideMenuButton";

const MUSIC_URL = "https://appsnbits.com/WTCbeats/music/login.php";

// ── Web: plain iframe ──────────────────────────────────────────────────────────
function WebFrame() {
  const [loading, setLoading] = useState(true);
  return (
    <View style={StyleSheet.absoluteFill}>
      {loading ? (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator size="large" color={Colors.dark.accent} />
        </View>
      ) : null}
      {/* React Native Web allows creating real DOM elements via createElement */}
      {React.createElement("iframe", {
        src: MUSIC_URL,
        style: {
          flex: 1,
          width: "100%",
          height: "100%",
          border: "none",
          backgroundColor: "#000",
        },
        allow: "autoplay; fullscreen; encrypted-media",
        onLoad: () => setLoading(false),
      })}
    </View>
  );
}

// ── Native: react-native-webview ───────────────────────────────────────────────
function NativeFrame() {
  // Lazy import so web bundle never tries to resolve the native module
  const { WebView } = require("react-native-webview");
  const [loading, setLoading] = useState(true);

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        source={{ uri: MUSIC_URL }}
        style={styles.webview}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        userAgent={
          Platform.OS === "android"
            ? "Mozilla/5.0 (Linux; Android 9; Build/PPR2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
            : undefined
        }
      />
      {loading ? (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator size="large" color={Colors.dark.accent} />
        </View>
      ) : null}
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────
export default function MusicPlayerScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      {Platform.OS === "web" ? <WebFrame /> : <NativeFrame />}

      {/* Menu button always floats above the web content */}
      <View
        style={[
          styles.menuBar,
          { paddingTop: insets.top + 6, paddingLeft: insets.left + 10 },
        ]}
      >
        <SideMenuButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  menuBar: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 10,
  },
  webview: {
    flex: 1,
    backgroundColor: "#000",
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    zIndex: 5,
  },
});
