import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Colors } from "@/constants/theme";

const MUSIC_URL = "https://appsnbits.com/UltraMusic/customer_login.php";

// ── Spatial D-pad navigation — mirrors how Silk browser navigates ─────────────
// For each arrow key press we find every focusable element, filter to those
// that are genuinely in the pressed direction, then pick the closest one using
// a weighted score that strongly penalises off-axis drift.
const TV_NAV_JS = `
(function () {
  if (window.__tvNavReady) return;
  window.__tvNavReady = true;

  /* 1 ── Visible focus ring */
  var s = document.createElement('style');
  s.textContent =
    '*:focus{outline:3px solid #FF6600!important;outline-offset:3px!important;' +
    'box-shadow:0 0 0 6px rgba(255,102,0,0.22)!important;border-radius:4px!important;}';
  (document.head || document.documentElement).appendChild(s);

  /* 2 ── Collect visible, interactive elements */
  var SEL = 'a[href],button,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"]),[role=button],[role=link],[role=menuitem],[role=tab],[role=option]';

  function getFocusables() {
    return Array.prototype.filter.call(document.querySelectorAll(SEL), function (el) {
      if (el.disabled) return false;
      var r = el.getBoundingClientRect();
      /* must have non-zero area and be inside the viewport */
      return r.width > 0 && r.height > 0 &&
             r.bottom > 0 && r.right > 0 &&
             r.top < window.innerHeight && r.left < window.innerWidth;
    });
  }

  /* 3 ── Centre of a DOMRect */
  function centre(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  /* 4 ── Spatial scoring: lower = better
          Primary axis distance weighted 1×, perpendicular 2.5× so the
          element straight ahead always wins over one that is diagonally near. */
  function score(fromC, toR, axis) {
    var toC = centre(toR);
    var dx = toC.x - fromC.x;
    var dy = toC.y - fromC.y;
    if (axis === 'h') return Math.abs(dx) + Math.abs(dy) * 2.5;
    return Math.abs(dy) + Math.abs(dx) * 2.5;
  }

  /* 5 ── Find best candidate in a given direction */
  function spatialNext(direction) {
    var cur = document.activeElement;
    var els = getFocusables();
    if (!els.length) return null;

    /* If nothing is focused yet, return the first element */
    if (!cur || cur === document.body || cur === document.documentElement) {
      return els[0];
    }

    var curR = cur.getBoundingClientRect();
    var curC = centre(curR);
    var best = null;
    var bestScore = Infinity;

    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el === cur) continue;
      var r = el.getBoundingClientRect();
      var c = centre(r);

      /* Must be strictly in the pressed direction
         (allow 20 px overlap to handle nearly-aligned rows/columns) */
      var ok = false;
      if (direction === 'right' && c.x > curC.x + 5)  ok = true;
      if (direction === 'left'  && c.x < curC.x - 5)  ok = true;
      if (direction === 'down'  && c.y > curC.y + 5)   ok = true;
      if (direction === 'up'    && c.y < curC.y - 5)   ok = true;
      if (!ok) continue;

      var sc = score(curC, r, (direction === 'left' || direction === 'right') ? 'h' : 'v');
      if (sc < bestScore) { bestScore = sc; best = el; }
    }
    return best;
  }

  /* 6 ── Focus helper: scroll the element into view and focus it */
  function moveTo(el) {
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    el.focus({ preventScroll: true });
  }

  /* 7 ── Key handler */
  document.addEventListener('keydown', function (e) {
    var dir = null;
    if (e.keyCode === 37) dir = 'left';
    else if (e.keyCode === 38) dir = 'up';
    else if (e.keyCode === 39) dir = 'right';
    else if (e.keyCode === 40) dir = 'down';

    if (dir) {
      var target = spatialNext(dir);
      if (target) {
        e.preventDefault();
        moveTo(target);
      }
      return;
    }

    /* Enter / centre-button → click (skip for text inputs) */
    if (e.keyCode === 13) {
      var cur = document.activeElement;
      if (cur && cur !== document.body) {
        var tag = cur.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault();
          cur.click();
        }
      }
    }
  }, true);

  /* 8 ── Auto-focus first element after page finishes loading */
  function focusFirst() {
    var els = getFocusables();
    if (els.length && (!document.activeElement || document.activeElement === document.body)) {
      moveTo(els[0]);
    }
  }
  if (document.readyState === 'complete') { focusFirst(); }
  else { window.addEventListener('load', focusFirst); }

  /* 9 ── Re-run after SPA content changes */
  if (window.MutationObserver) {
    new MutationObserver(function () {
      if (!document.activeElement || document.activeElement === document.body) {
        focusFirst();
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  true;
})();
`;

// ── Web (Replit preview): plain iframe ───────────────────────────────────────
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
        style: { flex: 1, width: "100%", height: "100%", border: "none", backgroundColor: "#000" },
        allow: "autoplay; fullscreen; encrypted-media",
        onLoad: () => setLoading(false),
      })}
    </View>
  );
}

// ── Native / Fire TV: WebView with spatial D-pad injection ────────────────────
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
