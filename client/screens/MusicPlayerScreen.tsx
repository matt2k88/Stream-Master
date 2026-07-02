import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Colors } from "@/constants/theme";

const MUSIC_URL = "https://appsnbits.com/WTCbeats/music/login.php";

// ── TV D-pad navigation injected into the WebView ────────────────────────────
const TV_NAV_JS = `
(function () {
  if (window.__tvNavReady) return;
  window.__tvNavReady = true;

  var style = document.createElement('style');
  style.textContent = [
    '*:focus { outline: 3px solid #FF6600 !important; outline-offset: 3px !important;',
    '         box-shadow: 0 0 0 5px rgba(255,102,0,0.25) !important; }',
  ].join('');
  (document.head || document.documentElement).appendChild(style);

  var SEL = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function focusables() {
    return Array.prototype.slice
      .call(document.querySelectorAll(SEL))
      .filter(function (el) {
        return !el.disabled && el.offsetParent !== null;
      });
  }

  document.addEventListener('keydown', function (e) {
    var els = focusables();
    if (!els.length) return;

    var cur = document.activeElement;
    var idx = els.indexOf(cur);

    if (e.keyCode === 38 || e.keyCode === 37) {
      e.preventDefault();
      var prev = idx > 0 ? idx - 1 : els.length - 1;
      els[prev].focus();
      els[prev].scrollIntoView({ block: 'nearest' });
    } else if (e.keyCode === 40 || e.keyCode === 39) {
      e.preventDefault();
      var next = idx < els.length - 1 ? idx + 1 : 0;
      els[next].focus();
      els[next].scrollIntoView({ block: 'nearest' });
    } else if (e.keyCode === 13) {
      if (cur && cur !== document.body && cur.tagName !== 'INPUT'
          && cur.tagName !== 'TEXTAREA' && cur.tagName !== 'SELECT') {
        e.preventDefault();
        cur.click();
      }
    }
  }, true);

  function focusFirst() {
    var els = focusables();
    if (els.length) els[0].focus();
  }

  if (document.readyState === 'complete') {
    focusFirst();
  } else {
    window.addEventListener('load', focusFirst);
  }

  if (window.MutationObserver) {
    var observer = new MutationObserver(function () {
      if (!document.activeElement || document.activeElement === document.body) {
        focusFirst();
      }
    });
    observer.observe(document.body || document.documentElement, {
      childList: true, subtree: true
    });
  }

  true;
})();
`;

// ── Web: plain iframe ─────────────────────────────────────────────────────────
function WebFrame() {
  const [loading, setLoading] = useState(true);
  return (
    <View style={StyleSheet.absoluteFill}>
      {loading ? (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator size="large" color={Colors.dark.accent} />
        </View>
      ) : null}
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

// ── Native / Fire TV: WebView with D-pad injection ────────────────────────────
function NativeFrame() {
  const { WebView } = require("react-native-webview");
  const webRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        ref={webRef}
        source={{ uri: MUSIC_URL }}
        style={styles.webview}
        injectedJavaScript={TV_NAV_JS}
        injectedJavaScriptBeforeContentLoaded={`window.__tvNavReady=false;true;`}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => {
          setLoading(false);
          webRef.current?.requestFocus?.();
        }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={() => true}
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

// ── Screen ────────────────────────────────────────────────────────────────────
export default function MusicPlayerScreen() {
  const navigation = useNavigation();

  // Intercept back navigation and show exit confirmation
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      e.preventDefault();
      Alert.alert(
        "Exit Music Player",
        "Playback will stop if you exit the music player. Are you sure?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Exit",
            style: "destructive",
            onPress: () => navigation.dispatch(e.data.action),
          },
        ],
      );
    });
    return unsubscribe;
  }, [navigation]);

  return (
    <View style={styles.root}>
      {Platform.OS === "web" ? <WebFrame /> : <NativeFrame />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  webview: { flex: 1, backgroundColor: "#000" },
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    zIndex: 5,
  },
});
