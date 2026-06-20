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
  LayoutChangeEvent,
  GestureResponderEvent,
} from "react-native";
import WebView, { WebViewMessageEvent } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useNavigation } from "@react-navigation/native";
import { getApiUrl } from "@/lib/query-client";

// Track as returned by iTunes search — videoId is filled in on resolve
interface Track {
  videoId: string;       // empty until resolved
  title: string;
  artist: string;
  album: string;
  duration: number;
  thumbnail: string;
  searchKey: string;     // "trackName artistName" used to query YouTube
}

const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;
const YT_UNSTARTED = -1;

function fmtTime(sec: number): string {
  if (!sec || isNaN(sec) || sec < 0) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Injected into the YouTube watch page after onLoad.
// Posts play_ok when play() resolves so we can clear the load-timer early.
const INJECT_JS = `(function() {
  function post(obj) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(obj)); } catch(e) {}
  }
  post({ type:'init', url: window.location.href });

  function findVideo(root) {
    if (!root) return null;
    var v = root.querySelector('video');
    if (v) return v;
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      if (all[i].shadowRoot) { var f = findVideo(all[i].shadowRoot); if (f) return f; }
    }
    return null;
  }

  function dismissOverlays() {
    try {
      ['button[aria-label*="Accept"]','button[aria-label*="Agree"]',
       '.consent-bump-v2-lightbox button','ytm-consent-bump-v2-renderer button'].forEach(function(s){
        var el = document.querySelector(s); if (el) el.click();
      });
      document.querySelectorAll('button').forEach(function(b){
        var t = (b.textContent||'').trim().toLowerCase();
        if (t==='accept all'||t==='i agree'||t==='agree') b.click();
      });
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
      if (f !== lastFloor) {
        lastFloor = f;
        post({ type:'progress', currentTime:v.currentTime, duration:v.duration||0 });
      }
    });
    v.addEventListener('error', function() {
      post({ type:'error', code: v.error ? v.error.code : -1 });
    });
    v.play()
      .then(function(){ post({ type:'play_ok', duration:v.duration||0 }); })
      .catch(function(e){ post({ type:'play_err', msg: e.message }); });
  }

  function check() {
    dismissOverlays();
    var v = findVideo(document.documentElement);
    if (v && v !== vid) attach(v);
  }

  new MutationObserver(check).observe(document.documentElement, { childList:true, subtree:true });
  var n = 0;
  var poll = setInterval(function() { check(); if (++n > 60) clearInterval(poll); }, 500);
  check();

  window.ytCmd = function(cmd, val) {
    if (!vid) return;
    if (cmd==='play') vid.play().catch(function(){});
    else if (cmd==='pause') vid.pause();
    else if (cmd==='seek') vid.currentTime = val;
  };
})(); true;`;

// ── Track row ────────────────────────────────────────────────────────────────
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
        <ThemedText style={styles.trackArtist} numberOfLines={1}>
          {track.artist}
          {track.album ? ` · ${track.album}` : ""}
        </ThemedText>
      </View>

      <ThemedText style={styles.trackDuration}>{fmtTime(track.duration)}</ThemedText>
    </Pressable>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────
export default function MusicPlayerScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  // currentTrack has its videoId filled in after resolve
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const [playerState, setPlayerState] = useState<number>(YT_UNSTARTED);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [streamError, setStreamError] = useState("");

  const inputRef = useRef<TextInput>(null);
  const webViewRef = useRef<WebView>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressBarWidth = useRef(0);

  const isPlaying = playerState === YT_PLAYING;
  const isBuffering = playerState === YT_BUFFERING;
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  const clearLoadTimer = useCallback(() => {
    if (loadTimeoutRef.current) { clearTimeout(loadTimeoutRef.current); loadTimeoutRef.current = null; }
    setIsLoading(false);
  }, []);

  const jsPlay  = useCallback(() => webViewRef.current?.injectJavaScript('window.ytCmd("play"); true;'), []);
  const jsPause = useCallback(() => webViewRef.current?.injectJavaScript('window.ytCmd("pause"); true;'), []);
  const jsSeek  = useCallback((t: number) => webViewRef.current?.injectJavaScript(`window.ytCmd("seek",${t}); true;`), []);

  // Tappable progress bar — maps tap X position to a seek time
  const handleProgressTap = useCallback(
    (evt: GestureResponderEvent) => {
      if (duration <= 0 || progressBarWidth.current <= 0) return;
      const x = evt.nativeEvent.locationX;
      const fraction = Math.max(0, Math.min(1, x / progressBarWidth.current));
      const seekTo = fraction * duration;
      setCurrentTime(seekTo);
      jsSeek(seekTo);
    },
    [duration, jsSeek]
  );

  const handleProgressLayout = useCallback((e: LayoutChangeEvent) => {
    progressBarWidth.current = e.nativeEvent.layout.width;
  }, []);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === "play_ok") {
          clearLoadTimer();
          if (msg.duration > 0) setDuration(msg.duration);
          setStreamError("");
        } else if (msg.type === "play_err") {
          setStreamError("Playback blocked. Try another.");
          clearLoadTimer();
        } else if (msg.type === "ready") {
          if (msg.duration > 0) setDuration(msg.duration);
          clearLoadTimer();
          setStreamError("");
        } else if (msg.type === "state") {
          setPlayerState(msg.state);
          if (msg.currentTime !== undefined) setCurrentTime(msg.currentTime);
          if (msg.duration > 0) setDuration(msg.duration);
          if (msg.state === YT_PLAYING) { clearLoadTimer(); setStreamError(""); }
        } else if (msg.type === "progress") {
          if (msg.currentTime !== undefined) setCurrentTime(msg.currentTime);
          if (msg.duration > 0) setDuration(msg.duration);
        } else if (msg.type === "error") {
          setStreamError(`Unavailable (${msg.code ?? "?"}). Try another.`);
          clearLoadTimer();
        }
      } catch {}
    },
    [clearLoadTimer]
  );

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
    async (track: Track) => {
      // Toggle play/pause if same track already resolved and playing
      if (currentTrack?.searchKey === track.searchKey && currentTrack.videoId) {
        isPlaying ? jsPause() : jsPlay();
        return;
      }

      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
      setIsLoading(true);
      setResolveError("");
      setStreamError("");
      setPlayerState(YT_UNSTARTED);
      setCurrentTime(0);
      setDuration(track.duration || 0);
      // Optimistically set the track (shows thumbnail + title immediately)
      setCurrentTrack({ ...track, videoId: "" });

      try {
        const r = await fetch(
          `${getApiUrl()}/api/music/resolve?q=${encodeURIComponent(track.searchKey)}`
        );
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Resolve failed");
        const videoId: string = data.videoId;
        if (!videoId) throw new Error("No video found");

        // Set resolved track — triggers WebView mount with the real videoId
        setCurrentTrack({ ...track, videoId });

        // 45s timeout covers cases where WebView never responds
        loadTimeoutRef.current = setTimeout(() => {
          setIsLoading(false);
          setStreamError("Track timed out. Try another.");
        }, 45_000);
      } catch (err: any) {
        setResolveError(err.message ?? "Could not find track");
        setIsLoading(false);
      }
    },
    [currentTrack, isPlaying, jsPlay, jsPause]
  );

  const watchUrl = currentTrack?.videoId
    ? `https://www.youtube.com/watch?v=${currentTrack.videoId}&autoplay=1`
    : null;

  const PLAYER_H = 84;
  const padTop = insets.top + (Platform.OS === "android" ? 8 : 4);

  return (
    <ThemedView style={styles.root}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: padTop, paddingHorizontal: Spacing.lg }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={Colors.dark.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Music</ThemedText>
        <View style={{ flex: 1 }} />
      </View>

      {/* ── Search bar ──────────────────────────────────────────────── */}
      <View style={[styles.searchWrap, { paddingHorizontal: Spacing.lg }]}>
        <View style={styles.searchBar}>
          <Feather name="search" size={17} color={Colors.dark.textSecondary} style={{ marginRight: Spacing.sm }} />
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
          {searching
            ? <ActivityIndicator size="small" color="#fff" />
            : <ThemedText style={styles.searchBtnText}>Search</ThemedText>
          }
        </Pressable>
      </View>

      {/* ── Results / empty / error states ──────────────────────────── */}
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
            Uses Apple Music's catalogue — tap any track to play via YouTube
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(t, i) => `${t.searchKey}-${i}`}
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: currentTrack ? PLAYER_H + insets.bottom + 16 : insets.bottom + 16 },
          ]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TrackRow
              track={item}
              isActive={!!currentTrack && currentTrack.searchKey === item.searchKey && currentTrack.videoId !== "" && (isPlaying || isBuffering)}
              isLoading={isLoading && !!currentTrack && currentTrack.searchKey === item.searchKey}
              onPress={() => handlePlayTrack(item)}
            />
          )}
        />
      )}

      {/* ── Player bar ──────────────────────────────────────────────── */}
      {currentTrack ? (
        <View style={[styles.playerShell, { paddingBottom: insets.bottom, height: PLAYER_H + insets.bottom }]}>
          {/* Hidden WebView — only mounts once videoId is resolved */}
          {watchUrl ? (
            <WebView
              key={currentTrack.videoId}
              ref={webViewRef}
              style={StyleSheet.absoluteFill}
              source={{ uri: watchUrl }}
              onLoad={() => { webViewRef.current?.injectJavaScript(INJECT_JS); }}
              onMessage={handleMessage}
              onShouldStartLoadWithRequest={(req) =>
                req.url.startsWith("https://www.youtube.com") ||
                req.url.startsWith("https://m.youtube.com") ||
                req.url.startsWith("https://accounts.google.com") ||
                req.url.startsWith("https://consent.youtube.com")
              }
              javaScriptEnabled
              mediaPlaybackRequiresUserAction={false}
              allowsInlineMediaPlayback
              originWhitelist={["*"]}
              thirdPartyCookiesEnabled
              scrollEnabled={false}
              bounces={false}
              allowsFullscreenVideo={false}
              androidLayerType="software"
              userAgent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            />
          ) : null}

          {/* Solid cover — hides YouTube UI (works because androidLayerType=software) */}
          <View style={styles.playerCover} />

          {/* Tappable progress bar */}
          <Pressable
            style={styles.progressWrap}
            onPress={handleProgressTap}
            onLayout={handleProgressLayout}
            hitSlop={{ top: 10, bottom: 10 }}
          >
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { flex: progress }]} />
              {progress > 0 && <View style={styles.progressDot} />}
              <View style={{ flex: Math.max(0.001, 1 - progress) }} />
            </View>
          </Pressable>

          {/* Controls */}
          <View style={styles.controlsRow}>
            {currentTrack.thumbnail ? (
              <Image source={{ uri: currentTrack.thumbnail }} style={styles.miniThumb} />
            ) : (
              <View style={[styles.miniThumb, styles.miniThumbPlaceholder]}>
                <Feather name="music" size={14} color={Colors.dark.accent} />
              </View>
            )}

            <View style={styles.trackMeta}>
              <ThemedText style={styles.miniTitle} numberOfLines={1}>{currentTrack.title}</ThemedText>
              <ThemedText style={styles.miniSub} numberOfLines={1}>
                {streamError || resolveError
                  ? (streamError || resolveError)
                  : `${currentTrack.artist}${duration > 0 ? `  ·  ${fmtTime(currentTime)} / ${fmtTime(duration)}` : ""}`
                }
              </ThemedText>
            </View>

            {isLoading ? (
              <ActivityIndicator color={Colors.dark.accent} size="small" style={{ marginHorizontal: 12 }} />
            ) : (
              <>
                <Pressable style={styles.ctrlBtn} onPress={() => jsSeek(Math.max(0, currentTime - 10))} hitSlop={8}>
                  <Feather name="rotate-ccw" size={18} color={Colors.dark.textSecondary} />
                </Pressable>
                <Pressable style={styles.playBtn} onPress={() => (isPlaying ? jsPause() : jsPlay())}>
                  <Feather name={isPlaying ? "pause" : "play"} size={22} color="#fff" />
                </Pressable>
                <Pressable style={styles.ctrlBtn} onPress={() => jsSeek(Math.min(duration || 999999, currentTime + 10))} hitSlop={8}>
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
  root: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },

  header: { flexDirection: "row", alignItems: "center", paddingBottom: Spacing.md, gap: Spacing.md },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: Colors.dark.text },

  searchWrap: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.md },
  searchBar: {
    flex: 1, flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.dark.border,
    paddingHorizontal: Spacing.md, height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, color: Colors.dark.text, paddingVertical: 0 },
  searchBtn: {
    backgroundColor: ACCENT, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg, height: 44,
    justifyContent: "center", alignItems: "center", minWidth: 80,
  },
  searchBtnDisabled: { opacity: 0.4 },
  searchBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },

  list: { flex: 1 },
  listContent: { paddingHorizontal: Spacing.lg },

  trackRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md, marginBottom: 2, gap: Spacing.md,
  },
  trackRowActive: { backgroundColor: "rgba(255,102,0,0.12)", borderWidth: 1, borderColor: "rgba(255,102,0,0.25)" },
  thumbWrap: { width: 52, height: 52, borderRadius: BorderRadius.sm, overflow: "hidden" },
  thumbImg: { width: "100%", height: "100%" },
  thumbPlaceholder: { width: "100%", height: "100%", backgroundColor: Colors.dark.backgroundSecondary, justifyContent: "center", alignItems: "center" },
  thumbOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center" },
  trackInfo: { flex: 1, gap: 3 },
  trackTitle: { fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  trackTitleActive: { color: ACCENT },
  trackArtist: { fontSize: 12, color: Colors.dark.textSecondary },
  trackDuration: { fontSize: 12, color: Colors.dark.textSecondary, minWidth: 38, textAlign: "right" },

  centred: { flex: 1, justifyContent: "center", alignItems: "center", gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: Colors.dark.text, textAlign: "center" },
  emptySubtitle: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center", lineHeight: 19 },
  errorText: { fontSize: 14, color: "#ef4444", textAlign: "center" },
  retryBtn: { backgroundColor: ACCENT, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm },
  retryBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },

  // ── Player
  playerShell: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    backgroundColor: "#111",
    borderTopWidth: 1, borderTopColor: "rgba(255,102,0,0.2)",
  },
  playerCover: { ...StyleSheet.absoluteFillObject, backgroundColor: "#111" },

  progressWrap: { paddingHorizontal: Spacing.lg, paddingTop: 8 },
  progressTrack: {
    flexDirection: "row", alignItems: "center",
    height: 4, backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 2,
  },
  progressFill: { height: 4, backgroundColor: ACCENT, borderRadius: 2 },
  progressDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: ACCENT, marginHorizontal: -6 },

  controlsRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: Spacing.lg, paddingTop: 8, gap: Spacing.sm,
  },
  miniThumb: { width: 44, height: 44, borderRadius: BorderRadius.sm },
  miniThumbPlaceholder: { backgroundColor: Colors.dark.backgroundSecondary, justifyContent: "center", alignItems: "center" },
  trackMeta: { flex: 1, gap: 2 },
  miniTitle: { fontSize: 13, fontWeight: "700", color: Colors.dark.text },
  miniSub: { fontSize: 11, color: Colors.dark.textSecondary },
  ctrlBtn: { padding: Spacing.sm },
  playBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: ACCENT, justifyContent: "center", alignItems: "center", elevation: 4,
  },
});
