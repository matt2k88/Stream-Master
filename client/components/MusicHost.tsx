import React, { useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useMusic } from "@/contexts/MusicContext";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

/**
 * MusicHost — single audio player + persistent mini-bar. Mounted once at
 * the App root inside MusicProvider so audio survives every navigation.
 * Uses expo-audio with audio URLs extracted server-side by yt-dlp.
 */

type Nav = NativeStackNavigationProp<RootStackParamList>;

const BAR_HEIGHT = 72;
const BAR_MARGIN = Spacing.md;

export default function MusicHost() {
  const {
    current, audioUrl, isPreview, playState, expanded, position, duration,
    _registerController, _onPlayerEvent, resume, pause, next, previous, setExpanded,
  } = useMusic();

  // expo-audio: pass null to clear, URL to load. Player auto-plays once
  // ready via the autoplay effect below.
  const player = useAudioPlayer(audioUrl ?? null, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const navigation = useNavigation<Nav>();

  // Track which URL the player is currently loaded with, so we don't
  // double-replace and reset playback.
  const loadedUrlRef = useRef<string | null>(null);
  const reportedErrorRef = useRef(false);

  // Register controller (play/pause/seek) so context can drive the player.
  useEffect(() => {
    _registerController({
      play: () => { try { player.play(); } catch {} },
      pause: () => { try { player.pause(); } catch {} },
      seek: (s: number) => { try { player.seekTo(s); } catch {} },
    });
    return () => _registerController(null);
  }, [_registerController, player]);

  // When audioUrl changes, replace source and auto-play.
  useEffect(() => {
    if (!audioUrl) {
      loadedUrlRef.current = null;
      reportedErrorRef.current = false;
      return;
    }
    if (loadedUrlRef.current === audioUrl) return;
    loadedUrlRef.current = audioUrl;
    reportedErrorRef.current = false;
    try {
      player.replace(audioUrl);
      // Slight delay before play so iOS finishes loading metadata
      setTimeout(() => { try { player.play(); } catch {} }, 100);
    } catch {}
  }, [audioUrl, player]);

  // Bridge expo-audio status → MusicContext state machine.
  useEffect(() => {
    if (!status) return;
    // Detect playback errors and emit exactly one error per loaded URL so
    // MusicContext can refresh the (likely expired) extracted audio URL.
    if (status.error && !reportedErrorRef.current) {
      reportedErrorRef.current = true;
      _onPlayerEvent({ type: "error" });
      return;
    }
    // Map AudioStatus → our PlayState. Buffering/interruption → loading,
    // never `ended` (that flag is reserved for true end-of-track).
    let state: "loading" | "playing" | "paused" | "ended" | "error" | "idle" = "idle";
    if (!status.isLoaded || status.isBuffering) state = "loading";
    else if (status.playing) state = "playing";
    else state = "paused";
    _onPlayerEvent({
      type: "state",
      state: state as any,
      position: status.currentTime || 0,
      duration: status.duration || 0,
    });
    if (status.didJustFinish) {
      _onPlayerEvent({ type: "ended" });
    }
  }, [status, _onPlayerEvent]);

  if (!current) return null;

  const openNowPlaying = () => {
    setExpanded(true);
    navigation.navigate("NowPlaying");
  };

  if (expanded) {
    // NowPlayingScreen owns the UI when expanded.
    return null;
  }

  return (
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
          {current.artist}
          {playState === "loading" ? " · loading…" : ""}
          {playState === "error" ? " · unavailable" : ""}
          {isPreview && playState !== "loading" ? " · preview (30s)" : ""}
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    zIndex: 999,
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
});
