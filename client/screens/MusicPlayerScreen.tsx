import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Image,
  Platform,
  Modal,
  LayoutChangeEvent,
  GestureResponderEvent,
} from "react-native";
import WebView, { WebViewMessageEvent } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { getApiUrl } from "@/lib/query-client";
import { useAppTheme } from "@/contexts/ThemeContext";
import { useProfile, GUEST_PROFILE_ID } from "@/contexts/ProfileContext";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

interface Track {
  videoId: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  thumbnail: string;
  searchKey: string;
}

interface ArtistResult { artistId: number; artistName: string; primaryGenreName: string; }
interface AlbumResult { collectionId: number; collectionName: string; artistName: string; artwork: string; trackCount: number; releaseYear: number | null; }

const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;
const YT_UNSTARTED = -1;
const YT_ENDED = 0;

function fmtTime(sec: number): string {
  if (!sec || isNaN(sec) || sec < 0) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

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

// ── Shared TV-focusable pressable ─────────────────────────────────────────────
function FocusPressable({
  style,
  children,
  variant = "default",
  onFocus,
  onBlur,
  onHoverIn,
  onHoverOut,
  ...rest
}: React.ComponentProps<typeof Pressable> & { variant?: "default" | "solid" }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      {...rest}
      style={[style, focused && (variant === "solid" ? styles.focusSolid : styles.focusDefault)]}
      onFocus={(e) => { setFocused(true); onFocus?.(e as any); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e as any); }}
      onHoverIn={(e) => { setFocused(true); onHoverIn?.(e as any); }}
      onHoverOut={(e) => { setFocused(false); onHoverOut?.(e as any); }}
    >
      {children}
    </Pressable>
  );
}

// ── Artist card ───────────────────────────────────────────────────────────────
function ArtistCard({ artist, onPress }: { artist: ArtistResult; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      style={[styles.artistCard, focused && styles.artistCardFocused]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <View style={[styles.artistAvatar, focused && styles.artistAvatarFocused]}>
        <Feather name="user" size={28} color={styles.artistAvatar.borderColor as string} />
      </View>
      <ThemedText style={styles.artistCardName} numberOfLines={2}>{artist.artistName}</ThemedText>
      {artist.primaryGenreName ? (
        <ThemedText style={styles.artistCardGenre} numberOfLines={1}>{artist.primaryGenreName}</ThemedText>
      ) : null}
    </Pressable>
  );
}

// ── Album card ────────────────────────────────────────────────────────────────
function AlbumCard({ album, onPress }: { album: AlbumResult; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      style={[styles.albumCard, focused && styles.albumCardFocused]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {album.artwork ? (
        <Image source={{ uri: album.artwork }} style={styles.albumCardArt} resizeMode="cover" />
      ) : (
        <View style={[styles.albumCardArt, styles.albumCardArtPh]}>
          <Feather name="disc" size={24} color={Colors.dark.textSecondary} />
        </View>
      )}
      <ThemedText style={styles.albumCardName} numberOfLines={2}>{album.collectionName}</ThemedText>
      <ThemedText style={styles.albumCardMeta} numberOfLines={1}>
        {album.artistName}{album.releaseYear ? ` · ${album.releaseYear}` : ""}
        {album.trackCount > 0 ? ` · ${album.trackCount} tracks` : ""}
      </ThemedText>
    </Pressable>
  );
}

// ── Track row ────────────────────────────────────────────────────────────────
function TrackRow({
  track,
  isActive,
  isLoading,
  onPress,
  onLike,
  onAdd,
  isLiked,
}: {
  track: Track;
  isActive: boolean;
  isLoading: boolean;
  onPress: () => void;
  onLike?: () => void;
  onAdd?: () => void;
  isLiked?: boolean;
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
        <ThemedText style={[styles.trackTitle, isActive && styles.trackTitleActive]} numberOfLines={1}>
          {track.title}
        </ThemedText>
        <ThemedText style={styles.trackArtist} numberOfLines={1}>
          {track.artist}{track.album ? ` · ${track.album}` : ""}
        </ThemedText>
      </View>

      <ThemedText style={styles.trackDuration}>{fmtTime(track.duration)}</ThemedText>

      {onAdd ? (
        <FocusPressable onPress={onAdd} hitSlop={12} style={styles.trackIconBtn}>
          <Feather name="plus-circle" size={20} color={Colors.dark.textSecondary} />
        </FocusPressable>
      ) : null}
      {onLike ? (
        <FocusPressable onPress={onLike} hitSlop={12} style={styles.trackIconBtn}>
          <Feather name="heart" size={20} color={isLiked ? "#e11d48" : Colors.dark.textSecondary} />
        </FocusPressable>
      ) : null}
    </Pressable>
  );
}

// ── Info button + modal ───────────────────────────────────────────────────────
function InfoButton() {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <FocusPressable onPress={() => setVisible(true)} hitSlop={12} style={styles.infoBtn}>
        <Feather name="info" size={18} color={Colors.dark.textSecondary} />
      </FocusPressable>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)} statusBarTranslucent>
        <Pressable style={styles.infoOverlay} onPress={() => setVisible(false)}>
          <Pressable style={styles.infoCard} onPress={() => {}}>
            <View style={styles.infoCardHeader}>
              <Feather name="info" size={16} color={Colors.dark.accent} />
              <ThemedText style={styles.infoCardTitle}>About Search Results</ThemedText>
            </View>
            <ThemedText style={styles.infoCardBody}>
              Music is matched using YouTube, so results may not always be the exact version you
              had in mind — for example, you might get a live performance, an extended mix, or a
              video that was originally made for TV rather than a simple audio track.{"\n\n"}
              If the first result isn't quite right, try a more specific search (e.g. include
              "radio edit" or the artist name) to narrow it down.
            </ThemedText>
            <FocusPressable variant="solid" style={styles.infoCardClose} onPress={() => setVisible(false)}>
              <ThemedText style={styles.infoCardCloseText}>Got it</ThemedText>
            </FocusPressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────
