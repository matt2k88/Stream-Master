import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useMusic } from "@/contexts/MusicContext";
import { getApiUrl } from "@/lib/query-client";
import { navigationRef } from "@/App";

/**
 * MusicHost — persistent audio engine + mini bar for the music section.
 *
 * Audio comes from yt-dlp extracting a direct googlevideo CDN URL on the
 * server (no WebView, no embed restrictions). The player is implemented
 * with expo-video's useVideoPlayer hook + a hidden 1×1 VideoView so the
 * native AV engine stays alive.
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

async function fetchStreamUrl(videoId: string): Promise<string | null> {
  try {
    const url = new URL(`/api/music/stream/${videoId}`, getApiUrl());
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.warn("[music] stream fetch failed", videoId, res.status);
      return null;
    }
    const data = await res.json();
    return typeof data?.url === "string" ? data.url : null;
  } catch (e: any) {
    console.warn("[music] stream fetch error", videoId, e?.message);
    return null;
  }
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

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const activeVidRef = useRef<string | null>(null);
  // Tracks whether we should auto-play once the source becomes ready (e.g.
  // user pressed play before stream URL resolved).
  const wantPlayRef = useRef(false);

  const player = useVideoPlayer(null, (p) => {
    try {
      p.staysActiveInBackground = true;
      p.audioMixingMode = "auto";
      p.timeUpdateEventInterval = 1;
    } catch (e: any) {
      console.warn("[music] player setup error", e?.message);
    }
  });

  // Pause + clear audio whenever we leave the music section.
  useEffect(() => {
    if (!inMusicSection) {
      try { player.pause(); } catch {}
      wantPlayRef.current = false;
    }
  }, [inMusicSection, player]);

  // Fetch stream URL whenever videoId changes.
  useEffect(() => {
    if (!videoId) {
      setStreamUrl(null);
      activeVidRef.current = null;
      try { player.replace(null); } catch {}
      return;
    }
    activeVidRef.current = videoId;
    wantPlayRef.current = true;
    const myVid = videoId;
    (async () => {
      console.log("[music] resolving stream for", myVid);
      const url = await fetchStreamUrl(myVid);
      if (activeVidRef.current !== myVid) return; // stale
      if (!url) {
        console.warn("[music] no stream url for", myVid);
        _onPlayerEvent({ type: "error", videoId: myVid });
        return;
      }
      console.log("[music] got stream url for", myVid);
      setStreamUrl(url);
    })();
  }, [videoId, player, _onPlayerEvent]);

  // Load the resolved stream into the player.
  useEffect(() => {
    if (!streamUrl) return;
    try {
      player.replace(streamUrl);
      if (wantPlayRef.current && inMusicSection) {
        player.play();
      }
    } catch (e: any) {
      console.warn("[music] replace/play failed", e?.message);
      _onPlayerEvent({ type: "error", videoId: activeVidRef.current ?? undefined });
    }
  }, [streamUrl, player, inMusicSection, _onPlayerEvent]);

  // Register imperative controller for context.
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
      seek: (s) => { try { player.currentTime = Math.max(0, s); } catch {} },
    });
    return () => _registerController(null);
  }, [player, _registerController]);

  // Forward player events to context.
  useEffect(() => {
    const subStatus = player.addListener("statusChange", ({ status, error }) => {
      if (status === "error" || error) {
        console.warn("[music] player status=error", error);
        _onPlayerEvent({ type: "error", videoId: activeVidRef.current ?? undefined });
      } else if (status === "readyToPlay" && wantPlayRef.current && inMusicSection) {
        try { player.play(); } catch {}
      }
    });
    const subEnd = player.addListener("playToEnd", () => {
      _onPlayerEvent({ type: "ended" });
    });
    const subPlaying = player.addListener("playingChange", ({ isPlaying }) => {
      _onPlayerEvent({
        type: "state",
        state: isPlaying ? "playing" : "paused",
        position: player.currentTime ?? 0,
        duration: player.duration ?? 0,
      });
    });
    const subTime = player.addListener("timeUpdate", ({ currentTime }) => {
      _onPlayerEvent({
        type: "state",
        state: player.playing ? "playing" : "paused",
        position: currentTime ?? 0,
        duration: player.duration ?? 0,
      });
    });
    return () => {
      subStatus.remove();
      subEnd.remove();
      subPlaying.remove();
      subTime.remove();
    };
  }, [player, _onPlayerEvent, inMusicSection]);

  const openNowPlaying = () => {
    setExpanded(true);
    try {
      if (navigationRef.isReady()) navigationRef.navigate("NowPlaying" as never);
    } catch {}
  };

  // The hidden VideoView must stay mounted always so expo-video keeps a
  // stable render target. The mini bar is only visible on music routes
  // when a track is loaded.
  const showBar = !!current && inMusicSection;

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
            {current.artist}{playState === "loading" ? " · loading…" : playState === "error" ? " · unavailable" : ""}
          </ThemedText>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${duration > 0 ? Math.min(100, (position / duration) * 100) : 0}%` }]} />
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

      {/* Hidden VideoView (1×1) keeps the native audio engine alive. */}
      <VideoView
        player={player}
        style={styles.hiddenVideo}
        nativeControls={false}
        contentFit="contain"
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
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
  progressTrack: { height: 2, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 1, marginTop: 4 },
  progressFill: { height: 2, backgroundColor: Colors.dark.accent, borderRadius: 1 },
  ctrlBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.sm },
  ctrlHover: { backgroundColor: "rgba(255,102,0,0.15)" },
  ctrlPressed: { opacity: 0.65 },
  ctrlBtnLg: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.full, backgroundColor: Colors.dark.accent },
  ctrlLgHover: { backgroundColor: "#FF7A1F" },
  ctrlLgPressed: { opacity: 0.8 },
  hiddenVideo: { position: "absolute", width: 1, height: 1, opacity: 0, left: -10, top: -10 },
});
