import React, { useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, Pressable, Platform, useWindowDimensions } from "react-native";
import { WebView } from "react-native-webview";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useMusic } from "@/contexts/MusicContext";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

/**
 * MusicHost — the SINGLE YouTube IFrame WebView for the app, plus the
 * persistent mini-bar UI. Mounted once at the App root inside
 * MusicProvider so it survives every navigation and keeps audio playing
 * across screens. There is exactly one <WebView> instance; it is
 * repositioned/resized based on `expanded` so it never remounts.
 */

type Nav = NativeStackNavigationProp<RootStackParamList>;

const PLAYER_HTML = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"/></head><body style="margin:0;background:#000;overflow:hidden;">
<div id="player" style="width:100%;height:100%"></div>
<script>
  var tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
  var player = null;
  var pendingId = null;
  function post(obj){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(obj)); }catch(e){} }
  function mapState(s){ if(s===1)return 'playing'; if(s===2)return 'paused'; if(s===3)return 'loading'; if(s===0)return 'ended'; if(s===5)return 'paused'; return 'idle'; }
  function emitState(){ if(!player||!player.getCurrentTime) return; post({type:'state', state: mapState(player.getPlayerState()), position: player.getCurrentTime()||0, duration: player.getDuration()||0}); }
  window.onYouTubeIframeAPIReady = function(){
    player = new YT.Player('player', {
      height: '100%', width: '100%',
      videoId: pendingId || '',
      playerVars: { autoplay:1, playsinline:1, controls:0, modestbranding:1, rel:0, fs:0, iv_load_policy:3 },
      events: {
        onReady: function(e){ if(pendingId){ e.target.loadVideoById(pendingId); } emitState(); },
        onStateChange: function(e){ if(e.data===0){ post({type:'ended'}); } emitState(); },
        onError: function(){ post({type:'error'}); }
      }
    });
  };
  setInterval(emitState, 1000);
  function handleCmd(raw){
    try {
      var msg = JSON.parse(raw);
      if(!player || !player.loadVideoById){ if(msg.cmd==='load') pendingId = msg.videoId; return; }
      if(msg.cmd==='load'){ player.loadVideoById(msg.videoId); }
      if(msg.cmd==='play'){ player.playVideo(); }
      if(msg.cmd==='pause'){ player.pauseVideo(); }
      if(msg.cmd==='seek'){ player.seekTo(msg.value, true); }
    } catch(e){}
  }
  document.addEventListener('message', function(e){ handleCmd(e.data); });
  window.addEventListener('message', function(e){ handleCmd(e.data); });
