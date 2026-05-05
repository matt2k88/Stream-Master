import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  StatusBar,
  Platform,
  PanResponder,
  ScrollView,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import type { SubtitleTrack, AudioTrack } from "expo-video";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { LinearGradient } from "expo-linear-gradient";
import { saveRecentlyWatched } from "@/components/RecentlyWatchedCard";
import { useProfile } from "@/contexts/ProfileContext";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type PlayerRouteProp = RouteProp<RootStackParamList, "Player">;

const IS_TV = Platform.isTV;
const HIDE_DELAY = 5000;

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Seek bar ────────────────────────────────────────────────────────────────
function SeekBar({
  currentTime,
  duration,
  onSeek,
  onFocus,
}: {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  onFocus?: () => void;
}) {
  const [barWidth, setBarWidth] = useState(1);
  const [localFrac, setLocalFrac] = useState<number | null>(null);
  const barWidthRef = useRef(1);
  const durationRef = useRef(duration);
  useEffect(() => { durationRef.current = duration; }, [duration]);

  const frac = localFrac !== null
    ? localFrac
    : duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  const thumbLeft = frac * (barWidth - 12);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        onFocus?.();
        const x = Math.max(0, Math.min(barWidthRef.current, e.nativeEvent.locationX));
        setLocalFrac(x / Math.max(1, barWidthRef.current));
      },
      onPanResponderMove: (e) => {
        const x = Math.max(0, Math.min(barWidthRef.current, e.nativeEvent.locationX));
        setLocalFrac(x / Math.max(1, barWidthRef.current));
      },
      onPanResponderRelease: (e) => {
        const x = Math.max(0, Math.min(barWidthRef.current, e.nativeEvent.locationX));
        onSeek((x / Math.max(1, barWidthRef.current)) * durationRef.current);
        setLocalFrac(null);
      },
      onPanResponderTerminate: () => setLocalFrac(null),
    })
  ).current;

  return (
    <View
      style={styles.seekBarHitArea}
      {...pan.panHandlers}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        barWidthRef.current = w;
        setBarWidth(w);
      }}
    >
      <View style={styles.seekBarTrack}>
        <View style={[styles.seekBarFill, { width: frac * barWidth }]} />
      </View>
      <View style={[styles.seekBarThumb, { left: thumbLeft }]} pointerEvents="none" />
    </View>
  );
}

