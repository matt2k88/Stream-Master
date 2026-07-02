import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Colors } from "@/constants/theme";

const MUSIC_URL = "https://appsnbits.com/UltraMusic/customer_login.php";

// ── Virtual cursor — rAF-based smooth movement with speed ramp ────────────────
// Uses a requestAnimationFrame loop so the cursor moves a tiny amount every
// frame based on held keys. Velocity ramps up the longer a key is held so
// short taps = precise small movement, holding = fast sweep.
const TV_CURSOR_JS = `
(function () {
  if (window.__tvCursorReady) return;
  window.__tvCursorReady = true;

  /* ── Cursor element: small orange ring, transparent centre ── */
  var cur = document.createElement('div');
  cur.id = '__tv_cur__';
  cur.style.cssText =
    'position:fixed;z-index:2147483647;pointer-events:none;' +
    'width:14px;height:14px;border-radius:50%;' +
    'background:transparent;' +
    'border:2.5px solid #FF6600;' +
    'box-shadow:0 0 5px 1px rgba(255,102,0,0.55);' +
    'transform:translate(-50%,-50%);' +
    'will-change:left,top;';

  var vx = window.innerWidth  - 40;
  var vy = 40;

  function mount() {
    if (document.body && !document.getElementById('__tv_cur__')) {
      document.body.appendChild(cur);
      cur.style.left = vx + 'px';
      cur.style.top  = vy + 'px';
    }
  }
  if (document.body) { mount(); }
  document.addEventListener('DOMContentLoaded', mount);
  if (window.MutationObserver) {
    new MutationObserver(mount)
      .observe(document.documentElement, { childList: true, subtree: false });
  }

  /* ── Track held keys ── */
  var held = {};       /* keyCode → true while pressed */
  var heldSince = {};  /* keyCode → timestamp of first press */

  document.addEventListener('keydown', function (e) {
    if (e.keyCode >= 37 && e.keyCode <= 40) {
      e.preventDefault();
      if (!held[e.keyCode]) {
        held[e.keyCode]      = true;
        heldSince[e.keyCode] = Date.now();
      }
    }
    /* ENTER / centre button → click at cursor */
    if (e.keyCode === 13) {
      cur.style.display = 'none';
      var t = document.elementFromPoint(vx, vy);
      cur.style.display = '';
      if (t) {
        ['mousedown','mouseup','click'].forEach(function (type) {
          t.dispatchEvent(new MouseEvent(type, {
            bubbles: true, cancelable: true,
            clientX: vx, clientY: vy,
          }));
        });
        if (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT') {
          t.focus();
        }
      }
    }
  }, true);

  document.addEventListener('keyup', function (e) {
    held[e.keyCode]      = false;
    heldSince[e.keyCode] = 0;
  }, true);

  /* ── Speed ramp ──
       px/frame at 60 fps:
         0 ms held  → ~1.5 px  (precise)
       400 ms held  → ~6 px
      1500 ms held  → ~16 px   (fast sweep)
     Uses a quadratic ease-in so the ramp feels natural.              */
  function speed(keyCode) {
    if (!held[keyCode]) return 0;
    var ms = Math.min(Date.now() - (heldSince[keyCode] || Date.now()), 1500);
    var t  = ms / 1500;           /* 0 → 1 */
    return 1.5 + t * t * 14.5;   /* 1.5 → 16  quadratic */
  }

  /* ── rAF loop ── */
  var lastHover = null;

  function frame() {
    var dx = speed(39) - speed(37);
    var dy = speed(40) - speed(38);

    if (dx !== 0 || dy !== 0) {
      vx = Math.max(1, Math.min(window.innerWidth  - 1, vx + dx));
      vy = Math.max(1, Math.min(window.innerHeight - 1, vy + dy));
      cur.style.left = vx + 'px';
      cur.style.top  = vy + 'px';

      /* fire hover events so the site reacts to the cursor position */
      cur.style.display = 'none';
      var el = document.elementFromPoint(vx, vy);
      cur.style.display = '';
      if (el) {
        if (el !== lastHover) {
          if (lastHover) {
            lastHover.dispatchEvent(new MouseEvent('mouseleave',{bubbles:false}));
            lastHover.dispatchEvent(new MouseEvent('mouseout',  {bubbles:true}));
          }
          el.dispatchEvent(new MouseEvent('mouseenter',{bubbles:false,clientX:vx,clientY:vy}));
          el.dispatchEvent(new MouseEvent('mouseover', {bubbles:true, clientX:vx,clientY:vy}));
          lastHover = el;
        }
        el.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:vx,clientY:vy}));
      }
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ── Focus ring for text inputs ── */
  var sty = document.createElement('style');
  sty.textContent =
    'input:focus,textarea:focus,select:focus{' +
    'outline:3px solid #FF6600!important;outline-offset:2px!important;}';
  (document.head || document.documentElement).appendChild(sty);

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
        // Inject cursor on TV and large screens (desktop/emulator); skip phones
        injectedJavaScript={
          (Platform.isTV || Dimensions.get('window').width > 768) ? TV_CURSOR_JS : undefined
        }
        injectedJavaScriptBeforeContentLoaded={
          (Platform.isTV || Dimensions.get('window').width > 768)
            ? `window.__tvCursorReady=false;true;`
            : undefined
        }
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
