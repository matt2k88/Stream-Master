import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  BackHandler,
  Platform,
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { saveRecentlyWatched } from "@/components/RecentlyWatchedCard";
import { useProfile } from "@/contexts/ProfileContext";
import { useWatchHistory } from "@/contexts/WatchHistoryContext";
// VLC is native-only and depends on a native module that must be linked into
// the APK at build time. Wrap the require in try/catch so a missing native
// module (e.g. APK built without the plugin running) shows a friendly error
// instead of crashing the entire app on launch.
let VLCPlayer: any = null;
let VLC_LOAD_ERROR: string | null = null;
if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    VLCPlayer = require("react-native-vlc-media-player").VLCPlayer;
  } catch (e: any) {
    VLC_LOAD_ERROR = e?.message || String(e);
  }
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const HIDE_DELAY = 4500;

interface Track { id: number; name: string }

interface VlcPlayerScreenProps {
  streamUrl: string;
  title: string;
  type: "live" | "vod" | "series";
  thumbnail?: string;
  streamId?: string;
  seriesId?: string;
  seriesName?: string;
  seasonNum?: number;
  episodeNum?: number;
  resumeTime?: number;
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function HoverIcon({
  icon,
  onPress,
  size = 20,
  autoFocus,
  style,
  active,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  size?: number;
  autoFocus?: boolean;
  style?: any;
  active?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed || active;
  return (
    <Pressable
      style={[styles.iconBtn, isActive && styles.iconBtnActive, style]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hasTVPreferredFocus={autoFocus}
    >
      <Feather name={icon} size={size} color={isActive ? "#000" : Colors.dark.text} />
    </Pressable>
  );
}

export default function VlcPlayerScreen(props: VlcPlayerScreenProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { activeProfile } = useProfile();
  const { upsertLocal } = useWatchHistory();

  const isLive = props.type === "live";
  const playerRef = useRef<any>(null);

  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [position, setPosition] = useState(0);
  const [seekTarget, setSeekTarget] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [audioTracks, setAudioTracks] = useState<Track[]>([]);
  const [textTracks, setTextTracks] = useState<Track[]>([]);
  const [selectedAudio, setSelectedAudio] = useState<number | undefined>(undefined);
  const [selectedText, setSelectedText] = useState<number>(-1);
  const [panel, setPanel] = useState<"audio" | "subs" | null>(null);

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedRef = useRef(false);
  const lastSaveRef = useRef(0);
  const completionPostedRef = useRef(false);
  const resumeAppliedRef = useRef(false);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);

  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { durationRef.current = duration; }, [duration]);

  const showAndReset = useCallback(() => {
    setShowOverlay(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowOverlay(false), HIDE_DELAY);
  }, []);

  useEffect(() => {
    showAndReset();
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [showAndReset]);

  // ── Hardware back ─────────────────────────────────────────────────────────
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (panel) { setPanel(null); showAndReset(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [panel, showAndReset]);

  const handleBack = useCallback(() => {
    if (panel) { setPanel(null); showAndReset(); return; }
    navigation.goBack();
  }, [navigation, panel, showAndReset]);

  // ── VLC events ────────────────────────────────────────────────────────────
  const onLoad = useCallback((e: any) => {
    setLoading(false);
    setError(null);
    if (e?.duration && isFinite(e.duration) && e.duration > 0) setDuration(e.duration);
    if (Array.isArray(e?.audioTracks)) setAudioTracks(e.audioTracks);
    if (Array.isArray(e?.textTracks)) setTextTracks(e.textTracks);
    // Apply resume (once) by setting seek as a fraction.
    if (!resumeAppliedRef.current && !isLive && props.resumeTime && props.resumeTime > 5 && e?.duration > 0) {
      resumeAppliedRef.current = true;
      setSeekTarget(props.resumeTime / e.duration);
      // Reset seek prop next frame so subsequent seeks work.
      setTimeout(() => setSeekTarget(undefined), 200);
    }
  }, [isLive, props.resumeTime]);

  const onPlaying = useCallback((e: any) => {
    setLoading(false);
    setError(null);
    if (e?.duration && isFinite(e.duration) && e.duration > 0 && !durationRef.current) {
      setDuration(e.duration);
    }
    // Save recently_watched once per session.
    if (activeProfile && !savedRef.current && props.streamId) {
      savedRef.current = true;
      const contentType = isLive ? "live" : props.type === "series" ? "series" : "movie";
      saveRecentlyWatched({
        profileId: activeProfile.id,
        contentType,
        streamId: props.streamId,
        name: props.title,
        thumbnailUrl: props.thumbnail,
        streamUrl: props.streamUrl,
        seriesId: props.seriesId,
        seasonNum: props.seasonNum,
        episodeNum: props.episodeNum,
      }).then((entry) => { if (entry) upsertLocal(entry); });
    }
  }, [activeProfile, isLive, upsertLocal, props.streamId, props.title, props.thumbnail, props.streamUrl, props.type, props.seriesId, props.seasonNum, props.episodeNum]);

  const onProgress = useCallback((e: any) => {
    if (typeof e?.currentTime === "number") {
      // VLC reports currentTime in milliseconds.
      const t = e.currentTime > 1e6 ? e.currentTime / 1000 : e.currentTime;
      setCurrentTime(t);
    }
    if (typeof e?.duration === "number" && isFinite(e.duration) && e.duration > 0) {
      const d = e.duration > 1e6 ? e.duration / 1000 : e.duration;
      if (Math.abs(d - durationRef.current) > 1) setDuration(d);
    }
    if (typeof e?.position === "number") setPosition(e.position);

    // ── Continue-watching save (throttled) ──
    if (isLive || !activeProfile || !props.streamId) return;
    const dur = durationRef.current;
    const cur = currentTimeRef.current;
    if (dur <= 0 || cur <= 0) return;
    const contentType = props.type === "series" ? "series" : "movie";
    const remaining = dur - cur;
    if (remaining <= 30 && !completionPostedRef.current) {
      completionPostedRef.current = true;
      saveRecentlyWatched({
        profileId: activeProfile.id, contentType,
        streamId: props.streamId, name: props.title,
        thumbnailUrl: props.thumbnail, streamUrl: props.streamUrl,
        currentTime: cur, duration: dur, isCompleted: true,
        seriesId: props.seriesId, seasonNum: props.seasonNum, episodeNum: props.episodeNum,
      }).then((entry) => { if (entry) upsertLocal(entry); });
      return;
    }
    const now = Date.now();
    if (!completionPostedRef.current && now - lastSaveRef.current >= 10000 && cur > 5) {
      lastSaveRef.current = now;
      saveRecentlyWatched({
        profileId: activeProfile.id, contentType,
        streamId: props.streamId, name: props.title,
        thumbnailUrl: props.thumbnail, streamUrl: props.streamUrl,
        currentTime: cur, duration: dur, isCompleted: false,
        seriesId: props.seriesId, seasonNum: props.seasonNum, episodeNum: props.episodeNum,
      }).then((entry) => { if (entry) upsertLocal(entry); });
    }
  }, [activeProfile, isLive, upsertLocal, props.streamId, props.title, props.thumbnail, props.streamUrl, props.type, props.seriesId, props.seasonNum, props.episodeNum]);

  const onError = useCallback(() => {
    setLoading(false);
    setError("Playback failed. The stream may be offline or in an unsupported format.");
  }, []);

  const onBuffering = useCallback(() => {
    setLoading(true);
  }, []);

  // ── Controls ──────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    setPaused((p) => !p);
    showAndReset();
  }, [showAndReset]);

  const seekTo = useCallback((time: number) => {
    if (durationRef.current <= 0) return;
    const t = Math.max(0, Math.min(durationRef.current, time));
    const frac = t / durationRef.current;
    setSeekTarget(frac);
    setCurrentTime(t);
    currentTimeRef.current = t;
    setTimeout(() => setSeekTarget(undefined), 200);
    showAndReset();
  }, [showAndReset]);

  const skip = useCallback((delta: number) => {
    seekTo(currentTimeRef.current + delta);
  }, [seekTo]);

  const toggleMute = useCallback(() => {
    setMuted((m) => !m);
    showAndReset();
  }, [showAndReset]);

  const onScreenPress = useCallback(() => {
    if (panel) { setPanel(null); showAndReset(); return; }
    if (showOverlay) {
      setShowOverlay(false);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      showAndReset();
    }
  }, [panel, showOverlay, showAndReset]);

  // ── Track selection panel ─────────────────────────────────────────────────
  const renderPanel = () => {
    if (!panel) return null;
    const tracks = panel === "audio" ? audioTracks : textTracks;
    const selectedId = panel === "audio" ? selectedAudio : selectedText;
    return (
      <View style={styles.panel}>
        <ThemedText style={styles.panelTitle}>
          {panel === "audio" ? "Audio Track" : "Subtitles"}
        </ThemedText>
        <ScrollView style={{ maxHeight: 240 }}>
          {panel === "subs" ? (
            <Pressable
              style={[styles.panelRow, selectedText === -1 && styles.panelRowActive]}
              onPress={() => { setSelectedText(-1); setPanel(null); showAndReset(); }}
            >
              <ThemedText style={styles.panelRowText}>Off</ThemedText>
            </Pressable>
          ) : null}
          {tracks.length === 0 ? (
            <ThemedText style={styles.panelEmpty}>None available</ThemedText>
          ) : tracks.map((t) => (
            <Pressable
              key={`${panel}-${t.id}`}
              style={[styles.panelRow, selectedId === t.id && styles.panelRowActive]}
              onPress={() => {
                if (panel === "audio") setSelectedAudio(t.id);
                else setSelectedText(t.id);
                setPanel(null); showAndReset();
              }}
            >
              <ThemedText style={styles.panelRowText} numberOfLines={1}>{t.name || `Track ${t.id}`}</ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  };

  // ── Source — memoised so VLC doesn't reload on every render ───────────────
  const source = useMemo(() => ({
    uri: props.streamUrl,
    initType: 2 as const,
    // Generous network-cache for IPTV; --no-stats keeps logging quiet.
    initOptions: ["--network-caching=1500", "--no-stats", "--codec=avcodec"],
  }), [props.streamUrl]);

  if (Platform.OS === "web" || !VLCPlayer) {
    return (
      <View style={[styles.container, styles.errorOverlay, { paddingTop: insets.top + 16 }]}>
        <Feather name="alert-circle" size={36} color={Colors.dark.error} />
        <ThemedText style={styles.errorTitle}>VLC Player Unavailable</ThemedText>
        <ThemedText style={styles.errorSubtitle}>
          {Platform.OS === "web"
            ? "The VLC engine isn’t available on web. Switch back to the Default player from Account."
            : "The VLC native module isn’t included in this build. Switch back to the Default player in Account, or rebuild the app with the VLC plugin enabled."}
          {VLC_LOAD_ERROR ? `\n\n${VLC_LOAD_ERROR}` : ""}
        </ThemedText>
        <Pressable style={styles.errorBtn} onPress={() => navigation.goBack()}>
          <ThemedText style={styles.errorBtnText}>Back</ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onScreenPress}>
        <VLCPlayer
          ref={playerRef}
          style={StyleSheet.absoluteFill}
          source={source}
          paused={paused}
          muted={muted}
          autoplay
          resizeMode="contain"
          seek={seekTarget}
          audioTrack={selectedAudio}
          textTrack={selectedText >= 0 ? selectedText : undefined}
          onLoad={onLoad}
          onPlaying={onPlaying}
          onProgress={onProgress}
          onError={onError}
          onBuffering={onBuffering}
          onEnd={() => navigation.goBack()}
        />
      </Pressable>

      {/* Loading spinner */}
      {loading && !error ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={styles.loadingText}>Loading…</ThemedText>
        </View>
      ) : null}

      {/* Error overlay */}
      {error ? (
        <View style={styles.errorOverlay}>
          <Feather name="alert-circle" size={36} color={Colors.dark.error} />
          <ThemedText style={styles.errorTitle}>{error}</ThemedText>
          <Pressable style={styles.errorBtn} onPress={() => navigation.goBack()}>
            <ThemedText style={styles.errorBtnText}>Back</ThemedText>
          </Pressable>
        </View>
      ) : null}

      {/* Top bar */}
      {showOverlay ? (
        <View style={[styles.topBar, { paddingTop: insets.top + 8, paddingHorizontal: insets.left + 16 }]}>
          <HoverIcon icon="arrow-left" onPress={handleBack} autoFocus />
          {isLive ? (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <ThemedText style={styles.liveBadgeText}>LIVE</ThemedText>
            </View>
          ) : null}
          <ThemedText style={styles.title} numberOfLines={1}>{props.title}</ThemedText>
          <View style={styles.vlcChip}>
            <ThemedText style={styles.vlcChipText}>VLC</ThemedText>
          </View>
          <HoverIcon icon={muted ? "volume-x" : "volume-2"} onPress={toggleMute} />
          {audioTracks.length > 1 ? (
            <HoverIcon icon="headphones" onPress={() => { setPanel("audio"); showAndReset(); }} active={panel === "audio"} />
          ) : null}
          {textTracks.length > 0 ? (
            <HoverIcon icon="message-square" onPress={() => { setPanel("subs"); showAndReset(); }} active={panel === "subs"} />
          ) : null}
        </View>
      ) : null}

      {/* Bottom controls (skip + play/pause + seek bar for VOD) */}
      {showOverlay ? (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16, paddingHorizontal: insets.left + 16 }]}>
          {!isLive ? (
            <View style={styles.seekRow}>
              <ThemedText style={styles.timeText}>{fmt(currentTime)}</ThemedText>
              <View style={styles.seekTrack}>
                <View style={[styles.seekFill, { width: `${Math.round(position * 100)}%` }]} />
              </View>
              <ThemedText style={styles.timeText}>{fmt(duration)}</ThemedText>
            </View>
          ) : null}
          <View style={styles.btnRow}>
            {!isLive ? <HoverIcon icon="rotate-ccw" onPress={() => skip(-10)} size={22} /> : null}
            <HoverIcon icon={paused ? "play" : "pause"} onPress={togglePlay} size={28} style={styles.playBtn} />
            {!isLive ? <HoverIcon icon="rotate-cw" onPress={() => skip(10)} size={22} /> : null}
          </View>
        </View>
      ) : null}

      {/* Track panel */}
      {renderPanel()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center", alignItems: "center", gap: 10,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  loadingText: { color: "#fff", fontSize: 13 },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center", alignItems: "center", gap: 16,
    backgroundColor: "rgba(0,0,0,0.85)", paddingHorizontal: 32,
  },
  errorTitle: { color: "#fff", fontSize: 16, fontWeight: "600", textAlign: "center" },
  errorSubtitle: { color: Colors.dark.textSecondary, fontSize: 13, textAlign: "center" },
  errorBtn: {
    paddingHorizontal: 22, paddingVertical: 10, borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.accent,
  },
  errorBtnText: { color: "#000", fontWeight: "700" },
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    paddingBottom: 10, backgroundColor: "rgba(0,0,0,0.55)",
  },
  title: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "600" },
  liveBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.dark.error, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  liveBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  vlcChip: {
    backgroundColor: "rgba(255,102,0,0.18)", borderColor: Colors.dark.accent, borderWidth: 1,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  vlcChipText: { color: Colors.dark.accent, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: "center", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  iconBtnActive: { backgroundColor: Colors.dark.accent, transform: [{ scale: 1.1 }] },
  playBtn: { width: 56, height: 56, borderRadius: 28 },
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingTop: 12, gap: 12, backgroundColor: "rgba(0,0,0,0.55)",
  },
  seekRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  timeText: { color: "#fff", fontSize: 12, minWidth: 50 },
  seekTrack: {
    flex: 1, height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)", overflow: "hidden",
  },
  seekFill: { height: "100%", backgroundColor: Colors.dark.accent },
  btnRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 18 },
  panel: {
    position: "absolute", right: 24, top: 70,
    width: 240, padding: Spacing.md, borderRadius: BorderRadius.lg,
    backgroundColor: "rgba(20,20,20,0.95)", borderWidth: 1, borderColor: Colors.dark.border,
    gap: 8,
  },
  panelTitle: { color: "#fff", fontSize: 13, fontWeight: "700", marginBottom: 4 },
  panelRow: {
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: BorderRadius.sm,
  },
  panelRowActive: { backgroundColor: Colors.dark.accent },
  panelRowText: { color: "#fff", fontSize: 13 },
  panelEmpty: { color: Colors.dark.textSecondary, fontSize: 12, paddingHorizontal: 12, paddingVertical: 8 },
});
