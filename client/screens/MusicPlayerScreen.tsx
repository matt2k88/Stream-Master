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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useNavigation } from "@react-navigation/native";
import { getApiUrl } from "@/lib/query-client";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { LinearGradient } from "expo-linear-gradient";

interface Track {
  videoId: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail: string;
}

function fmtTime(sec: number): string {
  if (!sec || isNaN(sec)) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

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
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState("");

  const inputRef = useRef<TextInput>(null);

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  const isPlaying = status?.playing ?? false;
  const currentTime = status?.currentTime ?? 0;
  const duration = status?.duration ?? 0;
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setSearchError("");
    setResults([]);
    inputRef.current?.blur();
    try {
      const r = await fetch(
        `${getApiUrl()}/api/music/search?q=${encodeURIComponent(q)}`
      );
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
      if (streamLoading) return;
      if (currentTrack?.videoId === track.videoId) {
        isPlaying ? player.pause() : player.play();
        return;
      }
      setCurrentTrack(track);
      setStreamError("");
      setStreamLoading(true);
      try {
        const r = await fetch(
          `${getApiUrl()}/api/music/stream?videoId=${track.videoId}`
        );
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Could not load track");
        player.replace({ uri: data.url });
        player.play();
      } catch (err: any) {
        setStreamError(err.message ?? "Playback failed");
        setCurrentTrack(null);
      } finally {
        setStreamLoading(false);
      }
    },
    [streamLoading, currentTrack, isPlaying, player]
  );

  const padTop = insets.top + (Platform.OS === "android" ? 8 : 4);

  return (
    <ThemedView style={styles.root}>
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
            <Pressable
              hitSlop={8}
              onPress={() => {
                setQuery("");
                setResults([]);
                setSearchError("");
              }}
            >
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
              isActive={currentTrack?.videoId === item.videoId && (isPlaying || streamLoading)}
              isLoading={currentTrack?.videoId === item.videoId && streamLoading}
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

            {streamLoading ? (
              <ActivityIndicator color={Colors.dark.accent} size="small" style={styles.controlBtn} />
            ) : (
              <>
                <Pressable
                  style={styles.controlBtn}
                  onPress={() => player.seekTo(Math.max(0, currentTime - 10))}
                  hitSlop={8}
                >
                  <Feather name="rotate-ccw" size={18} color={Colors.dark.textSecondary} />
                </Pressable>
                <Pressable
                  style={styles.playBtn}
                  onPress={() => (isPlaying ? player.pause() : player.play())}
                >
                  <Feather name={isPlaying ? "pause" : "play"} size={22} color="#fff" />
                </Pressable>
                <Pressable
                  style={styles.controlBtn}
                  onPress={() => player.seekTo(Math.min(duration, currentTime + 10))}
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

  // ── Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  backBtn: {
    padding: 4,
  },
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
  searchBtnDisabled: {
    opacity: 0.4,
  },
  searchBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },

  // ── Results list
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
  },

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
  thumbImg: {
    width: "100%",
    height: "100%",
  },
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
  trackInfo: {
    flex: 1,
    gap: 3,
  },
  trackTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  trackTitleActive: {
    color: ACCENT,
  },
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
    marginTop: 0,
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
  controlBtn: {
    padding: Spacing.sm,
  },
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
