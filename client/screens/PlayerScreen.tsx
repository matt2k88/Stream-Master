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
  BackHandler,
  Animated,
  Modal,
  TextInput,
  findNodeHandle,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "@/lib/video-player";
import type { SubtitleTrack, AudioTrack } from "@/lib/video-player";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { LinearGradient } from "expo-linear-gradient";
import { saveRecentlyWatched } from "@/components/RecentlyWatchedCard";
import { useProfile } from "@/contexts/ProfileContext";
import { useFavourites } from "@/contexts/FavouritesContext";
import { useWatchHistory } from "@/contexts/WatchHistoryContext";
import { xtreamApi, Episode } from "@/lib/xtream-api";

// Lazy-require VlcPlayerScreen ONLY on Android — react-native-vlc-media-player
// has no web shim and crashes at module-load time on web/iOS Expo Go.
const VlcPlayerScreen: React.ComponentType<{}> | null =
  Platform.OS === "android" ? require("@/screens/VlcPlayerScreen").default : null;

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
  onFocusChange,
  onCapturedChange,
}: {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  onFocus?: () => void;
  onFocusChange?: (focused: boolean) => void;
  onCapturedChange?: (captured: boolean) => void;
}) {
  const [barWidth, setBarWidth] = useState(1);
  const [localFrac, setLocalFrac] = useState<number | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  // When the bar is focused, arrows seek by default. Pressing OK toggles
  // "released" mode so D-pad left/right can navigate past the bar to CC/Audio.
  const [released, setReleased] = useState(false);
  const [selfTag, setSelfTag] = useState<number | null>(null);
  const pressableRef = useRef<View>(null);
  const barWidthRef = useRef(1);
  const durationRef = useRef(duration);
  const currentTimeRef = useRef(currentTime);
  // Hold-to-accelerate tracking for Android D-pad long-press
  const androidHoldRef = useRef<{ dir: string | null; start: number; lastFire: number }>({
    dir: null, start: 0, lastFire: 0,
  });
  const isCaptured = isFocused && !released;
  // Keep a stable ref to isCaptured so onKeyDown closure is always current
  const isCapturedRef = useRef(isCaptured);
  useEffect(() => { isCapturedRef.current = isCaptured; }, [isCaptured]);
  useEffect(() => {
    if (pressableRef.current) {
      const tag = findNodeHandle(pressableRef.current);
      if (tag) setSelfTag(tag);
    }
  }, []);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { onCapturedChange?.(isCaptured); }, [isCaptured, onCapturedChange]);
  // Re-arm capture whenever focus is regained
  useEffect(() => { if (isFocused) setReleased(false); }, [isFocused]);

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

  // On native we render a plain View so the TV remote / D-pad has NO target to
  // focus. Pressable with focusable={false} still gets picked up by Android
  // TV's focus engine when it has onPress/onFocus/onKeyDown — replacing it
  // with View removes the bar from focus traversal entirely. Touch dragging
  // still works via the inner View's pan handlers; web keyboard seeking
  // (ArrowLeft/Right) is handled at PlayerScreen level via window.keydown.
  return (
    <View
      ref={pressableRef as any}
      style={styles.seekBarWrapper}
      collapsable={false}
    >
      <Feather
        name="skip-forward"
        size={15}
        color="rgba(255,255,255,0.4)"
      />
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
        <View
          style={[styles.seekBarThumb, { left: thumbLeft }]}
          pointerEvents="none"
        />
      </View>
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
  const isInteracting = focused || pressed;
  const isHighlighted = isInteracting || active;

  if (primary) {
    return (
      <Pressable
        style={[styles.playBtn, isHighlighted && styles.playBtnActive]}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onFocus={() => { setFocused(true); onFocus?.(); }}
        onBlur={() => setFocused(false)}
        hasTVPreferredFocus={preferFocus}
      >
        <LinearGradient
          colors={isHighlighted ? ["rgba(255,140,26,0.55)", "rgba(255,85,0,0.55)"] : ["rgba(255,140,26,0.25)", "rgba(255,85,0,0.25)"]}
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
      style={[styles.ctrlBtn, isHighlighted && styles.ctrlBtnActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => { setFocused(true); onFocus?.(); }}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={preferFocus}
    >
      <Feather name={icon} size={label ? 14 : 20} color={active ? Colors.dark.accent : "#fff"} />
      {label ? (
        <ThemedText style={[styles.ctrlLabel, active && styles.ctrlLabelActive]}>
          {label}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

// ─── Track chip (individual selectable item inside TrackPanel) ────────────────
function TrackChip({
  label,
  isSelected,
  onPress,
  onFocus,
  hasTVPreferredFocus,
}: {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  onFocus?: () => void;
  hasTVPreferredFocus?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const isActive = pressed || focused;
  return (
    <Pressable
      style={[
        styles.trackChip,
        isSelected && styles.trackChipActive,
        isActive && styles.trackChipFocused,
      ]}
      onPress={onPress}
      onFocus={() => { setFocused(true); onFocus?.(); }}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <ThemedText style={[styles.trackChipText, isSelected && styles.trackChipTextActive]}>
        {label}
      </ThemedText>
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
          <TrackChip
            label="Off"
            isSelected={!selected}
            onPress={() => onSelect(null)}
            onFocus={onFocus}
            hasTVPreferredFocus={!selected}
          />
        )}

        {tracks.length === 0 && (
          <View style={styles.trackChip}>
            <ThemedText style={styles.trackChipText}>No tracks available</ThemedText>
          </View>
        )}

        {tracks.map((track, idx) => {
          const isSelected = selected?.id === track.id;
          const display = track.label || track.language || track.id || "Unknown";
          return (
            <TrackChip
              key={track.id}
              label={display}
              isSelected={isSelected}
              onPress={() => onSelect(track)}
              onFocus={onFocus}
              hasTVPreferredFocus={!showOff && idx === 0}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Router: pick dedicated VLC screen for Android VOD/series ────────────────
export default function PlayerScreen() {
  const route = useRoute<PlayerRouteProp>();
  const { activeProfile } = useProfile();
  const isLive = route.params.type === "live";
  // VLC's native code requires Android 8.0+ (API 26). On API 24/25
  // (Fire OS 6 / Fire TV 4K 1st-gen) the binding will crash on init,
  // so force the Expo engine regardless of the user's profile choice.
  // Mirrors the same guard in `client/lib/video-player.tsx`.
  const vlcUnsupported =
    Platform.OS === "android" && typeof Platform.Version === "number" && Platform.Version < 26;
  const profileEngine = (isLive ? activeProfile?.player_live : activeProfile?.player_vod) === "expo"
    ? "expo" : "vlc";
  // Per-route override (e.g. Catch Up forces "expo" because VLC cannot
  // seek into MPEG-TS /timeshift/ streams reliably — play/pause works
  // but skip & scrub silently no-op).
  const routeForce = route.params.forceEngine === "expo" || route.params.forceEngine === "vlc"
    ? route.params.forceEngine : null;
  const engine = vlcUnsupported ? "expo" : (routeForce ?? profileEngine);
  // Android + VLC + non-live → use the dedicated raw-VLC screen.
  // Live TV, web, iOS, and the expo engine all keep the legacy screen.
  if (Platform.OS === "android" && engine === "vlc" && !isLive && VlcPlayerScreen) {
    return <VlcPlayerScreen />;
  }
  return <LegacyPlayerScreen />;
}

// ─── Legacy expo-video / live-TV PlayerScreen ─────────────────────────────────
function LegacyPlayerScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<PlayerRouteProp>();
  const {
    streamUrl, title, type, thumbnail, streamId,
    seriesId: seriesIdParam, seriesName: seriesNameParam,
    resumeTime, seasonNum, episodeNum,
  } = route.params;
  const isLive = type === "live";
  const { activeProfile } = useProfile();
  const { upsertLocal, getByStreamId } = useWatchHistory();
  // Independent latches so audio and subtitle restoration don't race —
  // whichever `availableTracksChange` event fires first only marks its
  // own slot done; the other event still gets a chance to restore.
  const audioRestoredRef = useRef(false);
  const textRestoredRef = useRef(false);
  const { isFavourite, toggleFavourite } = useFavourites();
  const savedRef = useRef(false);

  const toastAnim = useRef(new Animated.Value(0)).current;
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const favStreamType = type === "live" ? "live" : type === "series" ? "series" : "movies";
  const favStreamId = type === "series" && seriesIdParam
    ? parseInt(seriesIdParam, 10)
    : streamId ? parseInt(streamId, 10) : 0;
  const favStreamName = type === "series" && seriesNameParam ? seriesNameParam : title;
  const isFavourited = favStreamId > 0 ? isFavourite(favStreamId, favStreamType) : false;

  // ── Report content ────────────────────────────────────────────────────────
  const showReportRef = useRef(false);
  const [showReport, setShowReport] = useState(false);
  const setShowReportWithRef = useCallback((v: boolean) => {
    showReportRef.current = v;
    setShowReport(v);
  }, []);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportOther, setReportOther] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportDone, setReportDone] = useState(false);

  const REPORT_REASONS = [
    "Constant buffering",
    "Does not load",
    "Wrong language",
    "Jittery / stuttering",
    "Wrong content",
    "Other",
  ] as const;

  const handleSubmitReport = useCallback(async () => {
    if (!reportReason || (!activeProfile)) return;
    if (reportReason === "Other" && !reportOther.trim()) return;
    setReportSubmitting(true);
    try {
      const { getApiUrl } = await import("@/lib/query-client");
      const url = new URL("/api/content-reports", getApiUrl());
      await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: activeProfile.id,
          stream_id: streamId ?? null,
          stream_name: title,
          stream_type: type,
          reason: reportReason === "Other" ? "Other" : reportReason,
          other_text: reportReason === "Other" ? reportOther.trim() : null,
        }),
      });
      setReportDone(true);
      setTimeout(() => {
        setShowReportWithRef(false);
        setReportDone(false);
        setReportReason(null);
        setReportOther("");
      }, 1800);
    } catch {
      // silent failure — report is best-effort
      setShowReportWithRef(false);
    } finally {
      setReportSubmitting(false);
    }
  }, [reportReason, reportOther, activeProfile, streamId, title, type]);

  const [showControls, setShowControls] = useState(true);
  const [ctrlsKey, setCtrlsKey] = useState(0);
  const prevShowControls = useRef(true);
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

  // ── Live stream auto-reconnect state ─────────────────────────────────────
  // For live channels we never want to dead-end on a "Playback Error" screen.
  // If the stream errors or freezes we silently reload it on a backoff loop.
  const [reconnecting, setReconnecting] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastLiveTimeRef = useRef<number>(-1);
  const lastLiveTimeAtRef = useRef<number>(Date.now());

  // Progress / completion / next-episode state
  const lastSavedRef = useRef(0);
  const completionPostedRef = useRef(false);
  const resumeAppliedRef = useRef(false);
  const [nextEp, setNextEp] = useState<{ episode: Episode; season: number } | null>(null);
  // Populated by the next-ep prefetch effect so save calls can persist
  // series_total_episodes + series_last_modified.
  const seriesSnapshotRef = useRef<{
    totalEpisodes?: number;
    lastModified?: string;
    finalSeason?: number;
    finalEpisode?: number;
  }>({});
  const [showNext, setShowNext] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const nextPromptShownRef = useRef(false);

  // navigation.replace into PlayerScreen reuses the same instance — reset all
  // per-episode refs/state when the underlying stream changes.
  useEffect(() => {
    savedRef.current = false;
    lastSavedRef.current = 0;
    completionPostedRef.current = false;
    resumeAppliedRef.current = false;
    nextPromptShownRef.current = false;
    setNextEp(null);
    setShowNext(false);
    setCountdown(10);
    setCurrentTime(0);
    setDuration(0);
  }, [streamId, streamUrl]);

  // ── Seek bar TV remote — refs declared early so they're stable ───────────
  const [seekBarFocused, setSeekBarFocused] = useState(false);
  const seekBarFocusedRef = useRef(false);
  const seekBarCapturedRef = useRef(false);
  const currentTimeRef = useRef(0);
  const tvDurationRef = useRef(0);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { tvDurationRef.current = duration; }, [duration]);
  const seekHoldRef = useRef<{ dir: string | null; start: number; lastFire: number }>({
    dir: null, start: 0, lastFire: 0,
  });
  // Large skip acceleration — tracks rapid consecutive presses in same direction
  const largeSkipAccelRef = useRef<{ dir: "back" | "fwd" | null; count: number; lastTime: number }>({
    dir: null, count: 0, lastTime: 0,
  });
  const [largeStepBack, setLargeStepBack] = useState(60);
  const [largeStepFwd, setLargeStepFwd] = useState(60);
  const largeSkipResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // CRITICAL: setup fn MUST be stable. An inline arrow function gives expo-video
  // a new reference every render, which causes useVideoPlayer to create a fresh
  // player (and a fresh HLS connection) on every render. For series this added
  // up to 3 simultaneous connections per episode because the next-episode
  // prefetch effect triggers extra re-renders. We pin it via useRef so only
  // ONE player is ever created per mount.
  const playerSetupRef = useRef((p: any) => {
    p.loop = false;
    if (!isLive) p.timeUpdateEventInterval = 1;
    p.play();
  });
  // Engine choice is captured at mount from the active profile's pref
  // (see PlayerSettingsScreen). Movies/series use `player_vod`; live TV
  // uses `player_live`. Default is "vlc" if the profile hasn't migrated
  // yet. The engine is locked for the lifetime of this PlayerScreen
  // mount — switching engines requires going back and replaying.
  const playerEngineRef = useRef<"vlc" | "expo">(
    (isLive ? activeProfile?.player_live : activeProfile?.player_vod) === "expo"
      ? "expo"
      : "vlc",
  );
  const player = useVideoPlayer(streamUrl, playerSetupRef.current, {
    engine: playerEngineRef.current,
  });

  // ── Controls visibility ───────────────────────────────────────────────────
  const activePanelRef = useRef<"cc" | "audio" | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      // Don't hide if a panel is open
      if (!activePanelRef.current) setShowControls(false);
    }, HIDE_DELAY);
  }, []);

  const showAndReset = useCallback(() => {
    setShowControls(true);
    resetTimer();
  }, [resetTimer]);

  // ── TV remote: left/right when seek bar is focused ────────────────────────
  // Use class-based TVEventHandler (universally available, no hook import needed)
  const playerRef = useRef(player);
  const showAndResetRef = useRef(showAndReset);
  const isLiveRef = useRef(isLive);
  // Forward-ref to armSeekGuard (defined later). Stays a no-op until the
  // effect below patches it once armSeekGuard exists.
  const armSeekGuardRef = useRef<() => void>(() => {});
  // Forward-refs to the player action handlers (defined later). The
  // TVEventHandler effect below uses empty deps so we route media-key
  // events through these refs instead of re-subscribing on every render.
  const handlePlayPauseRef = useRef<() => void>(() => {});
  const handleSkipBackLargeRef = useRef<() => void>(() => {});
  const handleSkipForwardLargeRef = useRef<() => void>(() => {});
  useEffect(() => { playerRef.current = player; }, [player]);
  useEffect(() => { showAndResetRef.current = showAndReset; }, [showAndReset]);
  useEffect(() => { isLiveRef.current = isLive; }, [isLive]);

  useEffect(() => {
    if (Platform.OS !== "android" && Platform.OS !== "ios") return;
    let tvHandler: any = null;
    try {
      const TVEventHandler = (require as any)("react-native").TVEventHandler;
      if (!TVEventHandler) return;
      tvHandler = new TVEventHandler();
      tvHandler.enable(null, (_: any, evt: { eventType: string }) => {
        // Media keys (play/pause, rewind, fast-forward) work GLOBALLY
        // — no need for the seek bar to be focused. This matches what
        // users expect from a remote: the dedicated media buttons act
        // on the player regardless of where focus currently sits.
        const et = evt.eventType;
        if (et === "playPause" || et === "play" || et === "pause") {
          handlePlayPauseRef.current();
          showAndResetRef.current();
          return;
        }
        if (!isLiveRef.current && et === "rewind") {
          // Hardware rewind key → fast-skip back (60s, accelerating to
          // 2m / 5m on rapid presses, same as the on-screen rewind btn).
          handleSkipBackLargeRef.current();
          return;
        }
        if (!isLiveRef.current && et === "fastForward") {
          handleSkipForwardLargeRef.current();
          return;
        }
        if (!seekBarFocusedRef.current || isLiveRef.current) return;
        if (et !== "left" && et !== "right") return;
        const now = Date.now();
        const isSameDir = et === seekHoldRef.current.dir;
        if (!isSameDir || now - seekHoldRef.current.lastFire > 400) {
          seekHoldRef.current.start = now;
          seekHoldRef.current.dir = et;
        }
        seekHoldRef.current.lastFire = now;
        const held = now - seekHoldRef.current.start;
        let step: number;
        if (held > 4000) step = 60;
        else if (held > 2000) step = 40;
        else if (held > 1000) step = 20;
        else if (held > 500) step = 10;
        else step = 5;
        const delta = et === "left" ? -step : step;
        const newTime = Math.max(0, Math.min(tvDurationRef.current, currentTimeRef.current + delta));
        armSeekGuardRef.current();
        playerRef.current.currentTime = newTime;
        setCurrentTime(newTime);
        currentTimeRef.current = newTime;
        showAndResetRef.current();
      });
    } catch {
      // TVEventHandler not available on this platform/build
    }
    return () => { try { tvHandler?.disable(); } catch {} };
  }, []); // empty deps — all values accessed via stable refs

  // ── Web/desktop: keyboard arrow keys always seek (player is fullscreen) ──
  // We intentionally do NOT check seekBarFocusedRef here — on web the inner
  // pan-responder View intercepts clicks so the outer Pressable's onFocus
  // never fires reliably. Instead we gate only on: not live, has duration,
  // no CC/Audio panel open, and the report modal is not open.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Block when a panel/modal is open (CC/Audio/Report) so the
      // user can still type / use arrows in those overlays.
      if (activePanelRef.current !== null) return;
      if (showReportRef.current) return;

      // Media keys + Space + K → play/pause (works on every focus).
      if (
        e.key === " " || e.key === "Spacebar" || e.key === "k" || e.key === "K" ||
        e.key === "MediaPlayPause" || e.key === "MediaPlay" || e.key === "MediaPause"
      ) {
        e.preventDefault();
        handlePlayPauseRef.current();
        return;
      }

      // Hardware media rewind / fast-forward → fast-skip buttons.
      if (!isLiveRef.current && (e.key === "MediaRewind" || e.key === "MediaTrackPrevious")) {
        e.preventDefault();
        handleSkipBackLargeRef.current();
        return;
      }
      if (!isLiveRef.current && (e.key === "MediaFastForward" || e.key === "MediaTrackNext")) {
        e.preventDefault();
        handleSkipForwardLargeRef.current();
        return;
      }

      // Arrow keys (and J / L) → small ±10s seek.
      const isLeft  = e.key === "ArrowLeft"  || e.key === "j" || e.key === "J";
      const isRight = e.key === "ArrowRight" || e.key === "l" || e.key === "L";
      if (!isLeft && !isRight) return;
      if (isLiveRef.current) return;
      if (tvDurationRef.current <= 0) return;
      e.preventDefault();
      const delta = isLeft ? -10 : 10;
      const newTime = Math.max(0, Math.min(tvDurationRef.current, currentTimeRef.current + delta));
      armSeekGuardRef.current();
      try { playerRef.current.currentTime = newTime; } catch {}
      setCurrentTime(newTime);
      currentTimeRef.current = newTime;
      showAndResetRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Bump key when controls go from hidden → visible so the play button remounts
  // and hasTVPreferredFocus re-fires, restoring D-pad focus
  useEffect(() => {
    if (showControls && !prevShowControls.current) {
      setCtrlsKey((k) => k + 1);
    }
    prevShowControls.current = showControls;
  }, [showControls]);

  const handleToggleFavourite = useCallback(async () => {
    if (!favStreamId) return;
    const wasAdded = !isFavourited;
    await toggleFavourite({
      streamId: favStreamId,
      streamType: favStreamType as "live" | "movies" | "series",
      streamName: favStreamName,
      streamIcon: thumbnail,
      categoryId: null,
    });
    setToastMsg(wasAdded ? "Added to Favourites" : "Removed from Favourites");
    setToastVisible(true);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
    showAndReset();
  }, [favStreamId, favStreamType, isFavourited, toggleFavourite, title, thumbnail, showAndReset, toastAnim]);

  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [resetTimer]);

  // Release player on unmount — kills the network stream connection.
  useEffect(() => {
    return () => {
      try { player.pause(); } catch {}
      try { player.release(); } catch {}
    };
  }, [player]);

  // EARLY release: react-navigation fires `beforeRemove` BEFORE the screen
  // starts its unmount/transition animation. By killing the player here we
  // close the upstream HLS/HTTP socket the instant the user hits back —
  // instead of waiting for the React unmount cleanup, which doesn't run
  // until after the slide-out animation completes (~300ms+ later, during
  // which the IPTV server still sees an active connection).
  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", () => {
      try { player.pause(); } catch {}
      try { player.release(); } catch {}
    });
    return unsub;
  }, [navigation, player]);

  // ── Live auto-reconnect helpers ──────────────────────────────────────────
  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
  }, []);
  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current) { clearInterval(stallTimerRef.current); stallTimerRef.current = null; }
  }, []);

  const reloadLiveStream = useCallback(() => {
    try {
      player.replace(streamUrl);
      player.play();
    } catch {}
  }, [player, streamUrl]);

  const loadWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearLoadWatchdog = useCallback(() => {
    if (loadWatchdogRef.current) { clearTimeout(loadWatchdogRef.current); loadWatchdogRef.current = null; }
  }, []);

  const scheduleLiveRetry = useCallback(() => {
    clearRetryTimer();
    clearLoadWatchdog();
    const attempt = retryCountRef.current + 1;
    retryCountRef.current = attempt;
    setRetryAttempt(attempt);
    setReconnecting(true);
    setIsLoading(true);
    const delays = [1000, 2000, 4000, 8000];
    const delay = delays[Math.min(attempt - 1, delays.length - 1)];
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      reloadLiveStream();
      // Watchdog: if expo-video keeps emitting "loading" without a hard
      // error and never reaches readyToPlay, schedule another retry after 12s
      // so reconnection always keeps progressing.
      clearLoadWatchdog();
      loadWatchdogRef.current = setTimeout(() => {
        loadWatchdogRef.current = null;
        scheduleLiveRetry();
      }, 12000);
    }, delay);
  }, [clearRetryTimer, clearLoadWatchdog, reloadLiveStream]);

  // Reset retry state whenever the stream URL changes (channel switch / replace).
  useEffect(() => {
    clearRetryTimer();
    clearStallTimer();
    clearLoadWatchdog();
    retryCountRef.current = 0;
    setRetryAttempt(0);
    setReconnecting(false);
    lastLiveTimeRef.current = -1;
    lastLiveTimeAtRef.current = Date.now();
  }, [streamId, streamUrl, clearRetryTimer, clearStallTimer, clearLoadWatchdog]);

  // Cleanup all timers on unmount.
  useEffect(() => {
    return () => { clearRetryTimer(); clearStallTimer(); clearLoadWatchdog(); };
  }, [clearRetryTimer, clearStallTimer, clearLoadWatchdog]);

  // ── Player event listeners ────────────────────────────────────────────────
  useEffect(() => {
    const sub = player.addListener("statusChange", (e) => {
      if (e.status === "readyToPlay") {
        setIsLoading(false);
        setError("");
        // Clear any in-flight reconnect — playback is healthy again.
        clearRetryTimer();
        clearLoadWatchdog();
        retryCountRef.current = 0;
        setRetryAttempt(0);
        setReconnecting(false);
        lastLiveTimeRef.current = -1;
        lastLiveTimeAtRef.current = Date.now();
        if (activeProfile && !savedRef.current) {
          savedRef.current = true;
          const contentType = type === "live" ? "live" : type === "series" ? "series" : "movie";
          // Carry the previously-saved track prefs into this first insert
          // so the row's track columns don't get nulled out by the dedup
          // (server deletes the prior row before inserting). If the user
          // exits before the periodic 10s save fires, their track choice
          // still survives.
          const prev = streamId ? getByStreamId(streamId) : undefined;
          saveRecentlyWatched({
            profileId: activeProfile.id,
            contentType,
            streamId: streamId,
            name: title,
            thumbnailUrl: thumbnail,
            streamUrl: streamUrl,
            seriesId: seriesIdParam,
            seasonNum,
            episodeNum,
            audioTrack: typeof prev?.audio_track === "number" ? prev.audio_track : undefined,
            textTrack: typeof prev?.text_track === "number" ? prev.text_track : undefined,
            seriesLastModified: seriesSnapshotRef.current.lastModified,
            seriesTotalEpisodes: seriesSnapshotRef.current.totalEpisodes,
            seriesFinalSeason: seriesSnapshotRef.current.finalSeason,
            seriesFinalEpisode: seriesSnapshotRef.current.finalEpisode,
          }).then((entry) => { if (entry) upsertLocal(entry); });
        }
        // Apply resume seek (once)
        if (!resumeAppliedRef.current && resumeTime && resumeTime > 5 && !isLive) {
          resumeAppliedRef.current = true;
          try { player.currentTime = resumeTime; } catch {}
        }
      } else if (e.status === "error") {
        if (isLive) {
          // Never dead-end on a live stream — auto-reconnect.
          clearLoadWatchdog();
          scheduleLiveRetry();
        } else {
          setIsLoading(false);
          setError(e.error?.message ?? "Playback failed");
        }
      } else if (e.status === "loading") {
        setIsLoading(true);
      }
    });
    return () => sub.remove();
  }, [player, isLive, scheduleLiveRetry, clearRetryTimer, activeProfile, streamId, title, thumbnail, streamUrl, seriesIdParam, seasonNum, episodeNum, type, upsertLocal, resumeTime]);

  // ── Live freeze/stall detector ───────────────────────────────────────────
  // While playing a live stream poll currentTime; if it hasn't advanced for
  // ~15s the stream froze (common on flaky IPTV connections) → reload.
  //
  // Two safety gates prevent false reconnects on streams where currentTime
  // is unreliable (some raw MPEG-TS / unbounded live HLS streams under
  // react-native-video Media3 report currentTime=0 or a fixed value even
  // while playing perfectly):
  //   1. Only count when the player reports isPlaying=true. Buffering/paused
  //      states reset the "last advance" timestamp so they don't accumulate.
  //   2. Only count once we've ever observed a positive currentTime. If
  //      currentTime is structurally broken for this stream we never enter
  //      the countdown — we rely on the player's own onError instead.
  useEffect(() => {
    clearStallTimer();
    if (!isLive || isLoading || reconnecting || error) return;
    lastLiveTimeRef.current = -1;
    lastLiveTimeAtRef.current = Date.now();
    stallTimerRef.current = setInterval(() => {
      const now = Date.now();
      // Gate 1: don't count toward stall while the player isn't actively
      // playing (buffering, paused, ad-break, etc.).
      if (!player.playing) {
        lastLiveTimeAtRef.current = now;
        return;
      }
      let t = 0;
      try { t = player.currentTime ?? 0; } catch { t = 0; }
      // Gate 2: streams where currentTime never reports a positive value
      // can't be evaluated by this detector — bail and trust onError.
      if (t <= 0) {
        lastLiveTimeAtRef.current = now;
        return;
      }
      if (lastLiveTimeRef.current === -1) {
        lastLiveTimeRef.current = t;
        lastLiveTimeAtRef.current = now;
        return;
      }
      if (t > lastLiveTimeRef.current + 0.05) {
        lastLiveTimeRef.current = t;
        lastLiveTimeAtRef.current = now;
        return;
      }
      if (now - lastLiveTimeAtRef.current >= 15000) {
        clearStallTimer();
        scheduleLiveRetry();
      }
    }, 3000);
    return clearStallTimer;
  }, [isLive, isLoading, reconnecting, error, player, scheduleLiveRetry, clearStallTimer]);

  useEffect(() => {
    const sub = player.addListener("playingChange", (e) => {
      setIsPlaying(e.isPlaying);
      // ── Save-on-pause ───────────────────────────────────────────────────
      // The throttled progress effect above only saves while currentTime
      // ticks (i.e. while playing). If the user pauses mid-stream the last
      // saved position can be up to ~10s behind reality, and any longer
      // pause that ends in an app close / crash would resume from there.
      // Persist immediately on pause so the resume point is always within
      // ~1s of where the user actually stopped.
      if (e.isPlaying || isLive || !activeProfile || !streamId) return;
      const cur = currentTimeRef.current;
      const dur = tvDurationRef.current;
      if (cur <= 5 || dur <= 0) return;
      if (completionPostedRef.current) return;
      if (dur - cur <= 30) return; // let the completion path handle end
      const contentType = type === "series" ? "series" : "movie";
      const audioTrackId = activeAudio ? Number((activeAudio as any).id) : undefined;
      const textTrackId = activeSubtitle ? Number((activeSubtitle as any).id) : -1;
      lastSavedRef.current = Date.now();
      saveRecentlyWatched({
        profileId: activeProfile.id, contentType, streamId, name: title,
        thumbnailUrl: thumbnail, streamUrl,
        currentTime: cur, duration: dur, isCompleted: false,
        seriesId: seriesIdParam, seasonNum, episodeNum,
        audioTrack: audioTrackId, textTrack: textTrackId,
        seriesLastModified: seriesSnapshotRef.current.lastModified,
        seriesTotalEpisodes: seriesSnapshotRef.current.totalEpisodes,
        seriesFinalSeason: seriesSnapshotRef.current.finalSeason,
        seriesFinalEpisode: seriesSnapshotRef.current.finalEpisode,
      }).then((entry) => { if (entry) upsertLocal(entry); });
    });
    return () => sub.remove();
  }, [player, isLive, activeProfile, streamId, type, title, thumbnail, streamUrl, seriesIdParam, seasonNum, episodeNum, activeAudio, activeSubtitle, upsertLocal]);

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

  // ── Progress save (throttled) + auto-mark-completed within 30s of end ─────
  useEffect(() => {
    if (isLive || !activeProfile || !streamId || duration <= 0 || currentTime <= 0) return;
    const contentType = type === "series" ? "series" : "movie";
    const remaining = duration - currentTime;
    const audioTrackId = activeAudio ? Number((activeAudio as any).id) : undefined;
    const textTrackId = activeSubtitle ? Number((activeSubtitle as any).id) : -1;
    if (remaining <= 30 && !completionPostedRef.current) {
      completionPostedRef.current = true;
      saveRecentlyWatched({
        profileId: activeProfile.id, contentType, streamId, name: title,
        thumbnailUrl: thumbnail, streamUrl,
        currentTime, duration, isCompleted: true,
        seriesId: seriesIdParam, seasonNum, episodeNum,
        audioTrack: audioTrackId, textTrack: textTrackId,
        seriesLastModified: seriesSnapshotRef.current.lastModified,
        seriesTotalEpisodes: seriesSnapshotRef.current.totalEpisodes,
        seriesFinalSeason: seriesSnapshotRef.current.finalSeason,
        seriesFinalEpisode: seriesSnapshotRef.current.finalEpisode,
      }).then((entry) => { if (entry) upsertLocal(entry); });
      return;
    }
    const now = Date.now();
    if (!completionPostedRef.current && now - lastSavedRef.current >= 10000 && currentTime > 5) {
      lastSavedRef.current = now;
      saveRecentlyWatched({
        profileId: activeProfile.id, contentType, streamId, name: title,
        thumbnailUrl: thumbnail, streamUrl,
        currentTime, duration, isCompleted: false,
        seriesId: seriesIdParam, seasonNum, episodeNum,
        audioTrack: audioTrackId, textTrack: textTrackId,
        seriesLastModified: seriesSnapshotRef.current.lastModified,
        seriesTotalEpisodes: seriesSnapshotRef.current.totalEpisodes,
        seriesFinalSeason: seriesSnapshotRef.current.finalSeason,
        seriesFinalEpisode: seriesSnapshotRef.current.finalEpisode,
      }).then((entry) => { if (entry) upsertLocal(entry); });
    }
  }, [currentTime, duration, isLive, activeProfile, streamId, type, title, thumbnail, streamUrl, seriesIdParam, seasonNum, episodeNum, activeAudio, activeSubtitle, upsertLocal]);

  // ── Series: pre-fetch next episode ────────────────────────────────────────
  // Same effect also snapshots series-wide info into `seriesSnapshotRef` so
  // every saveRecentlyWatched call below can persist `series_total_episodes`
  // and `series_last_modified`. The dashboard uses these to decide whether
  // a series is fully watched and whether new episodes are available.
  useEffect(() => {
    if (type !== "series" || !seriesIdParam || seasonNum == null || episodeNum == null) return;
    let cancelled = false;
    (async () => {
      try {
        const info = await xtreamApi.getSeriesInfo(parseInt(seriesIdParam, 10));
        if (cancelled || !info?.episodes) return;
        let total = 0;
        for (const arr of Object.values(info.episodes)) total += Array.isArray(arr) ? arr.length : 0;
        // Compute the FINAL available episode (highest season → highest
        // episode_num within that season). Stored on every save so the
        // dashboard can flag the series WATCHED only when the user has
        // completed this exact final episode.
        let finalSeason: number | undefined;
        let finalEpisode: number | undefined;
        const seasonNums = Object.keys(info.episodes)
          .map((k) => Number(k))
          .filter((n) => Number.isFinite(n));
        if (seasonNums.length > 0) {
          finalSeason = Math.max(...seasonNums);
          const finalEps = info.episodes[String(finalSeason)] || [];
          if (finalEps.length > 0) {
            finalEpisode = finalEps.reduce(
              (mx, e) => Math.max(mx, Number(e.episode_num) || 0),
              0,
            ) || undefined;
          }
        }
        seriesSnapshotRef.current = {
          totalEpisodes: total > 0 ? total : undefined,
          lastModified: info.info?.last_modified ?? undefined,
          finalSeason,
          finalEpisode,
        };
        // Defensive re-save: the initial readyToPlay save may have fired
        // before this async fetch resolved, leaving the row in DB with
        // NULL snapshot columns. Re-save now so the latest row carries
        // total/final/last_modified — needed for the dashboard to flag
        // the series WATCHED once the user completes the final episode.
        if (activeProfile && streamId) {
          saveRecentlyWatched({
            profileId: activeProfile.id,
            contentType: "series",
            streamId,
            name: title,
            thumbnailUrl: thumbnail,
            streamUrl,
            currentTime: currentTimeRef.current > 0 ? currentTimeRef.current : undefined,
            duration: tvDurationRef.current > 0 ? tvDurationRef.current : undefined,
            seriesId: seriesIdParam,
            seasonNum,
            episodeNum,
            seriesLastModified: seriesSnapshotRef.current.lastModified,
            seriesTotalEpisodes: seriesSnapshotRef.current.totalEpisodes,
            seriesFinalSeason: seriesSnapshotRef.current.finalSeason,
            seriesFinalEpisode: seriesSnapshotRef.current.finalEpisode,
          }).then((entry) => { if (entry) upsertLocal(entry); });
        }
        const seasonKey = String(seasonNum);
        const eps = info.episodes[seasonKey] || [];
        const next = eps.find((e) => Number(e.episode_num) === episodeNum + 1);
        if (next) { setNextEp({ episode: next, season: seasonNum }); return; }
        const seasonKeys = Object.keys(info.episodes).map(Number).filter((n) => !isNaN(n)).sort((a, b) => a - b);
        const nextSeason = seasonKeys.find((s) => s > seasonNum);
        if (nextSeason != null) {
          const sEps = info.episodes[String(nextSeason)] || [];
          if (sEps.length > 0) setNextEp({ episode: sEps[0], season: nextSeason });
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [type, seriesIdParam, seasonNum, episodeNum, activeProfile, streamId, title, thumbnail, streamUrl, upsertLocal]);

  // Trigger next-episode prompt when within 30s of end
  useEffect(() => {
    if (isLive || nextPromptShownRef.current || !nextEp) return;
    if (duration > 0 && currentTime > 0 && currentTime >= duration - 30) {
      nextPromptShownRef.current = true;
      setShowNext(true);
      setCountdown(10);
    }
  }, [currentTime, duration, isLive, nextEp]);

  const nextFiredRef = useRef(false);
  const handleNextConfirm = useCallback(() => {
    if (nextFiredRef.current) return;
    if (!nextEp || !seriesIdParam) { setShowNext(false); return; }
    nextFiredRef.current = true;
    setShowNext(false);
    try { player.pause(); } catch {}
    try { player.release(); } catch {}
    const ep = nextEp.episode;
    navigation.replace("Player", {
      streamUrl: xtreamApi.getSeriesStreamUrl(ep.id, ep.container_extension),
      title: `${seriesNameParam ?? title} - ${ep.title}`,
      type: "series",
      thumbnail: ep.info?.movie_image ?? thumbnail,
      streamId: String(ep.id),
      seriesId: seriesIdParam,
      seriesName: seriesNameParam,
      seasonNum: nextEp.season,
      episodeNum: Number(ep.episode_num),
    });
  }, [nextEp, navigation, player, seriesIdParam, seriesNameParam, thumbnail, title]);

  // Countdown ticker
  useEffect(() => {
    if (!showNext) return;
    if (countdown <= 0) { handleNextConfirm(); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [showNext, countdown, handleNextConfirm]);

  useEffect(() => {
    if (isLive) return;
    const sub1 = player.addListener("availableSubtitleTracksChange", (e) => {
      setSubtitleTracks(e.availableSubtitleTracks);
      if (!textRestoredRef.current && streamId) {
        const prev = getByStreamId(streamId);
        if (prev && typeof prev.text_track === "number") {
          if (prev.text_track === -1) {
            try { player.subtitleTrack = null; setActiveSubtitle(null); } catch {}
          } else {
            const match = e.availableSubtitleTracks.find((t: any) => Number(t.id) === prev.text_track);
            if (match) {
              try { player.subtitleTrack = match; setActiveSubtitle(match); } catch {}
            }
          }
        }
        textRestoredRef.current = true;
      }
    });
    const sub2 = player.addListener("availableAudioTracksChange", (e) => {
      setAudioTracks(e.availableAudioTracks);
      if (!audioRestoredRef.current && streamId) {
        const prev = getByStreamId(streamId);
        if (prev && typeof prev.audio_track === "number" && prev.audio_track >= 0) {
          const match = e.availableAudioTracks.find((t: any) => Number(t.id) === prev.audio_track);
          if (match) {
            try { player.audioTrack = match; setActiveAudio(match); } catch {}
          }
        }
        audioRestoredRef.current = true;
      }
    });
    return () => { sub1.remove(); sub2.remove(); };
  }, [isLive, player, streamId, getByStreamId]);

  // Reset both track-restore latches when stream changes.
  useEffect(() => {
    audioRestoredRef.current = false;
    textRestoredRef.current = false;
  }, [streamId, streamUrl]);

  // ── Hardware back button — close panel before exiting (Android TV) ────────
  useEffect(() => {
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (activePanelRef.current) {
        activePanelRef.current = null;
        setActivePanel(null);
        showAndReset();
        return true; // consumed
      }
      return false; // let navigation handle
    });
    return () => handler.remove();
  }, [showAndReset]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    if (activePanel) {
      activePanelRef.current = null;
      setActivePanel(null);
      showAndReset();
      return;
    }
    try { player.pause(); } catch {}
    try { player.release(); } catch {}
    navigation.goBack();
  }, [activePanel, player, navigation, showAndReset]);

  const handlePlayPause = useCallback(() => {
    isPlaying ? player.pause() : player.play();
    showAndReset();
  }, [isPlaying, player, showAndReset]);

  // Suppress spurious timeUpdate=0 ticks the native player can fire during
  // a seek round-trip (especially while paused). Without this gate, the
  // first timeUpdate after a seek can clobber currentTime back to 0,
  // which then breaks every subsequent skip (because handleSkip computes
  // from currentTimeRef.current).
  const seekGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armSeekGuard = useCallback(() => {
    isSeekingRef.current = true;
    if (seekGuardTimerRef.current) clearTimeout(seekGuardTimerRef.current);
    seekGuardTimerRef.current = setTimeout(() => {
      isSeekingRef.current = false;
      seekGuardTimerRef.current = null;
    }, 1200);
  }, []);
  useEffect(() => { armSeekGuardRef.current = armSeekGuard; }, [armSeekGuard]);
  useEffect(() => {
    return () => { if (seekGuardTimerRef.current) clearTimeout(seekGuardTimerRef.current); };
  }, []);

  const handleSkipBack = useCallback(() => {
    const newTime = Math.max(0, currentTimeRef.current - 10);
    armSeekGuard();
    try { playerRef.current.currentTime = newTime; } catch {}
    setCurrentTime(newTime);
    currentTimeRef.current = newTime;
    showAndReset();
  }, [showAndReset, armSeekGuard]);

  const handleSkipForward = useCallback(() => {
    const newTime = Math.min(tvDurationRef.current, currentTimeRef.current + 10);
    armSeekGuard();
    try { playerRef.current.currentTime = newTime; } catch {}
    setCurrentTime(newTime);
    currentTimeRef.current = newTime;
    showAndReset();
  }, [showAndReset, armSeekGuard]);

  const resetLargeSkipAccel = useCallback(() => {
    if (largeSkipResetTimerRef.current) clearTimeout(largeSkipResetTimerRef.current);
    largeSkipResetTimerRef.current = setTimeout(() => {
      largeSkipAccelRef.current.count = 0;
      largeSkipAccelRef.current.dir = null;
      setLargeStepBack(60);
      setLargeStepFwd(60);
    }, 1500);
  }, []);

  const handleSkipBackLarge = useCallback(() => {
    const accel = largeSkipAccelRef.current;
    const now = Date.now();
    if (accel.dir === "back" && now - accel.lastTime < 900) {
      accel.count = Math.min(accel.count + 1, 8);
    } else {
      accel.count = 1;
      accel.dir = "back";
    }
    accel.lastTime = now;
    const step = accel.count >= 5 ? 300 : accel.count >= 3 ? 120 : 60;
    setLargeStepBack(step);
    setLargeStepFwd(60);
    const newTime = Math.max(0, currentTimeRef.current - step);
    armSeekGuard();
    try { playerRef.current.currentTime = newTime; } catch {}
    setCurrentTime(newTime);
    currentTimeRef.current = newTime;
    resetLargeSkipAccel();
    showAndReset();
  }, [showAndReset, resetLargeSkipAccel, armSeekGuard]);

  const handleSkipForwardLarge = useCallback(() => {
    const accel = largeSkipAccelRef.current;
    const now = Date.now();
    if (accel.dir === "fwd" && now - accel.lastTime < 900) {
      accel.count = Math.min(accel.count + 1, 8);
    } else {
      accel.count = 1;
      accel.dir = "fwd";
    }
    accel.lastTime = now;
    const step = accel.count >= 5 ? 300 : accel.count >= 3 ? 120 : 60;
    setLargeStepFwd(step);
    setLargeStepBack(60);
    const newTime = Math.min(tvDurationRef.current, currentTimeRef.current + step);
    armSeekGuard();
    try { playerRef.current.currentTime = newTime; } catch {}
    setCurrentTime(newTime);
    currentTimeRef.current = newTime;
    resetLargeSkipAccel();
    showAndReset();
  }, [showAndReset, resetLargeSkipAccel, armSeekGuard]);

  // Wire the player action handlers up to the TVEventHandler / web key
  // refs declared above. These have to live AFTER the handler
  // declarations to satisfy the lexical "used before declaration" check.
  useEffect(() => { handlePlayPauseRef.current = handlePlayPause; }, [handlePlayPause]);
  useEffect(() => { handleSkipBackLargeRef.current = handleSkipBackLarge; }, [handleSkipBackLarge]);
  useEffect(() => { handleSkipForwardLargeRef.current = handleSkipForwardLarge; }, [handleSkipForwardLarge]);

  const handleSeek = useCallback((time: number) => {
    armSeekGuard();
    player.currentTime = time;
    setCurrentTime(time);
    currentTimeRef.current = time;
    showAndReset();
  }, [player, showAndReset, armSeekGuard]);

  const handleScreenTap = useCallback(() => {
    if (activePanel) { activePanelRef.current = null; setActivePanel(null); showAndReset(); return; }
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
    activePanelRef.current = null;
    setActivePanel(null);
    showAndReset();
  }, [player, showAndReset]);

  const handleAudioSelect = useCallback((track: SubtitleTrack | AudioTrack | null) => {
    const t = track as AudioTrack | null;
    setActiveAudio(t);
    if (t) player.audioTrack = t;
    activePanelRef.current = null;
    setActivePanel(null);
    showAndReset();
  }, [player, showAndReset]);

  const togglePanel = useCallback((panel: "cc" | "audio") => {
    setActivePanel((p) => {
      const next = p === panel ? null : panel;
      activePanelRef.current = next;
      return next;
    });
    showAndReset();
  }, [showAndReset]);

  // ── Report content modal — shared between the error screen and the
  // normal player return so users can still report a stream that never
  // managed to load (no player attached doesn't change what we report:
  // the streamId, title and type are all known from route params).
  const reportModalNode = (
    <Modal
      visible={showReport}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!reportSubmitting) {
          setShowReportWithRef(false);
          setReportReason(null);
          setReportOther("");
          setReportDone(false);
        }
      }}
    >
      <View style={styles.reportBackdrop}>
        <View style={styles.reportCard}>
          {reportDone ? (
            <>
              <Feather name="check-circle" size={36} color={Colors.dark.accent} />
              <ThemedText style={styles.reportTitle}>Report Submitted</ThemedText>
              <ThemedText style={styles.reportSubtitle}>
                Thank you — we will look into this.
              </ThemedText>
            </>
          ) : (
            <>
              <View style={styles.reportHeader}>
                <Feather name="flag" size={18} color={Colors.dark.error} />
                <ThemedText style={styles.reportTitle}>Report Content</ThemedText>
              </View>
              <ThemedText style={styles.reportSubtitle} numberOfLines={1}>
                {title}
              </ThemedText>
              <View style={styles.reportReasons}>
                {REPORT_REASONS.map((r, i) => (
                  <ReportReasonBtn
                    key={r}
                    label={r}
                    selected={reportReason === r}
                    onPress={() => setReportReason(r)}
                    autoFocus={i === 0}
                  />
                ))}
              </View>
              {reportReason === "Other" ? (
                <TextInput
                  style={styles.reportOtherInput}
                  placeholder="Describe the issue..."
                  placeholderTextColor={Colors.dark.border}
                  value={reportOther}
                  onChangeText={setReportOther}
                  multiline
                  numberOfLines={3}
                  maxLength={500}
                  autoFocus
                />
              ) : null}
              <View style={styles.reportBtnRow}>
                <ReportCancelBtn
                  onPress={() => {
                    setShowReportWithRef(false);
                    setReportReason(null);
                    setReportOther("");
                  }}
                  disabled={reportSubmitting}
                />
                <ReportSubmitBtn
                  onPress={handleSubmitReport}
                  submitting={reportSubmitting}
                  disabled={reportSubmitting || !reportReason || (reportReason === "Other" && !reportOther.trim())}
                />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );

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
          <ThemedText style={styles.errorMsg}>This content could not be played.</ThemedText>
          <View style={styles.errorBtnRow}>
            <ErrorGoBackBtn onPress={handleBack} />
            <ErrorReportBtn onPress={() => setShowReportWithRef(true)} />
          </View>
        </View>
        {reportModalNode}
      </View>
    );
  }

  // Controls visible when showControls=true, or when a panel is open (so panel stays visible during auto-hide)
  const ctrlVisible = showControls || !!activePanel;

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Video */}
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        contentFit="contain"
        nativeControls={false}
        engine={playerEngineRef.current}
      />

      {/* Loading / reconnecting */}
      {isLoading || reconnecting ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={styles.loadingText}>
            {reconnecting
              ? (retryAttempt > 0
                  ? `Reconnecting… (attempt ${retryAttempt})`
                  : "Reconnecting…")
              : "Loading stream..."}
          </ThemedText>
        </View>
      ) : null}

      {/* Background tap target — also catches Android D-pad key events globally */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handleScreenTap}
        onKeyDown={Platform.OS === "android" && !isLive ? ({ nativeEvent }: any) => {
          const { keyCode } = nativeEvent;
          // Media rewind / fast-forward (89 / 90) are intentionally NOT
          // handled here — they're routed through TVEventHandler to the
          // FAST skip handlers (60s → 2m → 5m). Only D-pad left/right
          // (21 / 22) get the small accelerating seek as a global fallback.
          const isLeft  = keyCode === 21; // DPAD_LEFT
          const isRight = keyCode === 22; // DPAD_RIGHT
          if (!isLeft && !isRight) return;
          if (tvDurationRef.current <= 0) return;
          showAndReset();
          const dir = isLeft ? "left" : "right";
          const now = Date.now();
          const hold = seekHoldRef.current;
          if (dir !== hold.dir || now - hold.lastFire > 500) {
            hold.start = now;
            hold.dir = dir;
          }
          hold.lastFire = now;
          const elapsed = now - hold.start;
          const step = elapsed > 4000 ? 60 : elapsed > 2000 ? 40 : elapsed > 1000 ? 20 : elapsed > 500 ? 10 : 5;
          const delta = isLeft ? -step : step;
          const newTime = Math.max(0, Math.min(tvDurationRef.current, currentTimeRef.current + delta));
          currentTimeRef.current = newTime;
          armSeekGuardRef.current();
          try { playerRef.current.currentTime = newTime; } catch {}
          setCurrentTime(newTime);
        } : undefined}
      />

      {/* ── Controls overlay — ALWAYS mounted so TV remote can focus buttons ── */}
      {/* pointerEvents="none" when hidden so taps pass through to the background   */}
      {/* Pressable — without this, invisible buttons/SeekBar eat every touch and   */}
      {/* the controls never come back up on touch-screen devices.                  */}
      {/* pointerEvents only affects touch; TV remote focus still works when "none".*/}
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
          {/* Report content button — red flag */}
          <CtrlBtn
            icon="flag"
            onPress={() => { setShowReportWithRef(true); showAndReset(); }}
            onFocus={showAndReset}
            active={false}
          />
          {favStreamId > 0 ? (
            <CtrlBtn
              icon="star"
              onPress={handleToggleFavourite}
              onFocus={showAndReset}
              active={isFavourited}
            />
          ) : null}
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
            <CtrlBtn
              icon="rewind"
              label={`-${largeStepBack >= 300 ? "5m" : largeStepBack >= 120 ? "2m" : "1m"}`}
              onPress={handleSkipBackLarge}
              onFocus={showAndReset}
            />
          ) : null}
          {!isLive ? (
            <CtrlBtn icon="rotate-ccw" label="-10s" onPress={handleSkipBack} onFocus={showAndReset} />
          ) : null}

          <CtrlBtn
            key={`play-${ctrlsKey}`}
            icon={isPlaying ? "pause" : "play"}
            onPress={handlePlayPause}
            onFocus={showAndReset}
            primary
            preferFocus
          />

          {!isLive ? (
            <CtrlBtn icon="rotate-cw" label="+10s" onPress={handleSkipForward} onFocus={showAndReset} />
          ) : null}
          {!isLive ? (
            <CtrlBtn
              icon="fast-forward"
              label={`+${largeStepFwd >= 300 ? "5m" : largeStepFwd >= 120 ? "2m" : "1m"}`}
              onPress={handleSkipForwardLarge}
              onFocus={showAndReset}
            />
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

      {/* Next-episode prompt — countdown only, auto-advances */}
      {showNext && nextEp ? (
        <View style={styles.nextOverlay} pointerEvents="none">
          <View style={styles.nextCard}>
            <LinearGradient
              colors={["rgba(20,20,20,0.98)", "rgba(8,8,8,0.98)"]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <ThemedText style={styles.nextLabel}>UP NEXT</ThemedText>
            <ThemedText style={styles.nextTitle} numberOfLines={2}>
              S{nextEp.season} · E{nextEp.episode.episode_num} — {nextEp.episode.title}
            </ThemedText>
            <View style={styles.nextCountdownRow}>
              <Feather name="play-circle" size={18} color={Colors.dark.accent} />
              <ThemedText style={styles.nextCountdown}>
                Playing in {countdown}s
              </ThemedText>
            </View>
          </View>
        </View>
      ) : null}

      {/* Favourite toast */}
      {toastVisible ? (
        <Animated.View
          style={[styles.toast, { opacity: toastAnim }]}
          pointerEvents="none"
        >
          <Feather name="star" size={14} color={Colors.dark.accent} />
          <ThemedText style={styles.toastText}>{toastMsg}</ThemedText>
        </Animated.View>
      ) : null}

      {/* Report content modal — shared with the error screen via reportModalNode */}
      {reportModalNode}
    </View>
  );
}

function ErrorGoBackBtn({ onPress }: { onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[styles.errorBackBtn, isActive && { opacity: 0.85, transform: [{ scale: 1.04 }] }]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hasTVPreferredFocus
    >
      <LinearGradient colors={["#FF8C1A", "#FF5500"]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
      <Feather name="arrow-left" size={16} color="#fff" />
      <ThemedText style={styles.errorBackBtnText}>Go Back</ThemedText>
    </Pressable>
  );
}

function ErrorReportBtn({ onPress }: { onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[styles.errorReportBtn, isActive && styles.errorReportBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      <Feather name="flag" size={15} color={Colors.dark.error} />
      <ThemedText style={styles.errorReportBtnText}>Report Content</ThemedText>
    </Pressable>
  );
}

function ReportReasonBtn({
  label,
  selected,
  onPress,
  autoFocus,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[
        styles.reportReasonBtn,
        selected && styles.reportReasonBtnSelected,
        isActive && styles.reportReasonBtnHover,
      ]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hasTVPreferredFocus={autoFocus}
    >
      <View style={[styles.reportRadio, selected && styles.reportRadioSelected]}>
        {selected ? <View style={styles.reportRadioDot} /> : null}
      </View>
      <ThemedText style={[styles.reportReasonText, selected && styles.reportReasonTextSelected]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function ReportCancelBtn({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[styles.reportCancelBtn, isActive && styles.reportCancelBtnHover]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
    >
      <ThemedText style={styles.reportCancelText}>Cancel</ThemedText>
    </Pressable>
  );
}

function ReportSubmitBtn({
  onPress,
  submitting,
  disabled,
}: {
  onPress: () => void;
  submitting: boolean;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[
        styles.reportSubmitBtn,
        disabled && styles.reportSubmitBtnDisabled,
        isActive && !disabled && styles.reportSubmitBtnHover,
      ]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
    >
      {submitting
        ? <ActivityIndicator size="small" color="#fff" />
        : <ThemedText style={styles.reportSubmitText}>Submit Report</ThemedText>}
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  nextOverlay: {
    position: "absolute",
    right: Spacing.lg,
    bottom: Spacing.lg,
    maxWidth: 380,
  },
  nextCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
    padding: Spacing.md,
    overflow: "hidden",
    gap: Spacing.xs,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  nextLabel: {
    color: Colors.dark.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  nextTitle: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  nextCountdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  nextCountdown: {
    color: Colors.dark.accent,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },


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
  seekBarWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  seekBarWrapperFocused: {
    borderColor: "rgba(255,102,0,0.45)",
    backgroundColor: "rgba(255,102,0,0.06)",
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
  seekBarWrapperCaptured: {
    borderColor: "#FF6600",
    backgroundColor: "rgba(255,102,0,0.18)",
    shadowOpacity: 1,
    shadowRadius: 14,
  },
  seekBarCapturedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,102,0,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.5)",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 4,
  },
  seekBarThumbCaptured: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#FF6600",
  },
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
  seekBarTrackFocused: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.32)",
  },
  seekBarFill: {
    height: "100%",
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
  seekBarThumbFocused: {
    width: 16,
    height: 16,
    borderRadius: 8,
    top: 6,
    shadowRadius: 9,
    elevation: 8,
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
  errorBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  errorReportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: "rgba(255,59,59,0.45)",
    backgroundColor: "rgba(255,59,59,0.08)",
  },
  errorReportBtnActive: {
    borderColor: Colors.dark.error,
    backgroundColor: "rgba(255,59,59,0.18)",
  },
  errorReportBtnText: { color: Colors.dark.error, fontWeight: "700", fontSize: 13 },

  toast: {
    position: "absolute",
    bottom: 80,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(8,8,8,0.93)",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
  },
  toastText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },

  // Report modal
  reportBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  reportCard: {
    width: 400,
    maxWidth: "95%",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.xl,
    gap: Spacing.md,
    alignItems: "center",
  },
  reportHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  reportTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  reportSubtitle: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    maxWidth: "90%",
  },
  reportReasons: {
    width: "100%",
    gap: Spacing.xs,
  },
  reportReasonBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  reportReasonBtnSelected: {
    borderColor: Colors.dark.error,
    backgroundColor: "rgba(255,59,59,0.1)",
  },
  reportReasonBtnHover: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accentDim,
  },
  reportRadio: {
    width: 18,
    height: 18,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
  },
  reportRadioSelected: {
    borderColor: Colors.dark.error,
  },
  reportRadioDot: {
    width: 9,
    height: 9,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.error,
  },
  reportReasonText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  reportReasonTextSelected: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  reportOtherInput: {
    width: "100%",
    minHeight: 70,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    color: Colors.dark.text,
    fontSize: 14,
    padding: Spacing.md,
    textAlignVertical: "top",
  },
  reportBtnRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    width: "100%",
    marginTop: Spacing.xs,
  },
  reportCancelBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
  },
  reportCancelBtnHover: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accentDim,
  },
  reportCancelText: {
    color: Colors.dark.textSecondary,
    fontWeight: "600",
    fontSize: 14,
  },
  reportSubmitBtn: {
    flex: 2,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.error,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
  },
  reportSubmitBtnDisabled: {
    opacity: 0.4,
  },
  reportSubmitBtnHover: {
    backgroundColor: "#ff5555",
    shadowColor: "#FF3B3B",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 8,
    elevation: 6,
  },
  reportSubmitText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
});
