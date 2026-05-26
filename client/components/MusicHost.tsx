import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useMusic } from "@/contexts/MusicContext";
import { getApiUrl } from "@/lib/query-client";
import { navigationRef } from "@/lib/navigation-ref";

/**
 * MusicHost — persistent audio engine + mini bar for the music section.
 *
 * Audio comes from yt-dlp extracting a direct googlevideo CDN URL on the
 * server (no WebView, no embed restrictions). The player is implemented
 * with expo-audio's useAudioPlayer hook — audio-only, no Surface required
 * (which is what made the old expo-video + 1×1 VideoView approach flaky
 * on Android ExoPlayer).
 *
 * Scoping: the mini bar + audio are only active while the user is on a
 * music-related screen. Navigating away pauses playback and hides the
 * bar; re-entering the music section restores the last track (paused).
 */

const BAR_HEIGHT = 72;
const BAR_MARGIN = Spacing.md;

const MUSIC_ROUTES = new Set([
  "MusicHome",
  "MusicSearch",
  "MusicPlaylists",
  "MusicPlaylistDetail",
  "NowPlaying",
]);

function buildAudioProxyUrl(videoId: string): string {
  // Server-side proxy. We can't load googlevideo CDN URLs directly from
  // the client — they're signed with the requesting IP, which won't match
  // the device. The proxy refetches with the server IP and pipes back.
  return new URL(`/api/music/audio/${videoId}`, getApiUrl()).toString();
}

function useActiveRouteName(): string | undefined {
  const [name, setName] = useState<string | undefined>(undefined);
  useEffect(() => {
    const update = () => {
      try {
        if (!navigationRef.isReady()) return;
        setName(navigationRef.getCurrentRoute()?.name);
      } catch {}
    };
    update();
    const unsub = navigationRef.addListener?.("state", update);
    return () => { try { unsub?.(); } catch {} };
  }, []);
  return name;
}

