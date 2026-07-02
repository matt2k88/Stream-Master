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

// ── TV D-pad navigation injected into the WebView ────────────────────────────
// Adds a visible orange focus ring and handles arrow-key / Enter navigation
// across all interactive elements on the page.
const TV_NAV_JS = `
(function () {
  if (window.__tvNavReady) return;
  window.__tvNavReady = true;

  /* 1. Inject focus styles */
  var style = document.createElement('style');
  style.textContent = [
    '*:focus { outline: 3px solid #FF6600 !important; outline-offset: 3px !important;',
    '         box-shadow: 0 0 0 5px rgba(255,102,0,0.25) !important; }',
  ].join('');
  (document.head || document.documentElement).appendChild(style);

  /* 2. Collect all interactive elements in DOM order */
  var SEL = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function focusables() {
    return Array.prototype.slice
      .call(document.querySelectorAll(SEL))
      .filter(function (el) {
        return !el.disabled && el.offsetParent !== null;
      });
  }

  /* 3. Handle arrow keys + Enter */
  document.addEventListener('keydown', function (e) {
    var els = focusables();
    if (!els.length) return;

    var cur = document.activeElement;
    var idx = els.indexOf(cur);

    /* Up or Left → previous element */
    if (e.keyCode === 38 || e.keyCode === 37) {
      e.preventDefault();
      var prev = idx > 0 ? idx - 1 : els.length - 1;
      els[prev].focus();
      els[prev].scrollIntoView({ block: 'nearest' });

    /* Down or Right → next element */
    } else if (e.keyCode === 40 || e.keyCode === 39) {
      e.preventDefault();
      var next = idx < els.length - 1 ? idx + 1 : 0;
      els[next].focus();
      els[next].scrollIntoView({ block: 'nearest' });

    /* Enter / centre button → click */
    } else if (e.keyCode === 13) {
      if (cur && cur !== document.body && cur.tagName !== 'INPUT'
          && cur.tagName !== 'TEXTAREA' && cur.tagName !== 'SELECT') {
        e.preventDefault();
        cur.click();
      }
    }
  }, true);

  /* 4. Auto-focus the first interactive element after load */
  function focusFirst() {
    var els = focusables();
    if (els.length) els[0].focus();
  }

  if (document.readyState === 'complete') {
    focusFirst();
  } else {
    window.addEventListener('load', focusFirst);
  }

  /* 5. Re-run focus detection after dynamic DOM changes (SPAs) */
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

  true; // required by injectedJavaScript
})();
`;

// ── Web (Replit preview): plain iframe ────────────────────────────────────────
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

// ── Native / Fire TV: WebView with D-pad JS injection ────────────────────────
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
        // Inject TV nav script on every page load
        injectedJavaScript={TV_NAV_JS}
        injectedJavaScriptBeforeContentLoaded={`window.__tvNavReady=false;true;`}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => {
          setLoading(false);
          // Ensure WebView has focus so it receives D-pad events
          webRef.current?.requestFocus?.();
        }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        // Allow the remote's back button to navigate inside the WebView
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
  root: { flex: 1, backgroundColor: "#000" },
  menuBar: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 10,
  },
  webview: { flex: 1, backgroundColor: "#000" },
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    zIndex: 5,
  },
});
