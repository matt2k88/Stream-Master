import { TVEventHandler, requestTvFocus } from "@/lib/tv-event-handler";
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
  useWindowDimensions,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useVideoPlayer, VideoView, makeVideoSource } from "@/lib/video-player";
import {
  useAspectMode,
  ASPECT_MODES,
  ASPECT_LABELS,
  aspectModeToContentFit,
  aspectInnerStyle,
  type AspectMode,
} from "@/lib/aspect-ratio";
import type { SubtitleTrack, AudioTrack } from "@/lib/video-player";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { LinearGradient } from "expo-linear-gradient";
import { saveRecentlyWatched } from "@/components/RecentlyWatchedCard";
import { useProfile } from "@/contexts/ProfileContext";
import { useFavourites } from "@/contexts/FavouritesContext";
import { useWatchHistory } from "@/contexts/WatchHistoryContext";
import { useSideMenu } from "@/contexts/SideMenuContext";
import { useUISettings } from "@/contexts/UISettingsContext";
import { xtreamApi, Episode } from "@/lib/xtream-api";
import { ControlButton, ControlRow } from "@/components/player/ControlButton";
import { PlayerLabels } from "@/components/player/playerLabels";
import { TrackPanel as SharedTrackPanel } from "@/components/player/TrackPanel";

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
  const [barFocused, setBarFocused] = useState(false);
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
    // findNodeHandle throws on react-native-web; the tag is only used for
    // native Android-TV directional focus, so skip it on web.
    if (pressableRef.current && Platform.OS !== "web") {
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

  // The bar IS focusable on TV, but traps left/right on itself via
  // nextFocusLeft/nextFocusRight pointing at its own node. That is what makes
  // remote seeking possible: with focus trapped horizontally the D-pad cannot
  // wander off to the next button, so left/right are free to scrub (handled in
  // PlayerScreen's media-key subscription, gated on the focus we report here).
  // Up/down still leave the bar as normal.
  //
  // It was previously a plain View precisely so the D-pad would skip it —
  // which is why seeking by remote never worked at all. Touch dragging is
  // unaffected; it still runs through the inner View's pan handlers.
  return (
    <Pressable
      ref={pressableRef as any}
      style={styles.seekBarWrapper}
      collapsable={false}
      focusable={Platform.OS !== "web"}
      // Left/right ALWAYS point back at this bar, so the only way off it is up
      // or down. Doing this conditionally (on focus) left a frame where the
      // prop had not been applied yet and a quick press escaped. Focus still
      // arrives vertically, which is how the control row below reaches it.
      nextFocusLeft={selfTag ?? undefined}
      nextFocusRight={selfTag ?? undefined}
      onFocus={() => {
        setBarFocused(true);
        onFocusChange?.(true);
        onFocus?.();
      }}
      onBlur={() => {
        setBarFocused(false);
        onFocusChange?.(false);
      }}
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
        <View style={[styles.seekBarTrack, barFocused && styles.seekBarTrackFocused]}>
          <View style={[styles.seekBarFill, { width: frac * barWidth }]} />
        </View>
        <View
          style={[
            styles.seekBarThumb,
            barFocused && styles.seekBarThumbFocused,
            { left: thumbLeft },
          ]}
          pointerEvents="none"
        />
      </View>
    </Pressable>
  );
}

// ─── Control button ───────────────────────────────────────────────────────────
// Thin adapter over the shared player ControlButton so this screen, the VLC
// screen and the live player all look and focus identically. The props are the
// ones this screen already passed; only the rendering moved.
function CtrlBtn({
  icon,
  label,
  onPress,
  onFocus,
  active = false,
  primary = false,
  preferFocus = false,
  btnRef,
}: {
  icon: keyof typeof Feather.glyphMap;
  label?: string;
  onPress: () => void;
  onFocus?: () => void;
  active?: boolean;
  primary?: boolean;
  preferFocus?: boolean;
  btnRef?: React.Ref<View>;
}) {
  return (
    <ControlButton
      icon={icon}
      label={label}
      onPress={onPress}
      onActivity={onFocus}
      tone={primary ? "primary" : "default"}
      active={active}
      hasTVPreferredFocus={preferFocus}
      viewRef={btnRef}
    />
  );
}