// ─── Control button ───────────────────────────────────────────────────────────
function CtrlBtn({
  icon,
  label,
  onPress,
  onFocus,
  active = false,
  primary = false,
  preferFocus = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  label?: string;
  onPress: () => void;
  onFocus?: () => void;
  active?: boolean;
  primary?: boolean;
  preferFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed || active;

  if (primary) {
    return (
      <Pressable
        style={[styles.playBtn, isActive && styles.playBtnActive]}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onFocus={() => { setFocused(true); onFocus?.(); }}
        onBlur={() => setFocused(false)}
        hasTVPreferredFocus={preferFocus}
      >
        <LinearGradient
          colors={isActive ? ["rgba(255,140,26,0.55)", "rgba(255,85,0,0.55)"] : ["rgba(255,140,26,0.25)", "rgba(255,85,0,0.25)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <Feather name={icon} size={36} color="#fff" />
      </Pressable>
    );
  }

  return (
    <Pressable
      style={[styles.ctrlBtn, isActive && styles.ctrlBtnActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => { setFocused(true); onFocus?.(); }}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={preferFocus}
    >
      <Feather name={icon} size={label ? 14 : 20} color={isActive ? Colors.dark.accent : "#fff"} />
      {label ? (
        <ThemedText style={[styles.ctrlLabel, isActive && styles.ctrlLabelActive]}>
          {label}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

// ─── Track panel (CC / Audio) ─────────────────────────────────────────────────
function TrackPanel({
  title,
  icon,
  tracks,
  selected,
  onSelect,
  onClose,
  showOff,
  onFocus,
}: {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  tracks: (SubtitleTrack | AudioTrack)[];
  selected: SubtitleTrack | AudioTrack | null;
  onSelect: (track: SubtitleTrack | AudioTrack | null) => void;
  onClose: () => void;
  showOff?: boolean;
  onFocus?: () => void;
}) {
  return (
    <View style={styles.panel}>
      <LinearGradient
        colors={["rgba(8,8,8,0.97)", "rgba(8,8,8,0.92)"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      <View style={styles.panelHeader}>
        <Feather name={icon} size={14} color={Colors.dark.accent} />
        <ThemedText style={styles.panelTitle}>{title}</ThemedText>
        <Pressable
          style={({ pressed, focused }) => [styles.panelClose, (pressed || focused) && styles.panelCloseActive]}
          onPress={onClose}
          onFocus={onFocus}
        >
          <Feather name="x" size={14} color="#fff" />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.panelTracks}
        keyboardShouldPersistTaps="always"
      >
        {showOff && (
          <Pressable
            style={({ pressed, focused }) => [
              styles.trackChip,
              !selected && styles.trackChipActive,
              (pressed || focused) && styles.trackChipFocused,
            ]}
            onPress={() => onSelect(null)}
            onFocus={onFocus}
          >
            <ThemedText style={[styles.trackChipText, !selected && styles.trackChipTextActive]}>Off</ThemedText>
          </Pressable>
        )}

        {tracks.length === 0 && (
          <View style={styles.trackChip}>
            <ThemedText style={styles.trackChipText}>No tracks available</ThemedText>
          </View>
        )}

        {tracks.map((track) => {
          const isSelected = selected?.id === track.id;
          const display = track.label || track.language || track.id || "Unknown";
          return (
            <Pressable
              key={track.id}
              style={({ pressed, focused }) => [
                styles.trackChip,
                isSelected && styles.trackChipActive,
                (pressed || focused) && styles.trackChipFocused,
              ]}
              onPress={() => onSelect(track)}
              onFocus={onFocus}
            >
              <ThemedText style={[styles.trackChipText, isSelected && styles.trackChipTextActive]}>
                {display}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function PlayerScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<PlayerRouteProp>();
  const { streamUrl, title, type, thumbnail, streamId } = route.params;
  const isLive = type === "live";
  const { activeProfile } = useProfile();
  const savedRef = useRef(false);

  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<SubtitleTrack | null>(null);
  const [activeAudio, setActiveAudio] = useState<AudioTrack | null>(null);
  const [activePanel, setActivePanel] = useState<"cc" | "audio" | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isSeekingRef = useRef(false);

  const player = useVideoPlayer(streamUrl, (p) => {
    p.loop = false;
    if (!isLive) p.timeUpdateEventInterval = 1;
    p.play();
  });

  // ── Controls visibility ───────────────────────────────────────────────────
  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!IS_TV) {
      timerRef.current = setTimeout(() => {
        setShowControls(false);
        // Don't auto-close the panel — let user dismiss it manually
      }, HIDE_DELAY);
    }
  }, []);

  const showAndReset = useCallback(() => {
    setShowControls(true);
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [resetTimer]);

  // ── Player event listeners ────────────────────────────────────────────────
  useEffect(() => {
    const sub = player.addListener("statusChange", (e) => {
      if (e.status === "readyToPlay") {
        setIsLoading(false);
        setError("");
        if (activeProfile && !savedRef.current) {
          savedRef.current = true;
          const contentType = type === "live" ? "live" : type === "series" ? "series" : "movie";
          saveRecentlyWatched({
            profileId: activeProfile.id,
            contentType,
            streamId: streamId,
            name: title,
            thumbnailUrl: thumbnail,
            streamUrl: streamUrl,
          });
        }
      } else if (e.status === "error") { setIsLoading(false); setError(e.error?.message ?? "Playback failed"); }
      else if (e.status === "loading") setIsLoading(true);
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    const sub = player.addListener("playingChange", (e) => setIsPlaying(e.isPlaying));
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    if (isLive) return;
    const sub = player.addListener("timeUpdate", (e) => {
      if (!isSeekingRef.current) {
        setCurrentTime(e.currentTime);
        const dur = player.duration;
        if (isFinite(dur) && dur > 0) setDuration(dur);
      }
    });
    return () => sub.remove();
  }, [isLive, player]);

  useEffect(() => {
    if (isLive) return;
    const sub1 = player.addListener("availableSubtitleTracksChange", (e) => {
      setSubtitleTracks(e.availableSubtitleTracks);
    });
    const sub2 = player.addListener("availableAudioTracksChange", (e) => {
      setAudioTracks(e.availableAudioTracks);
    });
    return () => { sub1.remove(); sub2.remove(); };
  }, [isLive, player]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    if (activePanel) {
      setActivePanel(null);
      return;
    }
    player.pause();
    navigation.goBack();
  }, [activePanel, player, navigation]);

  const handlePlayPause = useCallback(() => {
    isPlaying ? player.pause() : player.play();
    showAndReset();
  }, [isPlaying, player, showAndReset]);

  const handleSkipBack = useCallback(() => {
    player.seekBy(-10);
    showAndReset();
  }, [player, showAndReset]);

  const handleSkipForward = useCallback(() => {
    player.seekBy(10);
    showAndReset();
  }, [player, showAndReset]);

  const handleSeek = useCallback((time: number) => {
    player.currentTime = time;
    setCurrentTime(time);
    isSeekingRef.current = false;
    showAndReset();
  }, [player, showAndReset]);

  const handleScreenTap = useCallback(() => {
    if (activePanel) { setActivePanel(null); showAndReset(); return; }
    if (showControls) {
      setShowControls(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      showAndReset();
    }
  }, [activePanel, showControls, showAndReset]);

  const handleSubtitleSelect = useCallback((track: SubtitleTrack | AudioTrack | null) => {
    const t = track as SubtitleTrack | null;
    setActiveSubtitle(t);
    player.subtitleTrack = t;
    setActivePanel(null);
    showAndReset();
  }, [player, showAndReset]);

  const handleAudioSelect = useCallback((track: SubtitleTrack | AudioTrack | null) => {
    const t = track as AudioTrack | null;
    setActiveAudio(t);
    if (t) player.audioTrack = t;
    setActivePanel(null);
    showAndReset();
  }, [player, showAndReset]);

  const togglePanel = useCallback((panel: "cc" | "audio") => {
    setActivePanel((p) => p === panel ? null : panel);
    showAndReset();
  }, [showAndReset]);

  // ── Error screen ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.errorContainer}>
          <View style={styles.errorIconRing}>
            <Feather name="alert-circle" size={40} color={Colors.dark.error} />
          </View>
          <ThemedText style={styles.errorTitle}>Playback Error</ThemedText>
          <ThemedText style={styles.errorMsg}>{error}</ThemedText>
          <Pressable
            style={({ pressed, focused }) => [styles.errorBackBtn, (pressed || focused) && { opacity: 0.8 }]}
            onPress={handleBack}
            hasTVPreferredFocus
          >
            <LinearGradient colors={["#FF8C1A", "#FF5500"]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
            <Feather name="arrow-left" size={16} color="#fff" />
            <ThemedText style={styles.errorBackBtnText}>Go Back</ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }

  // Controls visible on TV always; on touch only when showControls
  const ctrlVisible = showControls || IS_TV;

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Video */}
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        contentFit="contain"
        nativeControls={false}
      />

      {/* Loading */}
      {isLoading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={styles.loadingText}>Loading stream...</ThemedText>
        </View>
      ) : null}

      {/* Background tap target (touch only — behind controls) */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleScreenTap} />

      {/* ── Controls overlay — ALWAYS mounted so TV remote can focus buttons ── */}
      <View
        style={[styles.overlay, !ctrlVisible && styles.overlayHidden]}
        pointerEvents={ctrlVisible ? "box-none" : "none"}
      >
        {/* Gradients */}
        <LinearGradient
          colors={["rgba(0,0,0,0.85)", "transparent"]}
          style={styles.topGradient}
          pointerEvents="none"
        />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.92)"]}
          style={styles.bottomGradient}
          pointerEvents="none"
        />

        {/* Top bar */}
        <View style={styles.topBar}>
          <CtrlBtn icon="arrow-left" onPress={handleBack} onFocus={showAndReset} />
          <ThemedText style={styles.titleText} numberOfLines={1}>{title}</ThemedText>
          {isLive ? (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <ThemedText style={styles.liveText}>LIVE</ThemedText>
            </View>
          ) : <View style={{ width: 48 }} />}
        </View>

        {/* Centre controls */}
        <View style={styles.centerRow}>
          {!isLive ? (
            <CtrlBtn icon="rotate-ccw" label="-10" onPress={handleSkipBack} onFocus={showAndReset} />
          ) : null}

          <CtrlBtn
            icon={isPlaying ? "pause" : "play"}
            onPress={handlePlayPause}
            onFocus={showAndReset}
            primary
            preferFocus
          />

          {!isLive ? (
            <CtrlBtn icon="rotate-cw" label="+10" onPress={handleSkipForward} onFocus={showAndReset} />
          ) : null}
        </View>

        {/* Bottom section: panels + progress row (VOD only) */}
        {!isLive ? (
          <View style={styles.bottomSection}>
            {/* CC panel */}
            {activePanel === "cc" ? (
              <TrackPanel
                title="Subtitles"
                icon="message-square"
                tracks={subtitleTracks}
                selected={activeSubtitle}
                onSelect={handleSubtitleSelect}
                onClose={() => setActivePanel(null)}
                showOff
                onFocus={showAndReset}
              />
            ) : null}

            {/* Audio panel */}
            {activePanel === "audio" ? (
              <TrackPanel
                title="Audio Track"
                icon="music"
                tracks={audioTracks}
                selected={activeAudio}
                onSelect={handleAudioSelect}
                onClose={() => setActivePanel(null)}
                onFocus={showAndReset}
              />
            ) : null}

            {/* Progress bar row */}
            <View style={styles.progressRow}>
              <ThemedText style={styles.timeText}>{formatTime(currentTime)}</ThemedText>

              <SeekBar
                currentTime={currentTime}
                duration={duration}
                onSeek={handleSeek}
                onFocus={showAndReset}
              />

              <ThemedText style={styles.timeText}>{formatTime(duration)}</ThemedText>

              <CtrlBtn
                icon="message-square"
                label="CC"
                onPress={() => togglePanel("cc")}
                onFocus={showAndReset}
                active={activePanel === "cc" || !!activeSubtitle}
              />
              <CtrlBtn
                icon="music"
                label="Audio"
                onPress={() => togglePanel("audio")}
                onFocus={showAndReset}
                active={activePanel === "audio"}
              />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.75)",
    gap: Spacing.md,
  },
  loadingText: { color: Colors.dark.textSecondary, fontSize: 14 },

  // Controls overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "column",
    justifyContent: "space-between",
  },
  overlayHidden: { opacity: 0 },

  topGradient: { position: "absolute", top: 0, left: 0, right: 0, height: 130 },
  bottomGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: 160 },

  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Spacing["2xl"],
    paddingHorizontal: Spacing["2xl"],
    gap: Spacing.md,
  },
  titleText: { flex: 1, color: "#fff", fontSize: 15, fontWeight: "600", textAlign: "center" },

  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(220,30,30,0.25)",
    borderWidth: 1,
    borderColor: "rgba(220,30,30,0.6)",
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#DC1E1E" },
  liveText: { color: "#FF5555", fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },

  // Centre controls
  centerRow: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing["3xl"],
  },

  // Skip / control buttons
  ctrlBtn: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  ctrlBtnActive: {
    backgroundColor: "rgba(255,102,0,0.2)",
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 6,
  },
  ctrlLabel: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "600" },
  ctrlLabelActive: { color: Colors.dark.accent },

  // Play / pause button (large)
  playBtn: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 2,
    borderColor: "rgba(255,102,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 10,
  },
  playBtnActive: {
    borderColor: Colors.dark.accent,
    shadowOpacity: 1,
    shadowRadius: 22,
    elevation: 14,
  },

  // Bottom section
  bottomSection: {
    paddingHorizontal: Spacing["2xl"],
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },

  // Progress row
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  timeText: { color: "rgba(255,255,255,0.8)", fontSize: 12, minWidth: 40 },

  // Seek bar
  seekBarHitArea: {
    flex: 1,
    height: 28,
    justifyContent: "center",
    overflow: "visible",
  },
  seekBarTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.22)",
    overflow: "hidden",
  },
  seekBarFill: {
    height: 3,
    backgroundColor: Colors.dark.accent,
    borderRadius: 2,
  },
  seekBarThumb: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.dark.accent,
    top: 8,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 5,
    elevation: 5,
  },

  // Track panels
  panel: {
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.25)",
    overflow: "hidden",
    paddingVertical: Spacing.sm,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  panelTitle: { flex: 1, color: Colors.dark.accent, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  panelClose: {
    width: 26,
    height: 26,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  panelCloseActive: { backgroundColor: "rgba(255,102,0,0.25)", borderWidth: 1, borderColor: Colors.dark.accent },

  panelTracks: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  trackChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  trackChipActive: {
    backgroundColor: Colors.dark.accentDim,
    borderColor: Colors.dark.accent,
  },
  trackChipFocused: {
    backgroundColor: "rgba(255,102,0,0.2)",
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  trackChipText: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "500" },
  trackChipTextActive: { color: Colors.dark.accent, fontWeight: "700" },

  // Error state
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing["3xl"],
    gap: Spacing.lg,
  },
  errorIconRing: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderColor: "rgba(255,59,59,0.4)",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,59,59,0.08)",
  },
  errorTitle: { fontSize: 20, fontWeight: "700", color: Colors.dark.text },
  errorMsg: { color: Colors.dark.textSecondary, textAlign: "center", fontSize: 13, lineHeight: 18 },
  errorBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    overflow: "hidden",
    marginTop: Spacing.sm,
  },
  errorBackBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