export default function MusicHost() {
  const {
    current, videoId, playState, position, duration,
    _registerController, _onPlayerEvent, resume, pause, next, previous, setExpanded,
  } = useMusic();

  const routeName = useActiveRouteName();
  const inMusicSection = !!routeName && MUSIC_ROUTES.has(routeName);

  const activeVidRef = useRef<string | null>(null);
  // Tracks whether we should auto-play once the source becomes ready (e.g.
  // user pressed play before stream URL resolved).
  const wantPlayRef = useRef(false);
  const inMusicRef = useRef(inMusicSection);
  inMusicRef.current = inMusicSection;
  // Have we ever successfully played a track this session? Used to detect
  // first-load and to gate the autoplay-unlock priming on web.
  const everPlayedRef = useRef(false);

  // 250ms update interval gives a smooth progress bar without spam.
  const player = useAudioPlayer(null, 250);

  // Configure audio session once on mount. iOS needs playsInSilentMode so
  // the device's mute switch doesn't kill playback; both platforms benefit
  // from shouldPlayInBackground so audio survives lock-screen on real
  // builds (no-op in Expo Go without background-audio entitlement, but
  // harmless).
  useEffect(() => {
    (async () => {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: "duckOthers",
        } as any);
      } catch (e: any) {
        console.warn("[music] setAudioModeAsync failed", e?.message);
      }
    })();
  }, []);

  // Pause whenever we leave the music section.
  useEffect(() => {
    if (!inMusicSection) {
      try { player.pause(); } catch {}
      wantPlayRef.current = false;
    }
  }, [inMusicSection, player]);

  // Load the resolved stream into the player whenever videoId changes.
  useEffect(() => {
    if (!videoId) {
      activeVidRef.current = null;
      // expo-audio doesn't accept null on replace; just pause.
      try { player.pause(); } catch {}
      return;
    }
    activeVidRef.current = videoId;
    wantPlayRef.current = true;
    const url = buildAudioProxyUrl(videoId);
    console.log("[music] loading proxy stream for", videoId, "→", url);
    try {
      player.replace({ uri: url });
      // Start playing immediately. If the buffer isn't ready yet,
      // statusChange will re-arm play() once playable.
      if (inMusicRef.current) {
        try { player.play(); } catch {}
      }
    } catch (e: any) {
      console.warn("[music] replace/play failed", e?.message);
      _onPlayerEvent({ type: "error", videoId: activeVidRef.current ?? undefined });
    }
  }, [videoId, player, _onPlayerEvent]);

  // Register imperative controller for context.
  useEffect(() => {
    _registerController({
      load: (_id) => { /* triggered by videoId change effect above */ },
      play: () => {
        wantPlayRef.current = true;
        // Synchronous play() — this is what "unlocks" the underlying
        // HTMLAudioElement on web when called inside a user-gesture
        // handler (even with no source loaded, the browser then allows
        // subsequent autoplays for the lifetime of the element).
        try { player.play(); } catch {}
      },
      pause: () => {
        wantPlayRef.current = false;
        try { player.pause(); } catch {}
      },
      seek: (s) => {
        try { player.seekTo(Math.max(0, s)); } catch {}
      },
    });
    return () => _registerController(null);
  }, [player, _registerController]);

  // Forward player status to context. expo-audio emits a single
  // 'playbackStatusUpdate' event with everything in it.
  useEffect(() => {
    const sub = player.addListener("playbackStatusUpdate", (status: any) => {
      try {
        if (status?.didJustFinish) {
          _onPlayerEvent({ type: "ended" });
          return;
        }
        // expo-audio doesn't surface an explicit "error" status field
        // consistently; rely on isLoaded staying false after replace +
        // upstream HTTP failures landing as no-op. We treat
        // playbackState === "error" defensively.
        if (typeof status?.playbackState === "string" && status.playbackState.toLowerCase().includes("error")) {
          _onPlayerEvent({ type: "error", videoId: activeVidRef.current ?? undefined });
          return;
        }
        const isPlaying = !!status?.playing;
        if (isPlaying) everPlayedRef.current = true;
        _onPlayerEvent({
          type: "state",
          state: isPlaying ? "playing" : status?.isLoaded ? "paused" : "loading",
          position: Number(status?.currentTime) || 0,
          duration: Number(status?.duration) || 0,
        });
        // Re-arm play() once the source is ready, in case the initial
        // play() call landed before the buffer was warm.
        if (status?.isLoaded && !isPlaying && wantPlayRef.current && inMusicRef.current) {
          try { player.play(); } catch {}
        }
      } catch (e: any) {
        console.warn("[music] status handler", e?.message);
      }
    });
    return () => { try { sub.remove(); } catch {} };
  }, [player, _onPlayerEvent]);

  const openNowPlaying = () => {
    setExpanded(true);
    try {
      if (navigationRef.isReady()) navigationRef.navigate("NowPlaying" as never);
    } catch {}
  };

  const showBar = !!current && inMusicSection;
  const loadingLabel = !everPlayedRef.current
    ? " · loading (first track can take a few seconds)…"
    : " · loading…";

  return (
    <>
      {showBar ? (
      <Pressable
        onPress={openNowPlaying}
        style={({ pressed, hovered }: any) => [styles.bar, hovered && styles.barHover, pressed && styles.barPressed]}
      >
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
            {current.artist}{playState === "loading" ? loadingLabel : playState === "error" ? " · unavailable" : ""}
          </ThemedText>
          <View style={styles.progressTrack}>
            {playState === "loading" ? (
              <View style={styles.progressIndeterminate} />
            ) : (
              <View style={[styles.progressFill, { width: `${duration > 0 ? Math.min(100, (position / duration) * 100) : 0}%` }]} />
            )}
          </View>
        </View>
        <Pressable
          onPress={() => previous()}
          style={({ pressed, hovered }: any) => [styles.ctrlBtn, hovered && styles.ctrlHover, pressed && styles.ctrlPressed]}
          hitSlop={8}
        >
          <Feather name="skip-back" size={18} color={Colors.dark.text} />
        </Pressable>
        <Pressable
          onPress={() => playState === "playing" ? pause() : resume()}
          style={({ pressed, hovered }: any) => [styles.ctrlBtnLg, hovered && styles.ctrlLgHover, pressed && styles.ctrlLgPressed]}
          hitSlop={8}
        >
          <Feather name={playState === "playing" ? "pause" : "play"} size={22} color="#fff" />
        </Pressable>
        <Pressable
          onPress={() => next()}
          style={({ pressed, hovered }: any) => [styles.ctrlBtn, hovered && styles.ctrlHover, pressed && styles.ctrlPressed]}
          hitSlop={8}
        >
          <Feather name="skip-forward" size={18} color={Colors.dark.text} />
        </Pressable>
      </Pressable>
      ) : null}
    </>
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
  barHover: { borderColor: Colors.dark.accent, backgroundColor: "#161616" },
  barPressed: { opacity: 0.85 },
  art: { width: 56, height: 56, borderRadius: BorderRadius.sm, backgroundColor: "#1A1A1A" },
  artFallback: { alignItems: "center", justifyContent: "center" },
  meta: { flex: 1, justifyContent: "center", gap: 2 },
  title: { color: Colors.dark.text, fontSize: 13, fontWeight: "700" },
  artist: { color: Colors.dark.textSecondary, fontSize: 11 },
  progressTrack: { height: 2, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 1, marginTop: 4, overflow: "hidden" },
  progressFill: { height: 2, backgroundColor: Colors.dark.accent, borderRadius: 1 },
  progressIndeterminate: { height: 2, width: "30%", backgroundColor: Colors.dark.accent, borderRadius: 1, opacity: 0.7 },
  ctrlBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.sm },
  ctrlHover: { backgroundColor: "rgba(255,102,0,0.15)" },
  ctrlPressed: { opacity: 0.65 },
  ctrlBtnLg: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.full, backgroundColor: Colors.dark.accent },
  ctrlLgHover: { backgroundColor: "#FF7A1F" },
  ctrlLgPressed: { opacity: 0.8 },
});
