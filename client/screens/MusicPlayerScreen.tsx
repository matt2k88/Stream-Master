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

// ── Virtual cursor injected into the WebView ──────────────────────────────────
// A fixed orange dot that moves with the D-pad and fires real mouse events
// (mouseover, mousedown, mouseup, click) at its current position, so every
// element on the page is reachable regardless of keyboard-focusability.
const TV_CURSOR_JS = `
(function () {
  if (window.__tvCursorReady) return;
  window.__tvCursorReady = true;

  /* ── 1. Create cursor dot ── */
  var cur = document.createElement('div');
  cur.style.cssText =
    'position:fixed;z-index:2147483647;pointer-events:none;' +
    'width:22px;height:22px;border-radius:50%;' +
    'background:rgba(255,102,0,0.92);' +
    'border:2px solid #fff;' +
    'box-shadow:0 0 0 3px #FF6600,0 0 14px 4px rgba(255,102,0,0.55);' +
    'transform:translate(-50%,-50%);' +
    'transition:left 60ms linear,top 60ms linear;';

  /* inner cross-hair */
  var ch = document.createElement('div');
  ch.style.cssText =
    'position:absolute;top:50%;left:50%;' +
    'width:6px;height:6px;margin:-3px 0 0 -3px;' +
    'border-radius:50%;background:#fff;';
  cur.appendChild(ch);

  /* ── 2. Place cursor at viewport centre ── */
  var vx = Math.round(window.innerWidth  / 2);
  var vy = Math.round(window.innerHeight / 2);

  function applyPos() {
    cur.style.left = vx + 'px';
    cur.style.top  = vy + 'px';
  }

  function mount() {
    if (document.body && !document.getElementById('__tv_cur__')) {
      cur.id = '__tv_cur__';
      document.body.appendChild(cur);
      applyPos();
    }
  }
  mount();
  document.addEventListener('DOMContentLoaded', mount);

  /* ── 3. Step size — increases while key is held ── */
  var STEP_BASE = 48;
  var STEP_FAST = 96;
  var pressStart = {};

  /* ── 4. Fire mouse events at current cursor position ── */
  function dispatchMouse(type, el) {
    try {
      el.dispatchEvent(new MouseEvent(type, {
        bubbles: true, cancelable: true, view: window,
        clientX: vx, clientY: vy, screenX: vx, screenY: vy,
      }));
    } catch(e) {}
  }

  var lastHover = null;

  function hover() {
    cur.style.display = 'none'; /* hide so elementFromPoint works through it */
    var el = document.elementFromPoint(vx, vy);
    cur.style.display = '';
    if (!el) return;

    /* update cursor shape: pointer over clickable, crosshair otherwise */
    var cs = window.getComputedStyle(el).cursor;
    cur.style.width  = (cs === 'pointer') ? '28px' : '22px';
    cur.style.height = (cs === 'pointer') ? '28px' : '22px';

    if (el !== lastHover) {
      if (lastHover) {
        dispatchMouse('mouseleave', lastHover);
        dispatchMouse('mouseout',   lastHover);
      }
      dispatchMouse('mouseover',  el);
      dispatchMouse('mouseenter', el);
      lastHover = el;
    }
    dispatchMouse('mousemove', el);
  }

  /* ── 5. Key handler ── */
  document.addEventListener('keydown', function (e) {
    var STEP = (Date.now() - (pressStart[e.keyCode] || Date.now())) > 600
               ? STEP_FAST : STEP_BASE;

    if (!pressStart[e.keyCode]) pressStart[e.keyCode] = Date.now();

    if (e.keyCode === 37) {        /* LEFT  */
      e.preventDefault();
      vx = Math.max(1, vx - STEP);
    } else if (e.keyCode === 39) { /* RIGHT */
      e.preventDefault();
      vx = Math.min(window.innerWidth  - 1, vx + STEP);
    } else if (e.keyCode === 38) { /* UP    */
      e.preventDefault();
      vy = Math.max(1, vy - STEP);
    } else if (e.keyCode === 40) { /* DOWN  */
      e.preventDefault();
      vy = Math.min(window.innerHeight - 1, vy + STEP);
    } else if (e.keyCode === 13) { /* ENTER / centre button */
      cur.style.display = 'none';
      var target = document.elementFromPoint(vx, vy);
      cur.style.display = '';
      if (target) {
        dispatchMouse('mousedown', target);
        dispatchMouse('mouseup',   target);
        dispatchMouse('click',     target);
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
            || target.tagName === 'SELECT') {
          target.focus();
        }
      }
      return;
    } else {
      return;
    }

    applyPos();
    hover();
  }, true);

  document.addEventListener('keyup', function (e) {
    delete pressStart[e.keyCode];
  }, true);

  /* ── 6. Focus ring for text inputs that the cursor clicks into ── */
  var sty = document.createElement('style');
  sty.textContent =
    'input:focus,textarea:focus,select:focus{' +
    'outline:3px solid #FF6600!important;' +
    'outline-offset:2px!important;}';
  (document.head || document.documentElement).appendChild(sty);

  /* ── 7. Re-attach cursor after SPA navigation wipes document.body ── */
  if (window.MutationObserver) {
    new MutationObserver(mount)
      .observe(document.documentElement, { childList: true, subtree: false });
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

// ── Native / Fire TV: WebView with virtual cursor ─────────────────────────────
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
        injectedJavaScript={TV_CURSOR_JS}
        injectedJavaScriptBeforeContentLoaded={`window.__tvCursorReady=false;true;`}
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