</script>
</body></html>`;

const MINI_TILE_W = 96;
const MINI_TILE_H = 54;
const BAR_HEIGHT = 72;
const BAR_MARGIN = Spacing.md;

export default function MusicHost() {
  const {
    current, videoId, playState, expanded, fullscreen, position, duration,
    _registerController, _onPlayerEvent, resume, pause, next, previous, setExpanded,
  } = useMusic();
  const webRef = useRef<WebView>(null);
  const navigation = useNavigation<Nav>();
  const { width: winW, height: winH } = useWindowDimensions();

  const sendCmd = useCallback((obj: object) => {
    if (!webRef.current) return;
    const js = `(function(){ try { var e = new MessageEvent('message', { data: ${JSON.stringify(JSON.stringify(obj))} }); document.dispatchEvent(e); window.dispatchEvent(e); } catch(e){} })(); true;`;
    webRef.current.injectJavaScript(js);
  }, []);

  // Register controller so context can drive the WebView
  useEffect(() => {
    _registerController({
      load: (id) => sendCmd({ cmd: "load", videoId: id }),
      play: () => sendCmd({ cmd: "play" }),
      pause: () => sendCmd({ cmd: "pause" }),
      seek: (s) => sendCmd({ cmd: "seek", value: s }),
    });
    return () => _registerController(null);
  }, [_registerController, sendCmd]);

  // When videoId changes (new track resolved), push load
  useEffect(() => {
    if (videoId) sendCmd({ cmd: "load", videoId });
  }, [videoId, sendCmd]);

  const onMessage = useCallback((e: any) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      _onPlayerEvent(data);
    } catch {}
  }, [_onPlayerEvent]);

  if (!current) return null;

  const openNowPlaying = () => {
    setExpanded(true);
    navigation.navigate("NowPlaying");
  };

  // Compute the WebView's absolute position/size. Expanded → top of
  // NowPlaying area. Minimized → right edge of the mini bar.
  const expandedW = Math.min(winW - 32, 480);
  const expandedH = Math.round(expandedW * 9 / 16);
  const webStyle = fullscreen
    ? {
        position: "absolute" as const,
        top: 0, left: 0, width: winW, height: winH,
        backgroundColor: "#000",
      }
    : expanded
    ? {
        position: "absolute" as const,
        top: 80, left: (winW - expandedW) / 2,
        width: expandedW, height: expandedH,
        borderRadius: BorderRadius.md, overflow: "hidden" as const,
        backgroundColor: "#000",
      }
    : {
        position: "absolute" as const,
        right: BAR_MARGIN + Spacing.sm,
        bottom: BAR_MARGIN + (BAR_HEIGHT - MINI_TILE_H) / 2,
        width: MINI_TILE_W, height: MINI_TILE_H,
        borderRadius: 6, overflow: "hidden" as const,
        backgroundColor: "#000",
      };

  return (
    <View style={[styles.absRoot, { pointerEvents: "box-none" }]}>
      {/* Mini bar — hidden while expanded so NowPlaying owns the screen.
          The WebView (rendered below) stays mounted in both modes. */}
      {!expanded ? (
        <Pressable onPress={openNowPlaying} style={styles.bar}>
          {current.artwork_url ? (
            <Image source={{ uri: current.artwork_url }} style={styles.art} contentFit="cover" />
          ) : (
            <View style={[styles.art, styles.artFallback]}>
              <Feather name="music" size={18} color={Colors.dark.accent} />
            </View>
          )}
          <View style={styles.meta}>
            <ThemedText style={styles.title} numberOfLines={1}>{current.title}</ThemedText>
            <ThemedText style={styles.artist} numberOfLines={1}>
              {current.artist}{playState === "loading" ? " · loading…" : playState === "error" ? " · unavailable" : ""}
            </ThemedText>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${duration > 0 ? Math.min(100, (position / duration) * 100) : 0}%` }]} />
            </View>
          </View>
          <Pressable onPress={() => previous()} style={styles.ctrlBtn}>
            <Feather name="skip-back" size={18} color={Colors.dark.text} />
          </Pressable>
          <Pressable onPress={() => playState === "playing" ? pause() : resume()} style={styles.ctrlBtnLg}>
            <Feather name={playState === "playing" ? "pause" : "play"} size={22} color="#fff" />
          </Pressable>
          <Pressable onPress={() => next()} style={styles.ctrlBtn}>
            <Feather name="skip-forward" size={18} color={Colors.dark.text} />
          </Pressable>
          {/* Reserve space for the floating WebView tile so the bar layout doesn't shift */}
          <View style={{ width: MINI_TILE_W, height: MINI_TILE_H }} />
        </Pressable>
      ) : null}

      {/* Single WebView — never unmounts while a track exists. Repositioned
          via webStyle so toggling expanded does NOT remount. */}
      <View style={webStyle}>
        <WebView
          ref={webRef}
          source={{ html: PLAYER_HTML }}
          style={styles.web}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          onMessage={onMessage}
          androidLayerType="hardware"
          mixedContentMode="always"
          setSupportMultipleWindows={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  absRoot: {
    position: "absolute",
    left: 0, right: 0, bottom: 0, top: 0,
    zIndex: 999,
  },
  bar: {
    position: "absolute",
    left: BAR_MARGIN, right: BAR_MARGIN, bottom: BAR_MARGIN,
    height: BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    gap: Spacing.sm,
    backgroundColor: "#0F0F0F",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadius.md,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 10 },
      default: {},
    }),
  },
  art: { width: 56, height: 56, borderRadius: BorderRadius.sm, backgroundColor: "#1A1A1A" },
  artFallback: { alignItems: "center", justifyContent: "center" },
  meta: { flex: 1, justifyContent: "center", gap: 2 },
  title: { color: Colors.dark.text, fontSize: 13, fontWeight: "700" },
  artist: { color: Colors.dark.textSecondary, fontSize: 11 },
  progressTrack: { height: 2, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 1, marginTop: 4 },
  progressFill: { height: 2, backgroundColor: Colors.dark.accent, borderRadius: 1 },
  ctrlBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.sm },
  ctrlBtnLg: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.full, backgroundColor: Colors.dark.accent },
  web: { flex: 1, backgroundColor: "#000" },
});
