import React, { useState, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  Image,
  Platform,
} from "react-native";
import WebView, { WebViewMessageEvent } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useNavigation } from "@react-navigation/native";
import { getApiUrl } from "@/lib/query-client";
import { LinearGradient } from "expo-linear-gradient";

interface Track {
  videoId: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail: string;
}

// YouTube embed player states (mirrors IFrame API)
const YT_UNSTARTED = -1;
const YT_ENDED = 0;
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;

function fmtTime(sec: number): string {
  if (!sec || isNaN(sec) || sec < 0) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Injected into the YouTube watch page to find the <video> element,
// dismiss cookie/consent dialogs, and relay playback events back via postMessage.
const INJECT_JS = `(function() {
  function post(obj) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(obj)); } catch(e) {}
  }

  // Click past GDPR consent / "Accept all" overlays
  function dismissOverlays() {
    try {
      var sel = [
        'button[aria-label*="Accept"]',
        'button[aria-label*="Agree"]',
        '.consent-bump-v2-lightbox button',
        'ytm-consent-bump-v2-renderer button',
        'tp-yt-paper-button[dialog-confirm]',
      ];
      for (var i = 0; i < sel.length; i++) {
        var el = document.querySelector(sel[i]);
        if (el) { el.click(); break; }
      }
      // Text-based fallback
      var btns = document.querySelectorAll('button, c3-material-button');
      for (var j = 0; j < btns.length; j++) {
        var t = (btns[j].textContent || '').trim().toLowerCase();
        if (t === 'accept all' || t === 'i agree' || t === 'agree') { btns[j].click(); break; }
      }
    } catch(e) {}
  }

  var vid = null;
  var lastFloor = -1;

  function attach(v) {
    if (vid === v) return;
    vid = v;
    v.addEventListener('playing', function() {
      post({ type:'state', state:1, currentTime:v.currentTime, duration:v.duration||0 });
    });
    v.addEventListener('pause', function() {
      if (!v.ended) post({ type:'state', state:2, currentTime:v.currentTime, duration:v.duration||0 });
    });
    v.addEventListener('ended', function() {
      post({ type:'state', state:0, currentTime:v.currentTime, duration:v.duration||0 });
    });
    v.addEventListener('waiting', function() {
      post({ type:'state', state:3, currentTime:v.currentTime, duration:v.duration||0 });
    });
    v.addEventListener('canplay', function() {
      post({ type:'ready', duration:v.duration||0 });
      v.play().catch(function(){});
    });
    v.addEventListener('timeupdate', function() {
      var f = Math.floor(v.currentTime);
      if (f !== lastFloor) { lastFloor = f; post({ type:'progress', currentTime:v.currentTime, duration:v.duration||0 }); }
    });
    v.addEventListener('error', function() {
      post({ type:'error', code: v.error ? v.error.code : -1 });
    });
    // Kick off play
    v.play().catch(function(){});
    if (v.readyState >= 2 && !isNaN(v.duration) && v.duration > 0) {
      post({ type:'ready', duration:v.duration });
    }
    post({ type:'debug', msg:'video attached, readyState='+v.readyState+' src='+v.src.substring(0,60) });
  }

  dismissOverlays();

  var obs = new MutationObserver(function() {
    dismissOverlays();
    var v = document.querySelector('video');
    if (v && v !== vid) attach(v);
  });
  obs.observe(document.documentElement, { childList:true, subtree:true });

  var v = document.querySelector('video');
  if (v) attach(v);

  window.ytCmd = function(cmd, val) {
    if (!vid) return;
    if (cmd==='play') vid.play().catch(function(){});
    else if (cmd==='pause') vid.pause();
    else if (cmd==='seek') { vid.currentTime = val; }
  };
})(); true;`;

function TrackRow({
  track,
  isActive,
  isLoading,
  onPress,
}: {
  track: Track;
  isActive: boolean;
  isLoading: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      style={[styles.trackRow, (isActive || focused) && styles.trackRowActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <View style={styles.thumbWrap}>
        {track.thumbnail ? (
          <Image source={{ uri: track.thumbnail }} style={styles.thumbImg} resizeMode="cover" />
        ) : (
          <View style={styles.thumbPlaceholder}>
            <Feather name="music" size={16} color={Colors.dark.textSecondary} />
          </View>
        )}
        {(isActive || isLoading) && (
          <View style={styles.thumbOverlay}>
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Feather name="volume-2" size={16} color="#fff" />
            )}
          </View>
        )}
      </View>

      <View style={styles.trackInfo}>
        <ThemedText
          style={[styles.trackTitle, isActive && styles.trackTitleActive]}
          numberOfLines={1}
        >
          {track.title}
        </ThemedText>
        <ThemedText style={styles.trackChannel} numberOfLines={1}>
          {track.channel}
        </ThemedText>
      </View>

      <ThemedText style={styles.trackDuration}>{fmtTime(track.duration)}</ThemedText>
    </Pressable>
  );
}

export default function MusicPlayerScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<number>(YT_UNSTARTED);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [streamError, setStreamError] = useState("");

  const inputRef = useRef<TextInput>(null);
  const webViewRef = useRef<WebView>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPlaying = playerState === YT_PLAYING;
  const isBuffering = playerState === YT_BUFFERING;
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  const jsPlay = useCallback(() => {
    webViewRef.current?.injectJavaScript('window.ytCmd("play"); true;');
  }, []);
  const jsPause = useCallback(() => {
    webViewRef.current?.injectJavaScript('window.ytCmd("pause"); true;');
  }, []);
  const jsSeek = useCallback((t: number) => {
    webViewRef.current?.injectJavaScript(`window.ytCmd("seek",${t}); true;`);
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "ready") {
        if (msg.duration) setDuration(msg.duration);
        setLoadingTrackId(null);
        if (loadTimeoutRef.current) { clearTimeout(loadTimeoutRef.current); loadTimeoutRef.current = null; }
      } else if (msg.type === "state") {
        setPlayerState(msg.state);
        if (msg.currentTime !== undefined) setCurrentTime(msg.currentTime);
        if (msg.duration) setDuration(msg.duration);
        if (msg.state === YT_PLAYING) {
          setLoadingTrackId(null);
          if (loadTimeoutRef.current) { clearTimeout(loadTimeoutRef.current); loadTimeoutRef.current = null; }
        }
      } else if (msg.type === "progress") {
        if (msg.currentTime !== undefined) setCurrentTime(msg.currentTime);
        if (msg.duration) setDuration(msg.duration);
      } else if (msg.type === "error") {
        const code = msg.code ?? "?";
        setStreamError(`Unavailable (${code}). Try another track.`);
        setLoadingTrackId(null);
        if (loadTimeoutRef.current) { clearTimeout(loadTimeoutRef.current); loadTimeoutRef.current = null; }
      } else if (msg.type === "debug") {
        // diagnostic only — no UI change
      }
    } catch {}
  }, []);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setSearchError("");
    setResults([]);
    inputRef.current?.blur();
    try {
      const r = await fetch(`${getApiUrl()}/api/music/search?q=${encodeURIComponent(q)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Search failed");
      setResults(data);
    } catch (err: any) {
      setSearchError(err.message ?? "Search failed");
    } finally {
      setSearching(false);
    }
  }, [query, searching]);

  const handlePlayTrack = useCallback(
    (track: Track) => {
      if (currentTrack?.videoId === track.videoId) {
        isPlaying ? jsPause() : jsPlay();
        return;
      }
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
      setCurrentTrack(track);
      setLoadingTrackId(track.videoId);
      setStreamError("");
      setPlayerState(YT_UNSTARTED);
      setCurrentTime(0);
      setDuration(track.duration || 0);
      loadTimeoutRef.current = setTimeout(() => {
        setLoadingTrackId((id) => {
          if (id === track.videoId) {
            setStreamError("Track took too long to load. Try another.");
            return null;
          }
          return id;
        });
      }, 30_000);
    },
    [currentTrack, isPlaying, jsPlay, jsPause]
  );

  // Full YouTube watch page — /embed/ blocks content at server level for major labels.
  const watchUrl = currentTrack
    ? `https://www.youtube.com/watch?v=${currentTrack.videoId}&autoplay=1`
    : null;

  const padTop = insets.top + (Platform.OS === "android" ? 8 : 4);

  return (
    <ThemedView style={styles.root}>
      {/* Hidden YouTube player — clipped to 0×0 but 320×240 internally so YT player initialises */}
      {watchUrl ? (
        <View style={styles.hiddenPlayer} pointerEvents="none">
          <WebView
            key={currentTrack!.videoId}
            ref={webViewRef}
            style={styles.webView}
            source={{ uri: watchUrl }}
            onLoad={() => {
              webViewRef.current?.injectJavaScript(INJECT_JS);
            }}
            onMessage={handleMessage}
            onShouldStartLoadWithRequest={(req) => {
              // Block navigation away from youtube.com (ads, suggestions, etc.)
              return req.url.startsWith("https://www.youtube.com") ||
                req.url.startsWith("https://m.youtube.com") ||
                req.url.startsWith("https://accounts.google.com");
            }}
            javaScriptEnabled
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            originWhitelist={["*"]}
            thirdPartyCookiesEnabled
            scrollEnabled={false}
            bounces={false}
            startInLoadingState={false}
            allowsFullscreenVideo={false}
            userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
          />
        </View>
      ) : null}

      {/* ── Header ────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: padTop, paddingHorizontal: Spacing.lg }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={Colors.dark.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Music Player</ThemedText>
        {currentTrack ? (
          <View style={styles.headerNowPlaying}>
            <Feather name="music" size={12} color={Colors.dark.accent} />
            <ThemedText style={styles.headerNowPlayingText} numberOfLines={1}>
              {currentTrack.title}
            </ThemedText>
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
      </View>

      {/* ── Search bar ────────────────────────────────────────── */}
      <View style={[styles.searchWrap, { paddingHorizontal: Spacing.lg }]}>
        <View style={styles.searchBar}>
          <Feather
            name="search"
            size={17}
            color={Colors.dark.textSecondary}
            style={{ marginRight: Spacing.sm }}
          />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search songs, artists, albums…"
            placeholderTextColor={Colors.dark.border}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Pressable hitSlop={8} onPress={() => { setQuery(""); setResults([]); setSearchError(""); }}>
              <Feather name="x" size={15} color={Colors.dark.textSecondary} />
            </Pressable>
          )}
        </View>
        <Pressable
          style={[styles.searchBtn, (!query.trim() || searching) && styles.searchBtnDisabled]}
          onPress={handleSearch}
          disabled={!query.trim() || searching}
        >
          {searching ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <ThemedText style={styles.searchBtnText}>Search</ThemedText>
          )}
        </Pressable>
      </View>

      {/* ── Results / empty state ─────────────────────────────── */}
      {searchError ? (
        <View style={styles.centred}>
          <Feather name="alert-circle" size={30} color="#ef4444" />
          <ThemedText style={styles.errorText}>{searchError}</ThemedText>
          <Pressable style={styles.retryBtn} onPress={handleSearch}>
            <ThemedText style={styles.retryBtnText}>Retry</ThemedText>
          </Pressable>
        </View>
      ) : results.length === 0 && !searching ? (
        <View style={styles.centred}>
          <Feather name="music" size={52} color="rgba(255,102,0,0.25)" />
          <ThemedText style={styles.emptyTitle}>Search for Music</ThemedText>
          <ThemedText style={styles.emptySubtitle}>
            Enter a song, artist or album above and tap Search
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(t) => t.videoId}
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: currentTrack ? 116 : Spacing.xl },
          ]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TrackRow
              track={item}
              isActive={currentTrack?.videoId === item.videoId && (isPlaying || isBuffering)}
              isLoading={loadingTrackId === item.videoId}
              onPress={() => handlePlayTrack(item)}
            />
          )}
        />
      )}

      {/* ── Mini player ───────────────────────────────────────── */}
      {currentTrack ? (
        <View style={[styles.miniPlayer, { paddingBottom: insets.bottom + Spacing.md }]}>
          <LinearGradient
            colors={["rgba(8,8,8,0)", "rgba(8,8,8,0.98)"]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 0.45 }}
            pointerEvents="none"
          />

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={{ flex: progress, backgroundColor: Colors.dark.accent, borderRadius: 2 }} />
            <View style={[styles.progressDot, { opacity: progress > 0 ? 1 : 0 }]} />
            <View style={{ flex: 1 - progress }} />
          </View>

          <View style={styles.playerRow}>
            {currentTrack.thumbnail ? (
              <Image source={{ uri: currentTrack.thumbnail }} style={styles.miniThumb} />
            ) : (
              <View style={[styles.miniThumb, styles.miniThumbPlaceholder]}>
                <Feather name="music" size={14} color={Colors.dark.accent} />
              </View>
            )}
            <View style={styles.miniInfo}>
              <ThemedText style={styles.miniTitle} numberOfLines={1}>
                {currentTrack.title}
              </ThemedText>
              <ThemedText style={styles.miniChannel} numberOfLines={1}>
                {currentTrack.channel}
                {duration > 0
                  ? `  ·  ${fmtTime(currentTime)} / ${fmtTime(duration)}`
                  : currentTrack.duration > 0
                  ? `  ·  ${fmtTime(currentTrack.duration)}`
                  : ""}
              </ThemedText>
              {streamError ? (
                <ThemedText style={styles.streamError} numberOfLines={1}>
                  {streamError}
                </ThemedText>
              ) : null}
            </View>

            {loadingTrackId === currentTrack?.videoId ? (
              <ActivityIndicator color={Colors.dark.accent} size="small" style={styles.controlBtn} />
            ) : (
              <>
                <Pressable
                  style={styles.controlBtn}
                  onPress={() => jsSeek(Math.max(0, currentTime - 10))}
                  hitSlop={8}
                >
                  <Feather name="rotate-ccw" size={18} color={Colors.dark.textSecondary} />
                </Pressable>
                <Pressable
                  style={styles.playBtn}
                  onPress={() => (isPlaying ? jsPause() : jsPlay())}
                >
                  <Feather name={isPlaying ? "pause" : "play"} size={22} color="#fff" />
                </Pressable>
                <Pressable
                  style={styles.controlBtn}
                  onPress={() => jsSeek(Math.min(duration || 999999, currentTime + 10))}
                  hitSlop={8}
                >
                  <Feather name="rotate-cw" size={18} color={Colors.dark.textSecondary} />
                </Pressable>
              </>
            )}
          </View>
        </View>
      ) : null}
    </ThemedView>
  );
}

