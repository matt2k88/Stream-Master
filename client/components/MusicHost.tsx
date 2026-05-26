import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable, Platform, useWindowDimensions } from "react-native";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useMusic } from "@/contexts/MusicContext";
import { getApiUrl } from "@/lib/query-client";
import { navigationRef } from "@/lib/navigation-ref";

/**
 * MusicHost — persistent audio engine + player UI for the music section.
 *
 * Audio comes from yt-dlp extracting a direct googlevideo CDN URL on the
 * server (no WebView, no embed restrictions). The player is implemented
 * with expo-audio's useAudioPlayer hook — audio-only, no Surface required.
 *
 * Layout adapts to orientation:
 *   - Landscape (TV / wide screen): renders as a FIXED RIGHT SIDEBAR so the
 *     user never has to scroll past content to reach the player. Browse
 *     screens reserve a matching right-inset so their content lives on the
 *     left half / two-thirds of the screen.
 *   - Portrait (phone): renders as a bottom mini-bar (original layout).
 *
 * Scoping: the player UI + audio are only active while the user is on a
 * music-related screen. Navigating away pauses playback and hides the
 * panel; re-entering the music section restores the last track (paused).
 */

const BAR_HEIGHT = 72;
const BAR_MARGIN = Spacing.md;

// Sidebar width used in landscape. Screens import this so their content
// can reserve a matching right inset.
export const MUSIC_SIDEBAR_WIDTH = 320;
export const MUSIC_SIDEBAR_GAP = Spacing.md;
export const MUSIC_BOTTOM_BAR_HEIGHT = BAR_HEIGHT + BAR_MARGIN;

/**
 * Returns layout info music screens use to pad their content so the
 * player panel never overlaps. Call inside any music screen.
 */
export function useMusicLayout() {
  const { width, height } = useWindowDimensions();
  const { current } = useMusic();
  // Only show the right-side sidebar on genuinely large landscape surfaces
  // (tablets / TVs). Phones in landscape (typically <900px wide and <500px
  // tall) fall back to the bottom mini-bar so controls never clip off-screen.
  const isLandscape = width > height && width >= 900 && height >= 500;
  const hasTrack = !!current;
  return {
    isLandscape,
    sidebarActive: isLandscape && hasTrack,
    bottomBarActive: !isLandscape && hasTrack,
    rightInset: isLandscape && hasTrack ? MUSIC_SIDEBAR_WIDTH + MUSIC_SIDEBAR_GAP * 2 : 0,
    bottomInset: !isLandscape && hasTrack ? MUSIC_BOTTOM_BAR_HEIGHT : 0,
  };
}

const MUSIC_ROUTES = new Set([
  "MusicHome",
  "MusicSearch",
  "MusicPlaylists",
  "MusicPlaylistDetail",
  "NowPlaying",
]);