// ─── Track panel (CC / Audio) ─────────────────────────────────────────────────
// Adapter over the shared TrackPanel. The shared one lists tracks vertically
// with a tick on the active row and states the current selection in its header,
// instead of a horizontal chip strip — easier to walk with a D-pad, and a wrong
// selection is obvious at a glance.
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
    <SharedTrackPanel
      title={title}
      icon={icon}
      tracks={tracks}
      selected={selected}
      onSelect={onSelect}
      onClose={onClose}
      onActivity={onFocus}
      showOff={showOff}
    />
  );
}

// ─── Aspect ratio panel ──────────────────────────────────────────────────────
// Aspect modes are a short, fixed set, so they read better as a row of labelled
// buttons than as a chip strip — same control styling and focus behaviour as
// every other button in the player.
function AspectPanel({
  mode, onSelect, onClose, onFocus,
}: {
  mode: AspectMode;
  onSelect: (m: AspectMode) => void;
  onClose: () => void;
  onFocus?: () => void;
}) {
  return (
    <View style={styles.aspectPanel}>
      <View style={styles.aspectHead}>
        <Feather name="maximize" size={15} color={Colors.dark.accent} />
        <ThemedText style={styles.aspectTitle}>{PlayerLabels.aspect}</ThemedText>
        <ControlButton
          icon="x"
          onPress={onClose}
          onActivity={onFocus}
          accessibilityLabel="Close"
        />
      </View>
      <ControlRow>
        {ASPECT_MODES.map((m, idx) => (
          <ControlButton
            key={m}
            text={ASPECT_LABELS[m]}
            onPress={() => onSelect(m)}
            onActivity={onFocus}
            active={mode === m}
            hasTVPreferredFocus={mode === m || (mode == null && idx === 0)}
          />
        ))}
      </ControlRow>
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
    resumeTime, seasonNum, episodeNum, cinemaRelease,
  } = route.params;
  const isLive = type === "live";
  const { activeProfile } = useProfile();
  const { upsertLocal, getByStreamId } = useWatchHistory();
  const { autoPlayNext } = useUISettings();
  // Independent latches so audio and subtitle restoration don't race —
  // whichever `availableTracksChange` event fires first only marks its
  // own slot done; the other event still gets a chance to restore.
  const audioRestoredRef = useRef(false);
  const textRestoredRef = useRef(false);
  const { isFavourite, toggleFavourite } = useFavourites();
  const { open: openSideMenu } = useSideMenu();
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
  // The play button's view, so focus can be handed back to it explicitly when a
  // panel closes (hasTVPreferredFocus cannot do it — it fires before layout).
  const playBtnRef = useRef<View>(null);

  // Closing a panel unmounts whatever had focus. Re-mounting the play button
  // (ctrlsKey) is not enough on its own, because hasTVPreferredFocus requests
  // focus before the view is laid out and Android quietly refuses. Ask for it
  // again on the next frame, via the native module.
  const restoreFocusToControls = useCallback(() => {
    setCtrlsKey((k) => k + 1);
    requestAnimationFrame(() => {
      requestTvFocus(findNodeHandle(playBtnRef.current));
    });
  }, []);
  // Target position while a seek run is in progress, and the timer that commits
  // it once the user stops pressing.
  const pendingSeekRef = useRef<number | null>(null);
  const seekCommitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When the last step was actually applied, so key-repeat cannot outrun us.
  const seekStepAtRef = useRef<number>(0);
  // Whether the controls overlay is on screen — left/right seek directly when
  // it is not.
  const ctrlVisibleRef = useRef(false);
  const prevShowControls = useRef(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const isPlayingRef = useRef(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<SubtitleTrack | null>(null);
  const [activeAudio, setActiveAudio] = useState<AudioTrack | null>(null);
  const [activePanel, setActivePanel] = useState<"cc" | "audio" | "aspect" | null>(null);
  const [aspectMode, setAspectMode] = useAspectMode();
  const { width: winW, height: winH } = useWindowDimensions();

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

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

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
  // A per-route `forceEngine` param (e.g. Catch Up always uses Expo
  // because VLC can't seek MPEG-TS /timeshift/ streams) takes
  // precedence over the profile pref — must match the router's
  // selection above so the right native module is loaded.
  const routeForceLegacy = route.params.forceEngine === "expo" || route.params.forceEngine === "vlc"
    ? route.params.forceEngine : null;
  const playerEngineRef = useRef<"vlc" | "expo">(
    routeForceLegacy ??
      ((isLive ? activeProfile?.player_live : activeProfile?.player_vod) === "expo"
        ? "expo"
        : "vlc"),
  );
  // VLC hardware-decoding mode, captured at mount (same lifecycle as the
  // engine choice). Ignored by the Expo engine. Defaults to "auto".
  const hwDecodeRef = useRef<"auto" | "on" | "off">(
    activeProfile?.player_hw_decode === "on" || activeProfile?.player_hw_decode === "off"
      ? activeProfile.player_hw_decode
      : "auto",
  );
  // Network pre-buffer size in ms, captured at mount. Applies to both
  // VLC (--network-caching) and Expo (bufferOptions). Default 3000 ms.
  const bufferMsRef = useRef<number>(
    typeof activeProfile?.player_buffer_ms === "number" &&
    activeProfile.player_buffer_ms >= 1000
      ? activeProfile.player_buffer_ms
      : 3000,
  );
  const player = useVideoPlayer(streamUrl, playerSetupRef.current, {
    engine: playerEngineRef.current,
    hwDecode: hwDecodeRef.current,
    bufferMs: bufferMsRef.current,
  });

  // ── Controls visibility ───────────────────────────────────────────────────
  const activePanelRef = useRef<"cc" | "audio" | "aspect" | null>(null);

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
        // Seek by remote. Two things make this feel fast rather than stuttery:
        //
        // 1. The seek is NOT committed on every press. Each press only moves a
        //    target position (and the bar), and the real seek fires once you
        //    stop pressing. Committing per press made the player re-buffer
        //    between presses — the stop-start you get today.
        // 2. The step ramps the longer you hold, so a whole film is crossable
        //    in a couple of seconds.
        //
        // It also works with no controls on screen: if the overlay is hidden,
        // left/right seek straight away without having to focus the bar first.
        if (isLiveRef.current) return;
        if (et !== "left" && et !== "right") return;
        if (!seekBarFocusedRef.current && ctrlVisibleRef.current) return;

        const now = Date.now();
        const isSameDir = et === seekHoldRef.current.dir;
        // 900ms of no presses ends a run. Deliberately generous: a TV remote
        // driving the stick over HDMI-CEC delivers repeats slowly and
        // irregularly, and a tighter window would treat one long hold as
        // several separate runs — resetting the ramp each time. The commit
        // debounce (600ms) is shorter than this window, so a run always
        // commits before the next one starts.
        if (!isSameDir || now - seekHoldRef.current.lastFire > 900) {
          seekHoldRef.current.start = now;
          seekHoldRef.current.dir = et;
          pendingSeekRef.current = null;
        }
        seekHoldRef.current.lastFire = now;

        // Android repeats key-downs while a button is held, and Fire TV repeats
        // fast. Without a floor between applied steps, a long hold with a 5
        // minute step would jump hours in a second. One step per 110ms gives a
        // smooth, predictable ramp regardless of the device's repeat rate.
        if (now - (seekStepAtRef.current ?? 0) < 110) return;
        seekStepAtRef.current = now;

        const held = now - seekHoldRef.current.start;
        let step: number;
        if (held > 6000) step = 300;
        else if (held > 4000) step = 120;
        else if (held > 2500) step = 60;
        else if (held > 1200) step = 30;
        else if (held > 500) step = 15;
        else step = 10;

        const from = pendingSeekRef.current ?? currentTimeRef.current;
        const target = Math.max(0, Math.min(tvDurationRef.current, from + (et === "left" ? -step : step)));
        pendingSeekRef.current = target;

        // Move the bar immediately so scrubbing feels direct, even though the
        // player has not been told yet.
        setCurrentTime(target);
        currentTimeRef.current = target;
        showAndResetRef.current();

        if (seekCommitRef.current) clearTimeout(seekCommitRef.current);
        seekCommitRef.current = setTimeout(() => {
          const commitTo = pendingSeekRef.current;
          pendingSeekRef.current = null;
          seekCommitRef.current = null;
          if (commitTo == null) return;
          try {
            armSeekGuardRef.current();
            playerRef.current.currentTime = commitTo;
          } catch {}
        }, 600);  // see note on the run window below
        showAndResetRef.current();
      });
    } catch {
      // TVEventHandler not available on this platform/build
    }
    return () => {
      try { tvHandler?.disable(); } catch {}
      if (seekCommitRef.current) clearTimeout(seekCommitRef.current);
    };
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
      player.replace(makeVideoSource(streamUrl));
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
            streamUrl: cinemaRelease ? undefined : streamUrl,
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
      // Gate 1: don't count toward stall while the player is paused.
      // On the expo engine a non-playing flag also covers normal buffering,
      // so we treat "!playing" as paused and reset. On the VLC engine a
      // provider-side connection drop (e.g. the ~3h Xtream session cap)
      // leaves the player reporting not-playing while it actually sits
      // frozen mid-stream — so we only reset on an explicit user pause and
      // otherwise fall through to the currentTime-advance check, letting a
      // silent freeze trip the reload.
      const vlcEngine = playerEngineRef.current === "vlc";
      const intentionallyPaused = vlcEngine ? !!player._paused : !player.playing;
      if (intentionallyPaused) {
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

  // A live channel never legitimately reaches end-of-stream. If the player
  // reports playToEnd on a live stream it's a provider-side disconnect
  // (e.g. the ~3h Xtream session cap) surfacing as a clean stop rather than
  // an error — route it into the same auto-reconnect backoff instead of
  // dead-ending. VOD end (next episode / completion) is left untouched.
  useEffect(() => {
    if (!isLive) return;
    const sub = player.addListener("playToEnd", () => {
      clearLoadWatchdog();
      scheduleLiveRetry();
    });
    return () => sub.remove();
  }, [player, isLive, scheduleLiveRetry, clearLoadWatchdog]);

  useEffect(() => {
    const sub = player.addListener("playingChange", (e) => {
      setIsPlaying(e.isPlaying);
      isPlayingRef.current = e.isPlaying;
      // A countdown must never survive a pause. It will be shown again if
      // playback resumes near the end, rather than advancing while unattended.
      if (!e.isPlaying) {
        setShowNext(false);
        setCountdown(10);
        nextPromptShownRef.current = false;
      }
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
        thumbnailUrl: thumbnail, streamUrl: cinemaRelease ? undefined : streamUrl,
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
      // While a remote seek run is in flight the player is still sitting at the
      // OLD position and keeps reporting it, which fought the scrub target and
      // made the bar flick back and forth. Ignore its updates until the seek is
      // committed and settled.
      if (pendingSeekRef.current != null) return;
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
        thumbnailUrl: thumbnail, streamUrl: cinemaRelease ? undefined : streamUrl,
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
        thumbnailUrl: thumbnail, streamUrl: cinemaRelease ? undefined : streamUrl,
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

  // Trigger next-episode prompt when within 20s of end (only when auto-play is enabled)
  useEffect(() => {
    if (isLive || nextPromptShownRef.current || !nextEp) return;
    if (!autoPlayNext) return;
    if (!isPlaying) return;
    if (duration > 0 && currentTime > 0 && currentTime >= duration - 20) {
      nextPromptShownRef.current = true;
      setShowNext(true);
      setCountdown(10);
    }
  }, [currentTime, duration, isLive, nextEp, autoPlayNext]);

  const nextFiredRef = useRef(false);
  const handleNextConfirm = useCallback(() => {
    if (nextFiredRef.current) return;
    // The countdown may have reached zero just as the user paused. Do not
    // replace the episode unless playback is still active.
    if (!isPlayingRef.current) {
      setShowNext(false);
      setCountdown(10);
      nextPromptShownRef.current = false;
      return;
    }
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

  const handleNextCancel = useCallback(() => {
    setShowNext(false);
  }, []);

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
      } else {
        // Nothing saved for this stream: ask the ENGINE what it is playing
        // rather than assuming nothing. expo-video reports its selected track,
        // and the VLC shim resolves one from the id it was last given — which
        // is what stops the panel claiming "Off" while subtitles are on screen.
        try {
          const current = player.subtitleTrack ?? null;
          if (current) setActiveSubtitle(current);
        } catch {}
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
      } else {
        try {
          const current = player.audioTrack ?? null;
          if (current) setActiveAudio(current);
        } catch {}
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
        // Hand focus back to the play button. Without this the focused view has
        // just been unmounted, so the remote does nothing at all until the
        // controls time out and come back.
        restoreFocusToControls();
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

  const togglePanel = useCallback((panel: "cc" | "audio" | "aspect") => {
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
  // Mirrored into a ref so the media-key handler (which has empty deps) can read
  // it without re-subscribing on every visibility change.
  useEffect(() => { ctrlVisibleRef.current = ctrlVisible; }, [ctrlVisible]);

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Video — wrapped in a centring box so 16:9 / 4:3 modes can force
          the picture to that ratio (with letter/pillarboxing). For the
          three "free" modes (fit/fill/zoom) the inner view fills the
          whole screen and contentFit decides how the picture sits. */}
      <View style={styles.videoStage}>
        {(() => {
          const fit = aspectModeToContentFit(aspectMode);
          // expo-video's own contentFit handles fit/fill/cover correctly, so zoom
          // only needs the natural size when the engine can report it.
          const innerStyle = aspectInnerStyle(aspectMode, winW, winH);
          // NOTE: deliberately NOT keyed on aspectMode any more. Re-keying
          // tore down and rebuilt the native surface mid-playback, which is a
          // plausible cause of the Fire TV crash when changing aspect (it does
          // not reproduce on BlueStacks, and Fire TV is the device where
          // SurfaceView recreation during hardware-decoded playback is most
          // fragile). It is also unnecessary: contentFit is a live prop and the
          // forced-ratio box is plain style — both apply without a remount.
          return (
            <VideoView
              style={innerStyle}
              player={player}
              contentFit={fit}
              nativeControls={false}
              engine={playerEngineRef.current}
            />
          );
        })()}
      </View>

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
          <CtrlBtn
            icon="menu"
            onPress={() => { openSideMenu({ transparent: true }); showAndReset(); }}
            onFocus={showAndReset}
          />
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
              <ThemedText style={styles.liveText}>{PlayerLabels.live}</ThemedText>
            </View>
          ) : <View style={{ width: 48 }} />}
        </View>

        {/* One bottom bar. The old layout floated play/skip in the middle of
            the picture with the big skips pinned to the screen edges, which is
            why the two players never looked alike — each had drifted its own
            way. Everything now sits in a single bar: panels, then the seek
            row, then one row of actions. */}
        <View style={styles.bottomSection}>
          {activePanel === "aspect" ? (
            <AspectPanel
              mode={aspectMode}
              onSelect={(m) => { setAspectMode(m); showAndReset(); }}
              onClose={() => { activePanelRef.current = null; setActivePanel(null); restoreFocusToControls(); showAndReset(); }}
              onFocus={showAndReset}
            />
          ) : null}

          {!isLive && activePanel === "cc" ? (
            <TrackPanel
              title="Subtitles"
              icon="message-square"
              tracks={subtitleTracks}
              selected={activeSubtitle}
              onSelect={handleSubtitleSelect}
              onClose={() => { setActivePanel(null); activePanelRef.current = null; restoreFocusToControls(); showAndReset(); }}
              showOff
              onFocus={showAndReset}
            />
          ) : null}

          {!isLive && activePanel === "audio" ? (
            <TrackPanel
              title={PlayerLabels.audio}
              icon="music"
              tracks={audioTracks}
              selected={activeAudio}
              onSelect={handleAudioSelect}
              onClose={() => { setActivePanel(null); activePanelRef.current = null; restoreFocusToControls(); showAndReset(); }}
              onFocus={showAndReset}
            />
          ) : null}

          {!isLive ? (
            <View style={styles.progressRow}>
              <ThemedText style={styles.timeText}>{formatTime(currentTime)}</ThemedText>
              <SeekBar
                currentTime={currentTime}
                duration={duration}
                onSeek={handleSeek}
                onFocus={showAndReset}
                // Without this the media-key handler's left/right branch is
                // unreachable (it checks seekBarFocusedRef), which is why
                // seeking by remote never worked on this screen.
                onFocusChange={(focused) => {
                  // Write the ref synchronously, not via an effect: the
                  // media-key handler reads it on the very next key press, and
                  // a render's delay was long enough to miss one.
                  seekBarFocusedRef.current = focused;
                  setSeekBarFocused(focused);
                }}
              />
              <ThemedText style={styles.timeText}>{formatTime(duration)}</ThemedText>
            </View>
          ) : null}

          <View style={styles.actionRow}>
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
              btnRef={playBtnRef}
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

            <View style={styles.actionSpacer} />

            {!isLive ? (
              <CtrlBtn
                icon="message-square"
                label={PlayerLabels.subtitles}
                onPress={() => togglePanel("cc")}
                onFocus={showAndReset}
                active={activePanel === "cc" || !!activeSubtitle}
              />
            ) : null}
            {!isLive ? (
              <CtrlBtn
                icon="music"
                label={PlayerLabels.audio}
                onPress={() => togglePanel("audio")}
                onFocus={showAndReset}
                active={activePanel === "audio"}
              />
            ) : null}
            {/* Sits with the other panel buttons, next to the panel it opens —
                it used to be in the top bar while its menu appeared at the
                bottom, which made the two feel unrelated. */}
            <CtrlBtn
              icon="maximize"
              label={ASPECT_LABELS[aspectMode]}
              onPress={() => togglePanel("aspect")}
              onFocus={showAndReset}
              active={activePanel === "aspect" || aspectMode !== "fit"}
            />
          </View>
        </View>
      </View>

      {/* Next-episode prompt — wrapped in Modal so it renders above the native video surface on Fire TV/Android */}
      <Modal
        visible={showNext && !!nextEp}
        transparent
        animationType="fade"
        onRequestClose={handleNextCancel}
        statusBarTranslucent
      >
        <View style={styles.nextModalBackdrop} pointerEvents="box-none">
          {nextEp ? (
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
                <Feather name="play-circle" size={16} color={Colors.dark.accent} />
                <ThemedText style={styles.nextCountdown}>
                  Playing in {countdown}s
                </ThemedText>
              </View>
              <View style={styles.nextBtnRow}>
                <NextEpBtn label="Cancel" onPress={handleNextCancel} variant="cancel" />
                <NextEpBtn label="Play Now" onPress={handleNextConfirm} variant="confirm" autoFocus />
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

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

function NextEpBtn({
  label, onPress, variant, autoFocus,
}: { label: string; onPress: () => void; variant: "cancel" | "confirm"; autoFocus?: boolean }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[
        styles.nextBtn,
        variant === "confirm" ? styles.nextBtnConfirm : styles.nextBtnCancel,
        isActive && (variant === "confirm" ? styles.nextBtnConfirmActive : styles.nextBtnCancelActive),
      ]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hasTVPreferredFocus={autoFocus}
    >
      {variant === "confirm" && (
        <LinearGradient colors={["#FF8C1A", "#FF5500"]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
      )}
      {variant === "confirm" && <Feather name="skip-forward" size={13} color="#fff" />}
      <ThemedText style={[styles.nextBtnText, variant === "confirm" && styles.nextBtnTextConfirm]}>{label}</ThemedText>
    </Pressable>
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
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  actionSpacer: { flex: 1, minWidth: Spacing.md },
  aspectPanel: {
    backgroundColor: "rgba(12,12,19,0.96)",
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.md,
    maxWidth: 520,
    width: "100%",
  },
  aspectHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  aspectTitle: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "700" },
  container: { flex: 1, backgroundColor: "#000" },

  nextModalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "flex-end",
    padding: Spacing.lg,
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
  nextBtnRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  nextBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  nextBtnCancel: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  nextBtnCancelActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderColor: "rgba(255,255,255,0.4)",
  },
  nextBtnConfirm: {
    borderWidth: 1,
    borderColor: Colors.dark.accent,
  },
  nextBtnConfirmActive: {
    borderColor: "#FF8C1A",
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 6,
  },
  nextBtnText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "600",
  },
  nextBtnTextConfirm: {
    color: "#fff",
    fontWeight: "700",
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    // Opaque so the previous channel's last decoded frame is fully hidden
    // while loading/reconnecting (the VideoView keeps painting it underneath)
    // and the status text stays readable regardless of that frame.
    backgroundColor: Colors.dark.backgroundRoot,
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
  videoStage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
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
  // Focus must be unmistakable from across a room: the bar thickens and
  // brightens. At 4px it was indistinguishable from the resting state.
  seekBarTrackFocused: {
    height: 8,
    backgroundColor: "rgba(255,255,255,0.38)",
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
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: Colors.dark.accent,
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