const ACCENT = Colors.dark.accent;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },

  // 0×0 clip — the inner WebView is real-sized so YouTube's player initialises
  hiddenPlayer: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 0,
    height: 0,
    overflow: "hidden",
  },
  webView: {
    width: 320,
    height: 240,
    backgroundColor: "#000",
  },

  // ── Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  headerNowPlaying: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginLeft: Spacing.sm,
    overflow: "hidden",
  },
  headerNowPlayingText: {
    flex: 1,
    fontSize: 12,
    color: ACCENT,
  },

  // ── Search
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: Spacing.md,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.dark.text,
    paddingVertical: 0,
  },
  searchBtn: {
    backgroundColor: ACCENT,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 80,
  },
  searchBtnDisabled: { opacity: 0.4 },
  searchBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },

  // ── Results list
  list: { flex: 1 },
  listContent: { paddingHorizontal: Spacing.lg },

  // ── Track row
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: 2,
    gap: Spacing.md,
  },
  trackRowActive: {
    backgroundColor: "rgba(255,102,0,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.25)",
  },
  thumbWrap: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    position: "relative",
  },
  thumbImg: { width: "100%", height: "100%" },
  thumbPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  trackInfo: { flex: 1, gap: 3 },
  trackTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  trackTitleActive: { color: ACCENT },
  trackChannel: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  trackDuration: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    minWidth: 38,
    textAlign: "right",
  },

  // ── Empty / error states
  centred: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 19,
  },
  errorText: {
    fontSize: 14,
    color: "#ef4444",
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: ACCENT,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },

  // ── Mini player
  miniPlayer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  progressTrack: {
    flexDirection: "row",
    alignItems: "center",
    height: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    marginBottom: Spacing.sm,
    overflow: "visible",
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ACCENT,
    marginHorizontal: -5,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  miniThumb: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
  },
  miniThumbPlaceholder: {
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  miniInfo: {
    flex: 1,
    gap: 2,
    overflow: "hidden",
  },
  miniTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  miniChannel: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
  },
  streamError: {
    fontSize: 11,
    color: "#ef4444",
  },
  controlBtn: { padding: Spacing.sm },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ACCENT,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
});