function buildAudioProxyUrl(videoId: string): string {
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
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height && width >= 900 && height >= 500;

  const activeVidRef = useRef<string | null>(null);
  const wantPlayRef = useRef(false);
  const inMusicRef = useRef(inMusicSection);
  inMusicRef.current = inMusicSection;
  const everPlayedRef = useRef(false);

  const player = useAudioPlayer(null, 250);

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

  useEffect(() => {
    if (!inMusicSection) {
      try { player.pause(); } catch {}
      wantPlayRef.current = false;
    }
  }, [inMusicSection, player]);

  useEffect(() => {
    if (!videoId) {
      activeVidRef.current = null;
      try { player.pause(); } catch {}
      return;
    }
    activeVidRef.current = videoId;
    wantPlayRef.current = true;
    const url = buildAudioProxyUrl(videoId);
    console.log("[music] loading proxy stream for", videoId, "→", url);
    try {
      player.replace({ uri: url });
      if (inMusicRef.current) {
        try { player.play(); } catch {}
      }
    } catch (e: any) {
      console.warn("[music] replace/play failed", e?.message);
      _onPlayerEvent({ type: "error", videoId: activeVidRef.current ?? undefined });
    }
  }, [videoId, player, _onPlayerEvent]);

  useEffect(() => {
    _registerController({
      load: (_id) => { /* triggered by videoId change effect above */ },
      play: () => {
        wantPlayRef.current = true;
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

  useEffect(() => {
    const sub = player.addListener("playbackStatusUpdate", (status: any) => {
      try {
        if (status?.didJustFinish) {
          _onPlayerEvent({ type: "ended" });
          return;
        }
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

  if (!showBar) return null;
  const isLoading = playState === "loading";
  const isError = playState === "error";
  const progressPct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  // ---------- LANDSCAPE: right-side sidebar ----------
  if (isLandscape) {
    return (
      <View
        style={[
          styles.sidebar,
          {
            top: insets.top + MUSIC_SIDEBAR_GAP,
            bottom: insets.bottom + MUSIC_SIDEBAR_GAP,
            right: MUSIC_SIDEBAR_GAP,
            width: MUSIC_SIDEBAR_WIDTH,
          },
        ]}
        // pointerEvents handled implicitly; children get touch events.
      >
        <Pressable
          onPress={openNowPlaying}
          style={({ pressed, hovered }: any) => [styles.sideArtBtn, hovered && styles.sideArtHover, pressed && { opacity: 0.85 }]}
        >
          {current.artwork_url ? (
            <Image source={{ uri: current.artwork_url }} style={styles.sideArt} contentFit="cover" />
          ) : (
            <View style={[styles.sideArt, styles.sideArtFallback]}>
              <Feather name="music" size={56} color={Colors.dark.accent} />
            </View>
          )}
          <View style={styles.sideExpandHint}>
            <Feather name="maximize-2" size={14} color="#fff" />
          </View>
        </Pressable>

        <View style={styles.sideMeta}>
          <ThemedText style={styles.sideTitle} numberOfLines={2}>{current.title}</ThemedText>
          <ThemedText style={styles.sideArtist} numberOfLines={1}>
            {current.artist}{isLoading ? loadingLabel : isError ? " · unavailable" : ""}
          </ThemedText>
        </View>

        <View style={styles.sideProgressTrack}>
          {isLoading ? (
            <View style={styles.progressIndeterminate} />
          ) : (
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          )}
        </View>

        <View style={styles.sideControls}>
          <Pressable
            onPress={() => previous()}
            style={({ pressed, hovered, focused }: any) => [styles.ctrlBtn, (hovered || focused) && styles.ctrlHover, pressed && styles.ctrlPressed]}
            hitSlop={8}
          >
            <Feather name="skip-back" size={22} color={Colors.dark.text} />
          </Pressable>
          <Pressable
            onPress={() => playState === "playing" ? pause() : resume()}
            style={({ pressed, hovered, focused }: any) => [styles.ctrlBtnXl, (hovered || focused) && styles.ctrlLgHover, pressed && styles.ctrlLgPressed]}
            hitSlop={8}
          >
            <Feather name={playState === "playing" ? "pause" : "play"} size={28} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => next()}
            style={({ pressed, hovered, focused }: any) => [styles.ctrlBtn, (hovered || focused) && styles.ctrlHover, pressed && styles.ctrlPressed]}
            hitSlop={8}
          >
            <Feather name="skip-forward" size={22} color={Colors.dark.text} />
          </Pressable>
        </View>

        <Pressable
          onPress={openNowPlaying}
          style={({ pressed, hovered, focused }: any) => [styles.sideExpandBtn, (hovered || focused) && styles.sideExpandBtnHover, pressed && { opacity: 0.85 }]}
        >
          <Feather name="maximize-2" size={14} color={Colors.dark.text} />
          <ThemedText style={styles.sideExpandText}>Open Player</ThemedText>
        </Pressable>
      </View>
    );
  }

  // ---------- PORTRAIT: bottom mini-bar (original) ----------
  return (
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
          {current.artist}{isLoading ? loadingLabel : isError ? " · unavailable" : ""}
        </ThemedText>
        <View style={styles.progressTrack}>
          {isLoading ? (
            <View style={styles.progressIndeterminate} />
          ) : (
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
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
  );
}

const styles = StyleSheet.create({
  // --- Bottom bar (portrait) ---
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

  // --- Common controls ---
  ctrlBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.sm },
  ctrlHover: { backgroundColor: "rgba(255,102,0,0.18)" },
  ctrlPressed: { opacity: 0.65 },
  ctrlBtnLg: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.full, backgroundColor: Colors.dark.accent },
  ctrlBtnXl: { width: 60, height: 60, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.full, backgroundColor: Colors.dark.accent },
  ctrlLgHover: { backgroundColor: "#FF7A1F" },
  ctrlLgPressed: { opacity: 0.8 },

  // --- Sidebar (landscape) ---
  sidebar: {
    zIndex: 999,
    position: "absolute",
    backgroundColor: "#0F0F0F",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "center",
    gap: Spacing.md,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: -2, height: 4 } },
      android: { elevation: 12 },
      default: {},
    }),
  },
  sideArtBtn: { width: 200, height: 200, alignSelf: "center", borderRadius: BorderRadius.sm, overflow: "hidden", backgroundColor: "#1A1A1A", borderWidth: 1, borderColor: "transparent" },
  sideArtHover: { borderColor: Colors.dark.accent },
  sideArt: { width: "100%", height: "100%" },
  sideArtFallback: { alignItems: "center", justifyContent: "center" },
  sideExpandHint: {
    position: "absolute", top: 8, right: 8,
    width: 28, height: 28, alignItems: "center", justifyContent: "center",
    borderRadius: BorderRadius.full, backgroundColor: "rgba(0,0,0,0.55)",
  },
  sideMeta: { width: "100%", alignItems: "center", gap: 4 },
  sideTitle: { color: Colors.dark.text, fontSize: 16, fontWeight: "700", textAlign: "center" },
  sideArtist: { color: Colors.dark.textSecondary, fontSize: 12, textAlign: "center" },
  sideProgressTrack: { width: "100%", height: 3, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 2, overflow: "hidden" },
  sideControls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.md },
  sideExpandBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: Spacing.sm, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.dark.border,
    width: "100%",
  },
  sideExpandBtnHover: { borderColor: Colors.dark.accent, backgroundColor: "rgba(255,102,0,0.08)" },
  sideExpandText: { color: Colors.dark.text, fontSize: 13, fontWeight: "600" },
});