export default function MusicPlayerScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { showMusicBetaBadge } = useAppTheme();
  const route = useRoute<RouteProp<RootStackParamList, "MusicPlayer">>();
  const { queue: initQueue, startIndex: initIndex = 0, contextName, initialQuery, albumId } = route.params ?? {};
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id;

  // ── Left-panel mode: "queue" shows album track list; "search" shows search UI
  const [leftMode, setLeftMode] = useState<"queue" | "search">(albumId ? "queue" : "search");
  const [albumContext, setAlbumContext] = useState<{ id: number; name: string; tracks: Track[] } | null>(null);
  const [albumLoading, setAlbumLoading] = useState(false);

  const [query, setQuery] = useState(initialQuery ?? "");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [richResults, setRichResults] = useState<{ songs: Track[]; artists: ArtistResult[]; albums: AlbumResult[] } | null>(null);
  const [drill, setDrill] = useState<{ type: "artist" | "album"; id: number; name: string; artwork?: string } | null>(null);
  const [drillSongs, setDrillSongs] = useState<Track[]>([]);
  const [drillAlbums, setDrillAlbums] = useState<AlbumResult[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState("");

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const [playerState, setPlayerState] = useState<number>(YT_UNSTARTED);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [streamError, setStreamError] = useState("");

  const [repeat, setRepeat] = useState(false);
  const [shuffle, setShuffle] = useState(false);

  const [likedKeys, setLikedKeys] = useState<Set<string>>(new Set());
  const [likedPlaylistId, setLikedPlaylistId] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<Array<{ id: string; name: string; isLikedSongs: boolean; trackCount: number }>>([]);
  const [trackAddModal, setTrackAddModal] = useState<Track | null>(null);
  const trackAddModalRef = useRef<Track | null>(null);
  trackAddModalRef.current = trackAddModal;
  const [playlistAdded, setPlaylistAdded] = useState<Set<string>>(new Set());
  // Timer ref so rapid modal re-opens don't get killed by a stale close timer
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resultsRef = useRef<Track[]>([]);
  const repeatRef = useRef(false);
  const shuffleRef = useRef(false);
  resultsRef.current = results;
  repeatRef.current = repeat;
  shuffleRef.current = shuffle;

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

  const handleProgressTap = useCallback(
    (evt: GestureResponderEvent) => {
      if (duration <= 0 || progressBarWidth.current <= 0) return;
      const x = evt.nativeEvent.locationX;
      const fraction = Math.max(0, Math.min(1, x / progressBarWidth.current));
      jsSeek(fraction * duration);
      setCurrentTime(fraction * duration);
    },
    [duration, jsSeek]
  );

  const handleProgressLayout = useCallback((e: LayoutChangeEvent) => {
    progressBarWidth.current = e.nativeEvent.layout.width;
  }, []);

  const playTrackRef = useRef<((track: Track) => Promise<void>) | null>(null);

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
          if (msg.state === YT_ENDED) {
            webViewRef.current?.injectJavaScript('if(window.ytCmd) window.ytCmd("pause"); true;');
            setCurrentTrack((curr) => {
              if (!curr) return curr;
              const list = resultsRef.current;
              if (!list.length) return curr;
              let next: Track;
              if (repeatRef.current) {
                next = curr;
              } else if (shuffleRef.current) {
                const others = list.filter((t) => t.searchKey !== curr.searchKey);
                next = others.length ? others[Math.floor(Math.random() * others.length)] : list[0];
              } else {
                const idx = list.findIndex((t) => t.searchKey === curr.searchKey);
                next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : list[0];
              }
              setTimeout(() => { playTrackRef.current?.(next); }, 100);
              return curr;
            });
          }
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
    setRichResults(null);
    setResults([]);
    setDrill(null);
    setDrillSongs([]);
    setDrillAlbums([]);
    inputRef.current?.blur();
    try {
      const r = await fetch(`${getApiUrl()}/api/music/search?q=${encodeURIComponent(q)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Search failed");
      setRichResults(data);
      setResults(data.songs ?? []);
    } catch (err: any) {
      setSearchError(err.message ?? "Search failed");
    } finally {
      setSearching(false);
    }
  }, [query, searching]);

  // Fetch album tracks when arriving with an albumId
  useEffect(() => {
    if (!albumId) return;
    const name = contextName ?? "Album";
    setAlbumLoading(true);
    fetch(`${getApiUrl()}/api/music/album/${albumId}`)
      .then((r) => r.json())
      .then((tracks: Track[]) => {
        const list = Array.isArray(tracks) ? tracks : [];
        setAlbumContext({ id: albumId, name, tracks: list });
        setResults(list);
        resultsRef.current = list;
        setLeftMode("queue");
      })
      .catch(() => {})
      .finally(() => setAlbumLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-run search when arriving from MusicHomeScreen with a query (only if no albumId)
  useEffect(() => {
    if (!initialQuery?.trim() || albumId) return;
    const q = initialQuery.trim();
    setSearching(true);
    setSearchError("");
    fetch(`${getApiUrl()}/api/music/search?q=${encodeURIComponent(q)}`)
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error ?? "Search failed");
        setRichResults(data);
        setResults(data.songs ?? []);
      })
      .catch((err: any) => setSearchError(err.message ?? "Search failed"))
      .finally(() => setSearching(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleArtistDrill = useCallback(async (artist: ArtistResult) => {
    setDrill({ type: "artist", id: artist.artistId, name: artist.artistName });
    setDrillLoading(true);
    setDrillError("");
    setDrillSongs([]);
    setDrillAlbums([]);
    try {
      const r = await fetch(`${getApiUrl()}/api/music/artist/${artist.artistId}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      setDrillSongs(data.songs ?? []);
      setDrillAlbums(data.albums ?? []);
      setResults(data.songs ?? []);
    } catch (err: any) {
      setDrillError(err.message ?? "Failed to load artist");
    } finally {
      setDrillLoading(false);
    }
  }, []);

  const handleAlbumDrill = useCallback(async (album: AlbumResult) => {
    setDrill({ type: "album", id: album.collectionId, name: album.collectionName, artwork: album.artwork });
    setDrillLoading(true);
    setDrillError("");
    setDrillSongs([]);
    setDrillAlbums([]);
    try {
      const r = await fetch(`${getApiUrl()}/api/music/album/${album.collectionId}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      setDrillSongs(Array.isArray(data) ? data : []);
      setResults(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setDrillError(err.message ?? "Failed to load album");
    } finally {
      setDrillLoading(false);
    }
  }, []);

  const handlePlayTrack = useCallback(
    async (track: Track) => {
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
      setCurrentTrack({ ...track, videoId: "" });
      try {
        const r = await fetch(`${getApiUrl()}/api/music/resolve?q=${encodeURIComponent(track.searchKey)}`);
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Resolve failed");
        const videoId: string = data.videoId;
        if (!videoId) throw new Error("No video found");
        setCurrentTrack({ ...track, videoId });
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

  playTrackRef.current = handlePlayTrack;

  const queueInitDone = useRef(false);
  useEffect(() => {
    if (queueInitDone.current || !initQueue?.length) return;
    queueInitDone.current = true;
    const tracks = initQueue as Track[];
    setResults(tracks);
    const track = tracks[initIndex] ?? tracks[0];
    if (track) setTimeout(() => { playTrackRef.current?.(track); }, 80);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!profileId || profileId === GUEST_PROFILE_ID) return;
    (async () => {
      try {
        const r = await fetch(`${getApiUrl()}/api/music/playlists?profile_id=${profileId}`);
        if (!r.ok) return;
        const data: any[] = await r.json();
        const liked = data.find((p) => p.is_liked_songs);
        setPlaylists(data.map((p) => ({ id: p.id, name: p.name, isLikedSongs: p.is_liked_songs, trackCount: p.trackCount ?? 0 })));
        if (liked) {
          setLikedPlaylistId(liked.id);
          const tr = await fetch(`${getApiUrl()}/api/music/playlists/${liked.id}/tracks`);
          if (tr.ok) {
            const tData: any[] = await tr.json();
            setLikedKeys(new Set(tData.map((t) => t.search_key as string)));
          }
        }
      } catch {}
    })();
  }, [profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLike = useCallback(async (track: Track) => {
    if (!likedPlaylistId) return;

    if (likedKeys.has(track.searchKey)) {
      // Unlike: remove from Liked Songs
      setLikedKeys((prev) => { const n = new Set(prev); n.delete(track.searchKey); return n; });
      try {
        await fetch(
          `${getApiUrl()}/api/music/playlists/${likedPlaylistId}/tracks/by-key?search_key=${encodeURIComponent(track.searchKey)}`,
          { method: "DELETE" }
        );
      } catch {
        setLikedKeys((prev) => new Set([...prev, track.searchKey]));
      }
      return;
    }

    setLikedKeys((prev) => new Set([...prev, track.searchKey]));
    try {
      await fetch(`${getApiUrl()}/api/music/playlists/${likedPlaylistId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: track.title, artist: track.artist, album: track.album, duration_sec: track.duration, thumbnail: track.thumbnail, search_key: track.searchKey }),
      });
    } catch {
      setLikedKeys((prev) => { const n = new Set(prev); n.delete(track.searchKey); return n; });
    }
  }, [likedPlaylistId, likedKeys]);

  const handleAddToPlaylist = useCallback(async (playlistId: string) => {
    const track = trackAddModalRef.current;
    if (!track) return;
    setPlaylistAdded((prev) => new Set([...prev, playlistId]));
    try {
      await fetch(`${getApiUrl()}/api/music/playlists/${playlistId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: track.title, artist: track.artist, album: track.album, duration_sec: track.duration, thumbnail: track.thumbnail, search_key: track.searchKey }),
      });
      setPlaylists((prev) => prev.map((p) => p.id === playlistId ? { ...p, trackCount: p.trackCount + 1 } : p));
      // Clear any stale close timer before starting a new one — prevents killing a freshly-opened modal
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => { closeTimerRef.current = null; setTrackAddModal(null); }, 700);
    } catch {
      setPlaylistAdded((prev) => { const n = new Set(prev); n.delete(playlistId); return n; });
    }
  }, []);

  const openAddModal = useCallback((track: Track) => {
    // Cancel any pending auto-close from the previous add
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    setPlaylistAdded(new Set());
    setTrackAddModal(track);
  }, []);

  const handleSkipNext = useCallback(() => {
    if (!results.length || !currentTrack) return;
    if (shuffle) {
      const others = results.filter((t) => t.searchKey !== currentTrack.searchKey);
      const next = others.length ? others[Math.floor(Math.random() * others.length)] : results[0];
      handlePlayTrack(next);
    } else {
      const idx = results.findIndex((t) => t.searchKey === currentTrack.searchKey);
      handlePlayTrack(idx >= 0 && idx < results.length - 1 ? results[idx + 1] : results[0]);
    }
  }, [results, currentTrack, shuffle, handlePlayTrack]);

  const handleSkipPrev = useCallback(() => {
    if (!results.length || !currentTrack) return;
    if (currentTime > 3) { jsSeek(0); return; }
    if (shuffle) {
      const others = results.filter((t) => t.searchKey !== currentTrack.searchKey);
      handlePlayTrack(others.length ? others[Math.floor(Math.random() * others.length)] : results[0]);
    } else {
      const idx = results.findIndex((t) => t.searchKey === currentTrack.searchKey);
      handlePlayTrack(idx > 0 ? results[idx - 1] : results[results.length - 1]);
    }
  }, [results, currentTrack, currentTime, shuffle, jsSeek, handlePlayTrack]);

  const watchUrl = currentTrack?.videoId
    ? `https://www.youtube.com/watch?v=${currentTrack.videoId}&autoplay=1&rel=0`
    : null;

  const padTop = insets.top + (Platform.OS === "android" ? 8 : 4);

  return (
    <ThemedView style={styles.root}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: padTop, paddingHorizontal: Spacing.lg }]}>
        <FocusPressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={Colors.dark.text} />
        </FocusPressable>
        <ThemedText style={styles.headerTitle}>Music</ThemedText>
        {showMusicBetaBadge ? (
          <View style={styles.betaBadge}>
            <ThemedText style={styles.betaBadgeText}>BETA</ThemedText>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <InfoButton />
      </View>

      {/* ── 50/50 body ──────────────────────────────────────────────── */}
      <View style={styles.body}>

        {/* ══ LEFT: album queue OR search ═════════════════════════════ */}
        <View style={styles.leftPanel}>

          {/* ── Mode toggle strip ── */}
          <View style={styles.modeStrip}>
            <FocusPressable
              style={[styles.modeTab, leftMode === "queue" && styles.modeTabActive]}
              onPress={() => setLeftMode("queue")}
            >
              <Feather name="list" size={14} color={leftMode === "queue" ? ACCENT : Colors.dark.textSecondary} />
              <ThemedText style={[styles.modeTabText, leftMode === "queue" && styles.modeTabTextActive]}>
                {albumContext ? albumContext.name : "Queue"}
              </ThemedText>
            </FocusPressable>
            <FocusPressable
              style={[styles.modeTab, leftMode === "search" && styles.modeTabActive]}
              onPress={() => setLeftMode("search")}
            >
              <Feather name="search" size={14} color={leftMode === "search" ? ACCENT : Colors.dark.textSecondary} />
              <ThemedText style={[styles.modeTabText, leftMode === "search" && styles.modeTabTextActive]}>Search</ThemedText>
            </FocusPressable>
          </View>

          {/* ── Queue / album track list ── */}
          {leftMode === "queue" && albumLoading && (
            <View style={styles.centred}><ActivityIndicator color={ACCENT} size="large" /></View>
          )}
          {leftMode === "queue" && !albumLoading && albumContext && albumContext.tracks.length > 0 && (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
              {albumContext.tracks.map((item, i) => {
                const isActive = !!currentTrack && currentTrack.searchKey === item.searchKey && (isPlaying || isBuffering);
                return (
                  <TrackRow
                    key={`${item.searchKey}-${i}`}
                    track={item}
                    isActive={isActive}
                    isLoading={isLoading && !!currentTrack && currentTrack.searchKey === item.searchKey}
                    onPress={() => handlePlayTrack(item)}
                    onLike={likedPlaylistId ? () => handleLike(item) : undefined}
                    onAdd={playlists.length > 0 ? () => openAddModal(item) : undefined}
                    isLiked={likedKeys.has(item.searchKey)}
                  />
                );
              })}
            </ScrollView>
          )}
          {leftMode === "queue" && !albumLoading && !(albumContext && albumContext.tracks.length > 0) && (
            <View style={styles.centred}>
              <Feather name="music" size={40} color="rgba(255,102,0,0.18)" />
              <ThemedText style={styles.emptyTitle}>No tracks</ThemedText>
            </View>
          )}

          {/* ── Search UI ── */}
          {leftMode === "search" && (
            <View style={{ flex: 1 }}>
              <View style={[styles.searchWrap, { paddingHorizontal: Spacing.md }]}>
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
                    <FocusPressable hitSlop={8} onPress={() => { setQuery(""); setResults([]); setRichResults(null); setSearchError(""); setDrill(null); setDrillSongs([]); setDrillAlbums([]); }} style={styles.clearBtn}>
                      <Feather name="x" size={15} color={Colors.dark.textSecondary} />
                    </FocusPressable>
                  )}
                </View>
                <FocusPressable
                  variant="solid"
                  style={[styles.searchBtn, (!query.trim() || searching) && styles.searchBtnDisabled]}
                  onPress={handleSearch}
                  disabled={!query.trim() || searching}
                >
                  {searching
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <ThemedText style={styles.searchBtnText}>Search</ThemedText>
                  }
                </FocusPressable>
              </View>

              {searchError ? (
                <View style={styles.centred}>
                  <Feather name="alert-circle" size={30} color="#ef4444" />
                  <ThemedText style={styles.errorText}>{searchError}</ThemedText>
                  <FocusPressable variant="solid" style={styles.retryBtn} onPress={handleSearch}>
                    <ThemedText style={styles.retryBtnText}>Retry</ThemedText>
                  </FocusPressable>
                </View>
              ) : !richResults && !searching ? (
                <View style={styles.centred}>
                  <Feather name="music" size={48} color="rgba(255,102,0,0.2)" />
                  <ThemedText style={styles.emptyTitle}>Search for Music</ThemedText>
                  <ThemedText style={styles.emptySubtitle}>
                    Artists, albums &amp; songs from Apple Music — tap to play via YouTube
                  </ThemedText>
                </View>
              ) : drill ? (
                <View style={styles.list}>
                  <View style={styles.drillHeader}>
                    <FocusPressable
                      style={styles.drillBack}
                      hitSlop={8}
                      onPress={() => { setDrill(null); setDrillSongs([]); setDrillAlbums([]); setResults(richResults?.songs ?? []); }}
                    >
                      <Feather name="arrow-left" size={15} color={ACCENT} />
                      <ThemedText style={styles.drillBackText} numberOfLines={1}>{drill.name}</ThemedText>
                    </FocusPressable>
                  </View>
                  {drillLoading ? (
                    <View style={styles.centred}><ActivityIndicator color={ACCENT} size="large" /></View>
                  ) : drillError ? (
                    <View style={styles.centred}><ThemedText style={styles.errorText}>{drillError}</ThemedText></View>
                  ) : (
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
                      {drillSongs.length > 0 && (
                        <View>
                          <ThemedText style={styles.drillSectionTitle}>
                            {drill.type === "artist" ? "TOP SONGS" : "TRACKS"}
                          </ThemedText>
                          {drillSongs.map((item, i) => (
                            <TrackRow
                              key={`${item.searchKey}-${i}`}
                              track={item}
                              isActive={!!currentTrack && currentTrack.searchKey === item.searchKey && currentTrack.videoId !== "" && (isPlaying || isBuffering)}
                              isLoading={isLoading && !!currentTrack && currentTrack.searchKey === item.searchKey}
                              onPress={() => handlePlayTrack(item)}
                              onLike={likedPlaylistId ? () => handleLike(item) : undefined}
                              onAdd={playlists.length > 0 ? () => openAddModal(item) : undefined}
                              isLiked={likedKeys.has(item.searchKey)}
                            />
                          ))}
                        </View>
                      )}
                      {drill.type === "artist" && drillAlbums.length > 0 && (
                        <View>
                          <ThemedText style={styles.drillSectionTitle}>ALBUMS</ThemedText>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hChips}>
                            {drillAlbums.map((a) => (
                              <AlbumCard key={String(a.collectionId)} album={a} onPress={() => handleAlbumDrill(a)} />
                            ))}
                          </ScrollView>
                        </View>
                      )}
                    </ScrollView>
                  )}
                </View>
              ) : (
                <ScrollView style={styles.list} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
                  {(richResults?.artists ?? []).length > 0 && (
                    <View>
                      <ThemedText style={styles.drillSectionTitle}>ARTISTS</ThemedText>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hChips}>
                        {richResults!.artists.map((a) => (
                          <ArtistCard key={String(a.artistId)} artist={a} onPress={() => handleArtistDrill(a)} />
                        ))}
                      </ScrollView>
                    </View>
                  )}
                  {(richResults?.albums ?? []).length > 0 && (
                    <View>
                      <ThemedText style={styles.drillSectionTitle}>ALBUMS</ThemedText>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hChips}>
                        {richResults!.albums.map((a) => (
                          <AlbumCard key={String(a.collectionId)} album={a} onPress={() => handleAlbumDrill(a)} />
                        ))}
                      </ScrollView>
                    </View>
                  )}
                  {(richResults?.songs ?? []).length > 0 && (
                    <View>
                      <ThemedText style={styles.drillSectionTitle}>SONGS</ThemedText>
                      {richResults!.songs.map((item, i) => (
                        <TrackRow
                          key={`${item.searchKey}-${i}`}
                          track={item}
                          isActive={!!currentTrack && currentTrack.searchKey === item.searchKey && currentTrack.videoId !== "" && (isPlaying || isBuffering)}
                          isLoading={isLoading && !!currentTrack && currentTrack.searchKey === item.searchKey}
                          onPress={() => handlePlayTrack(item)}
                          onLike={likedPlaylistId ? () => handleLike(item) : undefined}
                          onAdd={playlists.length > 0 ? () => openAddModal(item) : undefined}
                          isLiked={likedKeys.has(item.searchKey)}
                        />
                      ))}
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
          )}

        </View>

        {/* ══ RIGHT: player ═══════════════════════════════════════════ */}
        <View style={styles.rightPanel}>
          {/* Hidden WebView — absolutely positioned, covered by solid overlay */}
          {watchUrl ? (
            <WebView
              key={currentTrack!.videoId}
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
          {/* Solid cover — hides YouTube UI */}
          <View style={styles.playerCover} />

          {currentTrack ? (
            <View style={[styles.playerContent, { paddingBottom: insets.bottom + 8 }]}>
              {/* Album art */}
              {currentTrack.thumbnail ? (
                <Image source={{ uri: currentTrack.thumbnail }} style={styles.bigArt} resizeMode="cover" />
              ) : (
                <View style={[styles.bigArt, styles.bigArtPlaceholder]}>
                  <Feather name="music" size={52} color={Colors.dark.accent} />
                </View>
              )}

              {/* Loading spinner overlay on art */}
              {isLoading ? (
                <View style={styles.artLoadingOverlay}>
                  <ActivityIndicator color={Colors.dark.accent} size="large" />
                </View>
              ) : null}

              {/* Track title + artist */}
              <View style={styles.trackMetaBlock}>
                <ThemedText style={styles.bigTitle} numberOfLines={2}>{currentTrack.title}</ThemedText>
                <ThemedText style={styles.bigArtist} numberOfLines={1}>
                  {currentTrack.artist}{currentTrack.album ? ` · ${currentTrack.album}` : ""}
                </ThemedText>
              </View>

              {/* Progress bar */}
              <Pressable
                style={styles.progressWrap}
                onPress={handleProgressTap}
                onLayout={handleProgressLayout}
                hitSlop={{ top: 12, bottom: 12 }}
              >
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { flex: progress }]} />
                  {progress > 0 && <View style={styles.progressDot} />}
                  <View style={{ flex: Math.max(0.001, 1 - progress) }} />
                </View>
              </Pressable>

              {/* Time row */}
              <View style={styles.timeRow}>
                <ThemedText style={styles.timeText}>{fmtTime(currentTime)}</ThemedText>
                <ThemedText style={styles.timeText}>{fmtTime(duration)}</ThemedText>
              </View>

              {/* Error */}
              {(streamError || resolveError) ? (
                <ThemedText style={styles.miniError} numberOfLines={1}>{streamError || resolveError}</ThemedText>
              ) : null}

              {/* Controls */}
              <View style={styles.controlsRow}>
                <FocusPressable style={styles.ctrlBtn} onPress={handleSkipPrev} hitSlop={10}>
                  <Feather name="skip-back" size={22} color={Colors.dark.textSecondary} />
                </FocusPressable>
                <FocusPressable style={styles.ctrlBtn} onPress={() => jsSeek(Math.max(0, currentTime - 10))} hitSlop={10}>
                  <Feather name="rotate-ccw" size={20} color={Colors.dark.textSecondary} />
                </FocusPressable>
                <FocusPressable variant="solid" style={styles.playBtn} onPress={() => {
                  if (isPlaying) { setPlayerState(YT_PAUSED); jsPause(); }
                  else { setPlayerState(YT_PLAYING); jsPlay(); }
                }}>
                  <Feather name={isPlaying ? "pause" : "play"} size={26} color="#fff" />
                </FocusPressable>
                <FocusPressable style={styles.ctrlBtn} onPress={() => jsSeek(Math.min(duration || 999999, currentTime + 10))} hitSlop={10}>
                  <Feather name="rotate-cw" size={20} color={Colors.dark.textSecondary} />
                </FocusPressable>
                <FocusPressable style={styles.ctrlBtn} onPress={handleSkipNext} hitSlop={10}>
                  <Feather name="skip-forward" size={22} color={Colors.dark.textSecondary} />
                </FocusPressable>
              </View>

              {/* Repeat / Shuffle + Like / Add  */}
              <View style={styles.secondaryRow}>
                <FocusPressable style={[styles.toggleBtn, repeat && styles.toggleBtnActive]} onPress={() => setRepeat((r) => !r)} hitSlop={10}>
                  <Feather name="repeat" size={16} color={repeat ? Colors.dark.accent : Colors.dark.textSecondary} />
                  <ThemedText style={[styles.toggleLabel, repeat && styles.toggleLabelActive]}>Repeat</ThemedText>
                </FocusPressable>
                <FocusPressable style={[styles.toggleBtn, shuffle && styles.toggleBtnActive]} onPress={() => setShuffle((s) => !s)} hitSlop={10}>
                  <Feather name="shuffle" size={16} color={shuffle ? Colors.dark.accent : Colors.dark.textSecondary} />
                  <ThemedText style={[styles.toggleLabel, shuffle && styles.toggleLabelActive]}>Shuffle</ThemedText>
                </FocusPressable>
                <View style={styles.secondaryDivider} />
                {likedPlaylistId ? (
                  <FocusPressable style={styles.actionBtn} onPress={() => handleLike(currentTrack)} hitSlop={12}>
                    <Feather name="heart" size={22} color={likedKeys.has(currentTrack.searchKey) ? "#e11d48" : Colors.dark.textSecondary} />
                  </FocusPressable>
                ) : null}
                {playlists.length > 0 ? (
                  <FocusPressable style={styles.actionBtn} onPress={() => openAddModal(currentTrack)} hitSlop={12}>
                    <Feather name="plus-circle" size={22} color={Colors.dark.textSecondary} />
                  </FocusPressable>
                ) : null}
              </View>

              {/* Context chip */}
              {contextName ? (
                <View style={styles.contextChip}>
                  <Feather name="music" size={10} color={Colors.dark.accent} />
                  <ThemedText style={styles.contextChipText} numberOfLines={1}>From: {contextName}</ThemedText>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.playerEmpty}>
              <Feather name="music" size={64} color="rgba(255,102,0,0.12)" />
              <ThemedText style={styles.playerEmptyTitle}>Nothing Playing</ThemedText>
              <ThemedText style={styles.playerEmptyHint}>Search and select a track on the left</ThemedText>
            </View>
          )}
        </View>
      </View>

      {/* ── Add-to-playlist modal ──────────────────────────────────── */}
      <Modal
        visible={trackAddModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setTrackAddModal(null)}
        statusBarTranslucent
      >
        <Pressable style={styles.modalOverlay} onPress={() => setTrackAddModal(null)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <ThemedText style={styles.modalTitle}>Add to Playlist</ThemedText>
            {trackAddModal ? (
              <ThemedText style={styles.modalTrackName} numberOfLines={1}>
                {trackAddModal.title} — {trackAddModal.artist}
              </ThemedText>
            ) : null}
            <FlatList
              data={playlists}
              keyExtractor={(p) => p.id}
              style={styles.modalList}
              renderItem={({ item }) => (
                <FocusPressable
                  style={[styles.modalPlaylistRow, playlistAdded.has(item.id) && { opacity: 0.7 }]}
                  onPress={() => { if (!playlistAdded.has(item.id)) handleAddToPlaylist(item.id); }}
                >
                  <View style={[styles.modalPlaylistIcon, item.isLikedSongs && styles.modalPlaylistIconLiked]}>
                    <Feather name={item.isLikedSongs ? "heart" : "music"} size={13} color="#fff" />
                  </View>
                  <ThemedText style={styles.modalPlaylistName} numberOfLines={1}>{item.name}</ThemedText>
                  <ThemedText style={styles.modalPlaylistCount}>{item.trackCount}</ThemedText>
                  {playlistAdded.has(item.id)
                    ? <Feather name="check" size={15} color="#22c55e" />
                    : <Feather name="plus" size={15} color={Colors.dark.textSecondary} />
                  }
                </FocusPressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const ACCENT = Colors.dark.accent;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },

  header: { flexDirection: "row", alignItems: "center", paddingBottom: Spacing.sm, gap: Spacing.sm },
  backBtn: { padding: 6, borderRadius: BorderRadius.sm, borderWidth: 1.5, borderColor: "transparent" },
  headerTitle: { fontSize: 20, fontWeight: "700", color: Colors.dark.text },
  betaBadge: {
    backgroundColor: "rgba(255,102,0,0.18)",
    borderWidth: 1, borderColor: "rgba(255,102,0,0.45)",
    borderRadius: BorderRadius.xs,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  betaBadgeText: { fontSize: 9, fontWeight: "800", color: Colors.dark.accent, letterSpacing: 0.8 },

  focusDefault: { borderWidth: 1.5, borderColor: ACCENT, backgroundColor: "rgba(255,102,0,0.1)" },
  focusSolid: { borderWidth: 1.5, borderColor: "rgba(255,255,255,0.75)" },

  infoBtn: { padding: 6, borderRadius: BorderRadius.sm, borderWidth: 1.5, borderColor: "transparent" },
  clearBtn: { padding: 4, borderRadius: BorderRadius.sm, borderWidth: 1.5, borderColor: "transparent" },
  infoOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", alignItems: "center", paddingHorizontal: Spacing.xl },
  infoCard: { width: "100%", maxWidth: 420, backgroundColor: "#161616", borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", padding: Spacing.xl, gap: Spacing.md },
  infoCardHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  infoCardTitle: { fontSize: 15, fontWeight: "700", color: Colors.dark.text },
  infoCardBody: { fontSize: 13, color: Colors.dark.textSecondary, lineHeight: 20 },
  infoCardClose: { alignSelf: "flex-end", marginTop: Spacing.xs, backgroundColor: Colors.dark.accent, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.lg, paddingVertical: 8 },
  infoCardCloseText: { fontSize: 13, fontWeight: "700", color: "#fff" },

  // ── Layout
  body: { flex: 1, flexDirection: "row" },

  leftPanel: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.06)",
  },

  rightPanel: {
    flex: 1,
    overflow: "hidden",
  },

  playerCover: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.dark.backgroundRoot },

  playerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    gap: 10,
  },

  bigArt: {
    width: 168,
    height: 168,
    borderRadius: BorderRadius.lg,
  },
  bigArtPlaceholder: {
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  artLoadingOverlay: {
    position: "absolute",
    width: 168,
    height: 168,
    borderRadius: BorderRadius.lg,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },

  trackMetaBlock: { alignItems: "center", gap: 4, width: "100%" },
  bigTitle: { fontSize: 16, fontWeight: "700", color: Colors.dark.text, textAlign: "center" },
  bigArtist: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center" },

  progressWrap: { width: "100%", paddingHorizontal: 4 },
  progressTrack: { flexDirection: "row", alignItems: "center", height: 4, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: ACCENT, borderRadius: 2 },
  progressDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: ACCENT, marginHorizontal: -6 },

  timeRow: { flexDirection: "row", justifyContent: "space-between", width: "100%", paddingHorizontal: 4 },
  timeText: { fontSize: 11, color: Colors.dark.textSecondary },

  miniError: { fontSize: 11, color: "#ef4444", textAlign: "center" },

  controlsRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  ctrlBtn: { padding: 9, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: "transparent" },
  playBtn: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: ACCENT, justifyContent: "center", alignItems: "center",
    elevation: 4, borderWidth: 1.5, borderColor: "transparent",
  },

  secondaryRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, flexWrap: "wrap", justifyContent: "center" },
  secondaryDivider: { width: 1, height: 20, backgroundColor: "rgba(255,255,255,0.1)", marginHorizontal: 4 },
  toggleBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: "transparent",
  },
  toggleBtnActive: { borderColor: "rgba(255,102,0,0.35)", backgroundColor: "rgba(255,102,0,0.10)" },
  toggleLabel: { fontSize: 11, color: Colors.dark.textSecondary },
  toggleLabelActive: { color: Colors.dark.accent, fontWeight: "600" },
  actionBtn: { padding: 9, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: "transparent" },

  contextChip: { flexDirection: "row", alignItems: "center", gap: 5 },
  contextChipText: { fontSize: 10, color: Colors.dark.accent, fontWeight: "600" },

  playerEmpty: { flex: 1, justifyContent: "center", alignItems: "center", gap: Spacing.md, paddingHorizontal: Spacing.xl },
  playerEmptyTitle: { fontSize: 16, fontWeight: "700", color: Colors.dark.text },
  playerEmptyHint: { fontSize: 12, color: Colors.dark.textSecondary, textAlign: "center" },

  // ── Search
  searchWrap: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.sm },
  searchBar: {
    flex: 1, flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.dark.border,
    paddingHorizontal: Spacing.md, height: 42,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.dark.text, paddingVertical: 0 },
  searchBtn: {
    backgroundColor: ACCENT, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg, height: 42,
    justifyContent: "center", alignItems: "center", minWidth: 72,
    borderWidth: 1.5, borderColor: "transparent",
  },
  searchBtnDisabled: { opacity: 0.4 },
  searchBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },

  list: { flex: 1 },
  listContent: { paddingHorizontal: Spacing.sm },

  trackRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md, marginBottom: 2, gap: Spacing.sm,
    borderWidth: 1, borderColor: "transparent",
  },
  trackRowActive: { backgroundColor: "rgba(255,102,0,0.10)", borderColor: "rgba(255,102,0,0.22)" },
  thumbWrap: { width: 46, height: 46, borderRadius: BorderRadius.sm, overflow: "hidden" },
  thumbImg: { width: "100%", height: "100%" },
  thumbPlaceholder: { width: "100%", height: "100%", backgroundColor: Colors.dark.backgroundSecondary, justifyContent: "center", alignItems: "center" },
  thumbOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center" },
  trackInfo: { flex: 1, gap: 2 },
  trackTitle: { fontSize: 13, fontWeight: "600", color: Colors.dark.text },
  trackTitleActive: { color: ACCENT },
  trackArtist: { fontSize: 11, color: Colors.dark.textSecondary },
  trackDuration: { fontSize: 11, color: Colors.dark.textSecondary, minWidth: 34, textAlign: "right" },
  trackIconBtn: { padding: 8, borderRadius: BorderRadius.sm, borderWidth: 1.5, borderColor: "transparent" },

  centred: { flex: 1, justifyContent: "center", alignItems: "center", gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: Colors.dark.text, textAlign: "center" },
  emptySubtitle: { fontSize: 12, color: Colors.dark.textSecondary, textAlign: "center", lineHeight: 18 },
  errorText: { fontSize: 13, color: "#ef4444", textAlign: "center" },
  retryBtn: { backgroundColor: ACCENT, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderWidth: 1.5, borderColor: "transparent" },
  retryBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },

  // ── Mode toggle strip
  modeStrip: {
    flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)",
  },
  modeTab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingVertical: 9,
    borderWidth: 1.5, borderColor: "transparent", borderRadius: 0,
  },
  modeTabActive: {
    borderBottomColor: ACCENT,
  },
  modeTabText: { fontSize: 12, fontWeight: "600", color: Colors.dark.textSecondary },
  modeTabTextActive: { color: ACCENT },

  // ── Drill / rich results
  drillHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)",
  },
  drillBack: {
    flexDirection: "row", alignItems: "center", gap: 6, flex: 1,
    padding: 6, borderRadius: BorderRadius.sm, borderWidth: 1.5, borderColor: "transparent",
  },
  drillBackText: { fontSize: 14, fontWeight: "700", color: ACCENT, flex: 1 },
  drillSectionTitle: {
    fontSize: 10, fontWeight: "800", color: Colors.dark.textSecondary, letterSpacing: 1.2,
    paddingHorizontal: Spacing.sm, paddingTop: Spacing.md, paddingBottom: Spacing.xs,
  },
  hChips: { paddingHorizontal: Spacing.sm, gap: 10, paddingBottom: Spacing.sm },

  artistCard: { width: 90, alignItems: "center", gap: 5 },
  artistCardFocused: { backgroundColor: "rgba(255,102,0,0.08)", borderRadius: BorderRadius.md, padding: 4 },
  artistAvatar: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: "rgba(255,102,0,0.10)", borderWidth: 1.5,
    borderColor: "rgba(255,102,0,0.35)" as any,
    justifyContent: "center", alignItems: "center",
  },
  artistAvatarFocused: { borderColor: ACCENT },
  artistCardName: { fontSize: 11, fontWeight: "600", color: Colors.dark.text, textAlign: "center" },
  artistCardGenre: { fontSize: 10, color: Colors.dark.textSecondary, textAlign: "center" },

  albumCard: { width: 92 },
  albumCardFocused: { opacity: 0.8 },
  albumCardArt: { width: 92, height: 92, borderRadius: BorderRadius.md, marginBottom: 5 },
  albumCardArtPh: { backgroundColor: Colors.dark.backgroundSecondary, justifyContent: "center", alignItems: "center" },
  albumCardName: { fontSize: 11, fontWeight: "600", color: Colors.dark.text },
  albumCardMeta: { fontSize: 10, color: Colors.dark.textSecondary },

  // ── Add-to-playlist modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: "#141414",
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
    maxHeight: "70%",
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "center", marginTop: 12, marginBottom: 14 },
  modalTitle: { fontSize: 16, fontWeight: "700", color: Colors.dark.text, paddingHorizontal: 20, marginBottom: 3 },
  modalTrackName: { fontSize: 12, color: Colors.dark.textSecondary, paddingHorizontal: 20, marginBottom: 14 },
  modalList: { flexGrow: 0 },
  modalPlaylistRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)", gap: 12,
    borderWidth: 1, borderColor: "transparent", borderRadius: 4,
  },
  modalPlaylistIcon: { width: 32, height: 32, borderRadius: 7, backgroundColor: Colors.dark.accent, justifyContent: "center", alignItems: "center" },
  modalPlaylistIconLiked: { backgroundColor: "#e11d48" },
  modalPlaylistName: { flex: 1, fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  modalPlaylistCount: { fontSize: 12, color: Colors.dark.textSecondary },
});
