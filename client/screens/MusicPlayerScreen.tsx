import React, { useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/theme";
import SideMenuButton from "@/components/SideMenuButton";

const MUSIC_URL = "https://appsnbits.com/WTCbeats/music/login.php";

export default function MusicPlayerScreen() {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);

  return (
    <View style={styles.root}>
      {/* Menu button — top-left, above the WebView */}
      <View
        style={[
          styles.menuBar,
          { paddingTop: insets.top + 6, paddingLeft: insets.left + 10 },
        ]}
      >
        <SideMenuButton />
      </View>

      {/* Full-screen WebView */}
      <WebView
        ref={webRef}
        source={{ uri: MUSIC_URL }}
        style={styles.webview}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState={false}
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
  },
});
