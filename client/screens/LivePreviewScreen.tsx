import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Animated,
  BackHandler,
  Platform,
  Modal,
  TextInput,
} from "react-native";
import { useNavigation, useRoute, RouteProp, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "@/lib/video-player";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { xtreamApi, EpgListing } from "@/lib/xtream-api";
import { useFavourites } from "@/contexts/FavouritesContext";
import { useProfile } from "@/contexts/ProfileContext";
import { useData } from "@/contexts/DataContext";
import { useWatchHistory } from "@/contexts/WatchHistoryContext";
import { saveRecentlyWatched } from "@/components/RecentlyWatchedCard";
import type { LiveStream } from "@/lib/xtream-api";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type LivePreviewRouteProp = RouteProp<RootStackParamList, "LivePreview">;

const SIDEBAR_W = 210;
// Fixed channel row height — must match the rendered ChannelRow's
// total vertical footprint (paddingVertical 7 * 2 + icon 32 + marginBottom 2).
const CHANNEL_ROW_H = 48;

function decodeEpgString(s: string): string {
  if (!s) return "";
  try { return atob(s); } catch { return s; }
}

function formatEpgTime(timestamp: number): string {
  if (!timestamp) return "";
  const d = new Date(timestamp * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function EpgRow({ listing, isNow }: { listing: EpgListing; isNow: boolean }) {
  const title = decodeEpgString(listing.title);
  const desc = decodeEpgString(listing.description);
  const startTime = formatEpgTime(listing.start_timestamp);
  const endTime = formatEpgTime(listing.stop_timestamp);

  return (
    <View style={[styles.epgRow, isNow && styles.epgRowNow]}>
      {isNow ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.12)", "rgba(255,102,0,0.04)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      ) : null}
      <View style={styles.epgDotCol}>
        {isNow ? (
          <View style={styles.epgDotLive}>
            <View style={styles.epgDotLiveInner} />
          </View>
        ) : (
          <View style={styles.epgDotNext} />
        )}
        {isNow ? <View style={styles.epgConnector} /> : null}
      </View>
      <View style={styles.epgInfo}>
        <View style={styles.epgMeta}>
          {isNow ? (
            <View style={styles.nowBadge}>
              <ThemedText style={styles.nowBadgeText}>NOW</ThemedText>
            </View>
          ) : (
            <ThemedText style={styles.upNextLabel}>UP NEXT</ThemedText>
          )}
          {startTime && endTime ? (
            <ThemedText style={styles.epgTime}>{startTime} — {endTime}</ThemedText>
          ) : null}
        </View>
        <ThemedText style={[styles.epgTitle, isNow && styles.epgTitleNow]} numberOfLines={2}>
          {title || "Unknown programme"}
        </ThemedText>
        {desc && isNow ? (
          <ThemedText style={styles.epgDesc} numberOfLines={2}>{desc}</ThemedText>
        ) : null}
      </View>
    </View>
  );
}

function ChannelRow({
  item,
  isSelected,
  onPress,
  hasTVPreferredFocus,
}: {
  item: LiveStream;
  isSelected: boolean;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const isActive = focused || isSelected;

  return (
    <Pressable
      style={[styles.channelRow, isActive && styles.channelRowActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      {isSelected ? (
        <View style={styles.channelRowBar} />
      ) : null}
      {item.stream_icon ? (
        <Image
          source={{ uri: item.stream_icon }}
          style={styles.channelRowIcon}
          contentFit="contain"
        />
      ) : (
        <View style={[styles.channelRowIcon, styles.channelRowIconPlaceholder]}>
          <Feather name="tv" size={14} color={Colors.dark.border} />
        </View>
      )}
      <ThemedText
        style={[styles.channelRowName, isSelected && styles.channelRowNameActive]}
        numberOfLines={2}
      >
        {item.name}
      </ThemedText>
    </Pressable>
  );
}

export default function LivePreviewScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<LivePreviewRouteProp>();
  const { streamId, name, streamUrl, thumbnail, streamIcon, categoryId, initialFullscreen } = route.params;

  // Fullscreen state — same player instance reused, no second connection
  const [isFullscreen, setIsFullscreen] = useState(!!initialFullscreen);
  const [showFsOverlay, setShowFsOverlay] = useState(true);
  const fsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameInFullscreenRef = useRef(!!initialFullscreen);

  const { liveStreams } = useData();

  // Sidebar channel list — streams in same category (excluding "favourites" pseudo-category)
  const categoryChannels = categoryId && categoryId !== "favourites"
    ? liveStreams.filter((s) => String(s.category_id) === String(categoryId))
    : [];

  // Active channel state
  const [selectedId, setSelectedId] = useState(streamId);
  const [selectedName, setSelectedName] = useState(name);
  const [selectedIcon, setSelectedIcon] = useState<string | undefined>(streamIcon);

  const [epgListings, setEpgListings] = useState<EpgListing[]>([]);
  const [epgLoading, setEpgLoading] = useState(true);

  const { isFavourite, toggleFavourite } = useFavourites();
  const { activeProfile } = useProfile();
  const { upsertLocal } = useWatchHistory();
  const isFavourited = isFavourite(selectedId, "live");

  // Track which channel id we've already logged so we re-log on channel change
  const savedChannelRef = useRef<number | null>(null);

  // ── Report content ────────────────────────────────────────────────────────
  const [showReport, setShowReport] = useState(false);
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
    if (!reportReason || !activeProfile) return;
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
          stream_id: selectedId,
          stream_name: selectedName,
          stream_type: "live",
          reason: reportReason === "Other" ? "Other" : reportReason,
          other_text: reportReason === "Other" ? reportOther.trim() : null,
        }),
      });
      setReportDone(true);
      setTimeout(() => {
        setShowReport(false);
        setReportDone(false);
        setReportReason(null);
        setReportOther("");
      }, 1800);
    } catch {
      setShowReport(false);
    } finally {
      setReportSubmitting(false);
    }
  }, [reportReason, reportOther, activeProfile, selectedId, selectedName]);

  const toastAnim = useRef(new Animated.Value(0)).current;
  const [toastMsg, setToastMsg] = useState("");
  const [toastVisible, setToastVisible] = useState(false);

  const [backFocused, setBackFocused] = useState(false);
  const [backPressed, setBackPressed] = useState(false);
  const backActive = backFocused || backPressed;

  const [reportFocused, setReportFocused] = useState(false);
  const [reportPressed, setReportPressed] = useState(false);
  const reportActive = reportFocused || reportPressed;

  const listRef = useRef<FlatList>(null);

  // Engine pinned at mount from active profile's `player_live` pref.
  const playerEngineRef = useRef<"vlc" | "expo">(
    activeProfile?.player_live === "expo" ? "expo" : "vlc",
  );
  // Setup callback MUST be stable — an inline arrow gives expo-video a
  // new identity each render, which makes useVideoPlayer (Expo path)
  // recreate the player and reopen the HLS stream. LivePreview re-renders
  // a lot (EPG ticks, focus changes), so we pin via useRef.
  const playerSetupRef = useRef((p: any) => {
    p.muted = false;
    p.play();
  });
  const player = useVideoPlayer(streamUrl, playerSetupRef.current, {
    engine: playerEngineRef.current,
  });

  // Track current stream URL so we can reload it on focus return
  const currentStreamUrlRef = useRef(streamUrl);
  const hasMountedRef = useRef(false);

  // ── Auto-reconnect state ──────────────────────────────────────────────────
  // Declared up-front (above useFocusEffect) so the effect's dep array can
  // reference the helper callbacks without hitting a TDZ error at render time.
  type PlayStatus = "loading" | "playing" | "reconnecting";
  const [playStatus, setPlayStatus] = useState<PlayStatus>("loading");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const stallTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTimeRef = useRef<number>(0);
  const lastTimeAtRef = useRef<number>(Date.now());

  const clearLoadingTimeout = useCallback(() => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  }, []);
  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);
  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current) {
      clearInterval(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const reloadStream = useCallback(() => {
    try {
      player.replace(currentStreamUrlRef.current);
      player.play();
    } catch {}
  }, [player]);

  // Schedule the next auto-retry. Backs off (1s, 2s, 4s, 8s, capped) and never
  // gives up — live channels can come back at any time. Each retry re-arms a
  // 12s load-timeout watchdog so we keep trying even if the player only emits
  // "loading" events without a hard error.
  const scheduleAutoRetry = useCallback(() => {
    clearRetryTimer();
    clearLoadingTimeout();
    const attempt = retryCountRef.current + 1;
    retryCountRef.current = attempt;
    setRetryAttempt(attempt);
    setPlayStatus("reconnecting");
    const delays = [1000, 2000, 4000, 8000];
    const delay = delays[Math.min(attempt - 1, delays.length - 1)];
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      reloadStream();
      // Watchdog: still not playing after 12s → try again.
      clearLoadingTimeout();
      loadingTimeoutRef.current = setTimeout(() => {
        loadingTimeoutRef.current = null;
        scheduleAutoRetry();
      }, 12000);
    }, delay);
  }, [reloadStream, clearRetryTimer, clearLoadingTimeout]);

  const armLoadingTimeout = useCallback(() => {
    clearLoadingTimeout();
    loadingTimeoutRef.current = setTimeout(() => {
      loadingTimeoutRef.current = null;
      setPlayStatus((s) => {
        if (s === "playing") return s;
        scheduleAutoRetry();
        return "reconnecting";
      });
    }, 12000);
  }, [scheduleAutoRetry, clearLoadingTimeout]);

  const resetRetryState = useCallback(() => {
    clearRetryTimer();
    retryCountRef.current = 0;
    setRetryAttempt(0);
  }, [clearRetryTimer]);

  // Release player fully on unmount — kills the network connection immediately
  useEffect(() => {
    return () => {
      try { player.pause(); } catch {}
      try { player.release(); } catch {}
    };
  }, [player]);

  // When returning from PlayerScreen, force a fresh stream connection at live edge.
  // The blur cleanup (return value) pauses the mini-player the instant we leave this
  // screen, so it never streams in the background behind PlayerScreen.
  useFocusEffect(
    useCallback(() => {
      if (hasMountedRef.current) {
        // Returning from full-screen — reload stream from live edge and
        // reset reconnect state so we get a fresh "loading" pass.
        clearRetryTimer();
        retryCountRef.current = 0;
        setRetryAttempt(0);
        setPlayStatus("loading");
        armLoadingTimeout();
        try {
          player.replace(currentStreamUrlRef.current);
          player.play();
        } catch {}
      }
      hasMountedRef.current = true;
      return () => {
        // Screen lost focus (navigating away) — stop streaming immediately
        // and cancel any pending auto-retries so they don't fire in the bg.
        clearRetryTimer();
        clearLoadingTimeout();
        clearStallTimer();
        try { player.pause(); } catch {}
      };
    }, [player, clearRetryTimer, clearLoadingTimeout, clearStallTimer, armLoadingTimeout])
  );

  // Reload EPG whenever the selected channel changes
  useEffect(() => {
    let cancelled = false;
    setEpgLoading(true);
    setEpgListings([]);
    xtreamApi.getShortEpg(selectedId, 4).then((listings) => {
      if (!cancelled) { setEpgListings(listings); setEpgLoading(false); }
    }).catch(() => {
      if (!cancelled) setEpgLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedId]);

  // Scroll sidebar to selected channel once the list has data. Runs only
  // the first time `categoryChannels` becomes non-empty so it doesn't
  // hijack scroll position on later channel switches via the sidebar.
  const didInitialScrollRef = useRef(false);
  useEffect(() => {
    if (didInitialScrollRef.current) return;
    if (categoryChannels.length === 0) return;
    const idx = categoryChannels.findIndex((s) => s.stream_id === selectedId);
    if (idx <= 0) {
      didInitialScrollRef.current = true;
      return;
    }
    didInitialScrollRef.current = true;
    // Two scrolls: first jump-without-animation so distant items get
    // measured, then a tiny smooth re-align. requestAnimationFrame +
    // small timeout gives Metro time to lay out the FlatList.
    const t = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index: idx, animated: false, viewPosition: 0.3 });
      } catch {}
      setTimeout(() => {
        try {
          listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
        } catch {}
      }, 80);
    }, 50);
    return () => clearTimeout(t);
  }, [categoryChannels, selectedId]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
  }, [toastAnim]);

  const handleToggleFavourite = useCallback(async () => {
    const wasAdded = !isFavourited;
    await toggleFavourite({
      streamId: selectedId,
      streamType: "live",
      streamName: selectedName,
      streamIcon: selectedIcon ?? null,
    });
    showToast(wasAdded ? "Added to Favourites" : "Removed from Favourites");
  }, [isFavourited, toggleFavourite, selectedId, selectedName, selectedIcon, showToast]);

  // (PlayStatus / retry state declared above useFocusEffect.)
  useEffect(() => {
    armLoadingTimeout();
    return () => {
      clearLoadingTimeout();
      clearRetryTimer();
      clearStallTimer();
    };
  }, [armLoadingTimeout, clearLoadingTimeout, clearRetryTimer, clearStallTimer]);

  const switchToChannel = useCallback((s: LiveStream) => {
    const newUrl = xtreamApi.getLiveStreamUrl(s.stream_id);
    currentStreamUrlRef.current = newUrl;
    savedChannelRef.current = null; // re-log new channel on next readyToPlay
    setSelectedId(s.stream_id);
    setSelectedName(s.name);
    setSelectedIcon(s.stream_icon ?? undefined);
    setPlayStatus("loading");
    resetRetryState();
    clearStallTimer();
    lastTimeRef.current = 0;
    lastTimeAtRef.current = Date.now();
    armLoadingTimeout();
    reloadStream();
  }, [reloadStream, armLoadingTimeout, resetRetryState, clearStallTimer]);

  const handleChannelPress = switchToChannel;

  // ── TV remote: D-pad up/down in fullscreen → quick channel change ─────────
  // Wraps around the current category. Stays in fullscreen and re-shows the
  // overlay briefly so the viewer sees the new channel name.
  const stepChannelInFullscreen = useCallback((dir: -1 | 1) => {
    if (categoryChannels.length === 0) return;
    const idx = categoryChannels.findIndex((c) => c.stream_id === selectedId);
    if (idx === -1) return;
    let nextIdx = idx + dir;
    if (nextIdx < 0) nextIdx = categoryChannels.length - 1;
    if (nextIdx >= categoryChannels.length) nextIdx = 0;
    const next = categoryChannels[nextIdx];
    if (next.stream_id === selectedId) return;
    switchToChannel(next);
    setShowFsOverlay(true);
    resetFsHideTimer();
  }, [categoryChannels, selectedId, switchToChannel, resetFsHideTimer]);

  // Keep a ref to the latest channel-step closure so the Android onKeyDown
  // handler (attached once to a Pressable) and the web keydown listener
  // never read stale state.
  const stepRef = useRef<(dir: -1 | 1) => void>(() => {});
  const fsStateRef = useRef({ isFullscreen: false, showReport: false });
  useEffect(() => {
    stepRef.current = stepChannelInFullscreen;
    fsStateRef.current = { isFullscreen, showReport };
  }, [stepChannelInFullscreen, isFullscreen, showReport]);

  // Web: listen for ArrowUp / ArrowDown while in fullscreen.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      const { isFullscreen: fs, showReport: rep } = fsStateRef.current;
      if (!fs || rep) return;
      if (e.key === "ArrowUp") { e.preventDefault(); stepRef.current(-1); }
      else if (e.key === "ArrowDown") { e.preventDefault(); stepRef.current(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Android TV / Fire TV: handler attached to the focused fullscreen
  // Pressable. Returns nothing — React Native swallows the event when we
  // call stepRef which performs the navigation.
  const handleFsKeyDown = useCallback(({ nativeEvent }: any) => {
    const { isFullscreen: fs, showReport: rep } = fsStateRef.current;
    if (!fs || rep) return;
    const { keyCode } = nativeEvent;
    // 19 = DPAD_UP, 20 = DPAD_DOWN, 166 = CHANNEL_UP, 167 = CHANNEL_DOWN
    if (keyCode === 19 || keyCode === 166) stepRef.current(-1);
    else if (keyCode === 20 || keyCode === 167) stepRef.current(1);
  }, []);

  const handleRetry = useCallback(() => {
    resetRetryState();
    setPlayStatus("loading");
    armLoadingTimeout();
    reloadStream();
  }, [reloadStream, armLoadingTimeout, resetRetryState]);

  // ── Status listener: drives overlay + log to recently_watched ─────────────
  useEffect(() => {
    const sub = player.addListener("statusChange", (e) => {
      if (e.status === "readyToPlay") {
        setPlayStatus("playing");
        resetRetryState();
        clearLoadingTimeout();
        // Reset stall tracker — playback is healthy.
        lastTimeRef.current = 0;
        lastTimeAtRef.current = Date.now();
        if (!activeProfile) return;
        if (savedChannelRef.current === selectedId) return;
        savedChannelRef.current = selectedId;
        saveRecentlyWatched({
          profileId: activeProfile.id,
          contentType: "live",
          streamId: String(selectedId),
          name: selectedName,
          thumbnailUrl: selectedIcon,
          streamUrl: currentStreamUrlRef.current,
        }).then((entry) => { if (entry) upsertLocal(entry); });
      } else if (e.status === "error") {
        // Player error — kick off auto-retry loop instead of dead-ending.
        clearLoadingTimeout();
        scheduleAutoRetry();
      } else if (e.status === "loading") {
        setPlayStatus((cur) => (cur === "playing" || cur === "reconnecting" ? cur : "loading"));
      }
    });
    return () => sub.remove();
  }, [player, activeProfile, selectedId, selectedName, selectedIcon, upsertLocal, scheduleAutoRetry, resetRetryState, clearLoadingTimeout]);

  // ── Stall detector: while we believe we're playing, poll currentTime.
  // If it hasn't advanced for ~15s the stream has frozen and we need to reload.
  //
  // Two gates prevent false reconnects on streams where currentTime is
  // unreliable under react-native-video Media3 (some raw MPEG-TS /
  // unbounded live HLS streams report currentTime=0 or a fixed value even
  // while playing perfectly):
  //   1. Only count when the player reports isPlaying=true.
  //   2. Only count once we've ever observed a positive currentTime.
  useEffect(() => {
    clearStallTimer();
    if (playStatus !== "playing") return;
    lastTimeRef.current = -1; // sentinel: capture first value on next tick
    lastTimeAtRef.current = Date.now();
    stallTimerRef.current = setInterval(() => {
      const now = Date.now();
      if (!player.playing) {
        lastTimeAtRef.current = now;
        return;
      }
      let t = 0;
      try { t = player.currentTime ?? 0; } catch { t = 0; }
      if (t <= 0) {
        lastTimeAtRef.current = now;
        return;
      }
      if (lastTimeRef.current === -1) {
        lastTimeRef.current = t;
        lastTimeAtRef.current = now;
        return;
      }
      if (t > lastTimeRef.current + 0.05) {
        // Time advanced — healthy.
        lastTimeRef.current = t;
        lastTimeAtRef.current = now;
        return;
      }
      if (now - lastTimeAtRef.current >= 15000) {
        // Frozen for 15s+ — auto-reconnect.
        clearStallTimer();
        scheduleAutoRetry();
      }
    }, 3000);
    return clearStallTimer;
  }, [playStatus, player, scheduleAutoRetry, clearStallTimer]);

  const resetFsHideTimer = useCallback(() => {
    if (fsHideTimerRef.current) clearTimeout(fsHideTimerRef.current);
    fsHideTimerRef.current = setTimeout(() => setShowFsOverlay(false), 4000);
  }, []);

  const handleFullScreen = useCallback(() => {
    setIsFullscreen(true);
    setShowFsOverlay(true);
    resetFsHideTimer();
  }, [resetFsHideTimer]);

  // Initial TV focus target — the channel we entered with. Captured once so
  // it never re-fires on subsequent channel switches (otherwise focus would
  // keep jumping back to the original row).
  const initialFocusStreamRef = useRef<number>(streamId);

  // Channel row press: first press = switch + preview; pressing the same row
  // again (while it's already the active preview) opens fullscreen directly,
  // so the user never has to walk over to the "Watch Full Screen" button.
  const handleChannelRowPress = useCallback((s: LiveStream) => {
    if (s.stream_id === selectedId) {
      handleFullScreen();
      return;
    }
    switchToChannel(s);
  }, [selectedId, switchToChannel, handleFullScreen]);

  const exitFullscreen = useCallback(() => {
    if (cameInFullscreenRef.current) {
      // Came in directly fullscreen → leave the screen entirely
      navigation.goBack();
      return;
    }
    setIsFullscreen(false);
    if (fsHideTimerRef.current) clearTimeout(fsHideTimerRef.current);
  }, [navigation]);

  // Hardware back: exit fullscreen first, otherwise let nav handle it
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (isFullscreen && !cameInFullscreenRef.current) {
        setIsFullscreen(false);
        if (fsHideTimerRef.current) clearTimeout(fsHideTimerRef.current);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [isFullscreen]);

  // Reset auto-hide whenever fullscreen turns on / overlay is re-shown
  useEffect(() => {
    if (isFullscreen && showFsOverlay) resetFsHideTimer();
    return () => { if (fsHideTimerRef.current) clearTimeout(fsHideTimerRef.current); };
  }, [isFullscreen, showFsOverlay, resetFsHideTimer]);

  const handlePlayerTap = useCallback(() => {
    if (showFsOverlay) {
      setShowFsOverlay(false);
      if (fsHideTimerRef.current) clearTimeout(fsHideTimerRef.current);
    } else {
      setShowFsOverlay(true);
      resetFsHideTimer();
    }
  }, [showFsOverlay, resetFsHideTimer]);

  const padT = insets.top + Spacing.sm;
  const padB = insets.bottom + Spacing.sm;
  const padL = Math.max(insets.left, Spacing.sm);

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      {!isFullscreen && (
      <View style={[styles.header, { paddingTop: padT, paddingLeft: padL, paddingRight: Spacing.md }]}>
        <Pressable
          style={[styles.headerBtn, backActive && styles.headerBtnActive]}
          onPress={() => navigation.goBack()}
          onFocus={() => setBackFocused(true)}
          onBlur={() => setBackFocused(false)}
          onPressIn={() => setBackPressed(true)}
          onPressOut={() => setBackPressed(false)}
        >
          <Feather name="arrow-left" size={20} color={backActive ? Colors.dark.accent : Colors.dark.text} />
        </Pressable>

        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <ThemedText style={styles.liveText}>LIVE</ThemedText>
        </View>

        <ThemedText style={styles.channelNameHeader} numberOfLines={1}>
          {selectedName}
        </ThemedText>

        <FavBtnHeader isFavourited={isFavourited} onPress={handleToggleFavourite} />
      </View>
      )}

      {!isFullscreen && (
        <View style={[styles.divider, { marginLeft: padL, marginRight: Spacing.md }]} />
      )}

      {/* Body — ALWAYS mounted (so the VideoView/SurfaceView never tears down
          when entering fullscreen). When fullscreen, the body is hidden via
          display:'none' and the playerWrap escapes via absolute positioning.
          This is the only way Android's SurfaceView keeps a clean surface
          across small ↔ fullscreen transitions — unmounting the VideoView
          (or its host tree) leaves the surface in a black state on phones. */}
      <View
        style={[
          styles.body,
          { paddingBottom: padB, paddingLeft: padL },
          isFullscreen && styles.bodyFullscreen,
        ]}
      >
        {/* Left: channel list sidebar */}
        {!isFullscreen && categoryChannels.length > 0 ? (
          <View style={styles.sidebar}>
            <View style={styles.sidebarHeader}>
              <Feather name="tv" size={11} color={Colors.dark.accent} />
              <ThemedText style={styles.sidebarHeaderText}>Channels</ThemedText>
            </View>
            <FlatList
              ref={listRef}
              data={categoryChannels}
              keyExtractor={(s) => String(s.stream_id)}
              renderItem={({ item }) => (
                <ChannelRow
                  item={item}
                  isSelected={item.stream_id === selectedId}
                  onPress={() => handleChannelRowPress(item)}
                  hasTVPreferredFocus={item.stream_id === initialFocusStreamRef.current}
                />
              )}
              showsVerticalScrollIndicator={false}
              // Fixed-height rows let scrollToIndex jump to any item,
              // even hundreds down, without first measuring intermediate
              // rows (which is why distant channels never appeared).
              getItemLayout={(_, index) => ({
                length: CHANNEL_ROW_H,
                offset: CHANNEL_ROW_H * index,
                index,
              })}
              initialNumToRender={20}
              windowSize={10}
              onScrollToIndexFailed={(info) => {
                // Fallback: scroll to estimated offset, then retry index.
                const offset = info.averageItemLength * info.index;
                listRef.current?.scrollToOffset({ offset, animated: false });
                setTimeout(() => {
                  try {
                    listRef.current?.scrollToIndex({
                      index: info.index,
                      animated: false,
                      viewPosition: 0.3,
                    });
                  } catch {}
                }, 50);
              }}
            />
          </View>
        ) : null}

        {/* Right: player on top, EPG below */}
        <View style={[styles.rightPanel, isFullscreen && styles.rightPanelFullscreen]}>
          {/* Player — playerWrap fills its parent via flex:1 when fullscreen
              (since sidebar/EPG are hidden, the body→rightPanel→playerWrap
              chain naturally stretches edge-to-edge). VideoView NEVER unmounts.
              Using a ternary (not array merge) so the small-mode aspectRatio
              and maxHeight are completely replaced rather than merged. */}
          <View style={isFullscreen ? styles.playerWrapFullscreen : styles.playerWrap}>
            <VideoView
              style={styles.player}
              player={player}
              contentFit="contain"
              nativeControls={false}
              allowsFullscreen={false}
              allowsPictureInPicture={false}
              engine={playerEngineRef.current}
            />
            {!isFullscreen && (
              <>
                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.5)"]}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                {selectedIcon ? (
                  <View style={styles.channelIconWrap}>
                    <Image
                      source={{ uri: selectedIcon }}
                      style={styles.channelIcon}
                      contentFit="contain"
                    />
                  </View>
                ) : null}
              </>
            )}
            {/* Status overlay: opaque so the previous channel's last frame
                never bleeds through when switching to a dead channel. */}
            {playStatus !== "playing" && (
              <View style={styles.statusOverlay} pointerEvents="box-none">
                {playStatus === "loading" ? (
                  <>
                    <ActivityIndicator size="large" color={Colors.dark.accent} />
                    <ThemedText style={styles.statusOverlayText}>Loading...</ThemedText>
                  </>
                ) : (
                  <>
                    <ActivityIndicator size="large" color={Colors.dark.accent} />
                    <ThemedText style={styles.statusOverlayTitle}>Reconnecting…</ThemedText>
                    <ThemedText style={styles.statusOverlaySubtitle}>
                      {retryAttempt > 0
                        ? `Stream interrupted — retrying (attempt ${retryAttempt})`
                        : "Stream interrupted — reconnecting automatically"}
                    </ThemedText>
                    <Pressable
                      onPress={handleRetry}
                      style={({ pressed, focused }) => [
                        styles.retryBtn,
                        (pressed || focused) && styles.retryBtnActive,
                      ]}
                    >
                      <Feather name="refresh-cw" size={14} color={Colors.dark.text} />
                      <ThemedText style={styles.retryBtnText}>Retry Now</ThemedText>
                    </Pressable>
                  </>
                )}
              </View>
            )}
          </View>

          {/* Watch Full Screen + EPG — hidden in fullscreen */}
          {!isFullscreen && (
            <>
              <FullScreenButton onPress={handleFullScreen} />
              <View style={styles.epgDivider}>
                <Feather name="calendar" size={11} color={Colors.dark.accent} />
                <ThemedText style={styles.epgHeaderText}>Programme Guide</ThemedText>
              </View>
              <View style={styles.epgPanel}>
                {epgLoading ? (
                  <View style={styles.epgState}>
                    <ActivityIndicator size="small" color={Colors.dark.accent} />
                    <ThemedText style={styles.epgStateText}>Loading guide...</ThemedText>
                  </View>
                ) : epgListings.length === 0 ? (
                  <View style={styles.epgState}>
                    <Feather name="calendar" size={28} color={Colors.dark.border} />
                    <ThemedText style={styles.epgStateText}>No guide available</ThemedText>
                  </View>
                ) : (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {epgListings.map((listing, idx) => (
                      <EpgRow
                        key={listing.id || String(idx)}
                        listing={listing}
                        isNow={listing.now_playing === 1 || idx === 0}
                      />
                    ))}
                  </ScrollView>
                )}
              </View>
            </>
          )}
        </View>
      </View>

      {/* Fullscreen tap target + controls — siblings on top of the
          (now absolute-positioned) playerWrap. The VideoView is rendered
          inside playerWrap above, so it stays alive across the transition. */}
      {isFullscreen && (
        <>
          {/* Tap target: catches all taps to toggle overlay. zIndex above
              the playerWrap (50) but below the controls (70). Transparent,
              so the SurfaceView underneath shows through. Focusable on
              Android TV / Fire TV so D-pad up/down events route to
              onKeyDown for quick channel switching. */}
          <Pressable
            style={[StyleSheet.absoluteFill, { zIndex: 60 }]}
            onPress={handlePlayerTap}
            focusable={Platform.OS === "android"}
            onKeyDown={Platform.OS === "android" ? handleFsKeyDown : undefined}
          />

          {showFsOverlay && (
            <View style={[StyleSheet.absoluteFill, { zIndex: 70 }]} pointerEvents="box-none">
              <LinearGradient
                colors={["rgba(0,0,0,0.85)", "transparent"]}
                style={styles.fsTopGradient}
                pointerEvents="none"
              />
              <View style={[styles.fsTopBar, { paddingTop: padT, paddingLeft: padL + Spacing.sm, paddingRight: Spacing.lg }]}>
                <Pressable
                  style={[styles.headerBtn, backActive && styles.headerBtnActive]}
                  onPress={exitFullscreen}
                  onFocus={() => setBackFocused(true)}
                  onBlur={() => setBackFocused(false)}
                  onPressIn={() => setBackPressed(true)}
                  onPressOut={() => setBackPressed(false)}
                  onKeyDown={Platform.OS === "android" ? handleFsKeyDown : undefined}
                  hasTVPreferredFocus
                >
                  <Feather name="arrow-left" size={20} color={backActive ? Colors.dark.accent : Colors.dark.text} />
                </Pressable>
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <ThemedText style={styles.liveText}>LIVE</ThemedText>
                </View>
                <ThemedText style={styles.fsTitle} numberOfLines={1}>{selectedName}</ThemedText>
                <Pressable
                  style={[styles.headerBtn, reportActive && styles.headerBtnActive]}
                  onPress={() => { setShowReport(true); resetFsHideTimer(); }}
                  onFocus={() => { setReportFocused(true); resetFsHideTimer(); }}
                  onBlur={() => setReportFocused(false)}
                  onPressIn={() => setReportPressed(true)}
                  onPressOut={() => setReportPressed(false)}
                >
                  <Feather name="flag" size={18} color={reportActive ? Colors.dark.accent : Colors.dark.text} />
                </Pressable>
                <FavBtnHeader isFavourited={isFavourited} onPress={handleToggleFavourite} />
              </View>
            </View>
          )}
        </>
      )}

      {/* Toast */}
      {toastVisible ? (
        <Animated.View
          style={[styles.toast, { opacity: toastAnim }]}
          pointerEvents="none"
        >
          <Feather name="star" size={14} color={Colors.dark.accent} />
          <ThemedText style={styles.toastText}>{toastMsg}</ThemedText>
        </Animated.View>
      ) : null}

      {/* Report content modal */}
      <Modal
        visible={showReport}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!reportSubmitting) {
            setShowReport(false);
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
                  {selectedName}
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
                      setShowReport(false);
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
    </ThemedView>
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

function FavBtnHeader({ isFavourited, onPress }: { isFavourited: boolean; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      style={[styles.headerBtn, (focused || isFavourited) && styles.headerBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <Feather
        name="star"
        size={18}
        color={isFavourited ? Colors.dark.accent : Colors.dark.textSecondary}
      />
    </Pressable>
  );
}

function FullScreenButton({ onPress }: { onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[styles.fullScreenBtn, isActive && styles.fullScreenBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      {isActive ? (
        <LinearGradient
          colors={["#FF8800", "#FF5500"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}
      <Feather name="maximize-2" size={18} color="#fff" />
      <ThemedText style={styles.fullScreenBtnText}>Watch Full Screen</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: Spacing.sm,
    paddingRight: Spacing.md,
    gap: Spacing.sm,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  headerBtnActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accentDim,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(220,30,30,0.2)",
    borderWidth: 1,
    borderColor: "rgba(220,30,30,0.5)",
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 0,
  },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#DC1E1E" },
  liveText: { color: "#FF5555", fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  channelNameHeader: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: Colors.dark.text,
  },

  divider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.sm },

  body: {
    flex: 1,
    flexDirection: "row",
    gap: Spacing.md,
  },

  // ── Sidebar ────────────────────────────────────────────────────────────────
  sidebar: {
    width: SIDEBAR_W,
    borderRightWidth: 1,
    borderRightColor: Colors.dark.border,
    paddingRight: Spacing.xs,
  },
  sidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingBottom: Spacing.xs,
    marginBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  sidebarHeaderText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.accent,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  channelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 7,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginBottom: 2,
    overflow: "hidden",
  },
  channelRowActive: {
    backgroundColor: Colors.dark.accentDim,
  },
  channelRowBar: {
    position: "absolute",
    left: 0,
    top: 4,
    bottom: 4,
    width: 3,
    borderRadius: 2,
    backgroundColor: Colors.dark.accent,
  },
  channelRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 4,
    flexShrink: 0,
  },
  channelRowIconPlaceholder: {
    backgroundColor: Colors.dark.backgroundDefault,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  channelRowName: {
    flex: 1,
    fontSize: 12,
    color: Colors.dark.textSecondary,
    lineHeight: 16,
  },
  channelRowNameActive: {
    color: Colors.dark.text,
    fontWeight: "600",
  },

  // ── Right panel ───────────────────────────────────────────────────────────
  rightPanel: {
    flex: 1,
    flexDirection: "column",
    gap: Spacing.sm,
    paddingRight: Spacing.md,
  },

  playerWrap: {
    aspectRatio: 16 / 9,
    maxHeight: "45%",
    alignSelf: "center",
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    flexShrink: 0,
  },
  bodyFullscreen: {
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    gap: 0,
  },
  rightPanelFullscreen: {
    flex: 1,
    paddingRight: 0,
    gap: 0,
  },
  playerWrapFullscreen: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#000",
    overflow: "hidden",
    borderRadius: 0,
    borderWidth: 0,
  },
  player: { width: "100%", height: "100%" },
  channelIconWrap: {
    position: "absolute",
    bottom: Spacing.sm,
    right: Spacing.sm,
    width: 40,
    height: 40,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: BorderRadius.sm,
    padding: 4,
  },
  channelIcon: { width: "100%", height: "100%" },
  statusOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dark.background,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  statusOverlayText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    marginTop: Spacing.xs,
  },
  statusOverlayTitle: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: "700",
    marginTop: Spacing.xs,
  },
  statusOverlaySubtitle: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    textAlign: "center",
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    marginTop: Spacing.xs,
  },
  retryBtnActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accent + "22",
  },
  retryBtnText: {
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: "600",
  },

  fullScreenBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1.5,
    borderColor: Colors.dark.accent,
    paddingVertical: Spacing.sm,
    overflow: "hidden",
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
    flexShrink: 0,
  },
  fullScreenBtnActive: {
    borderColor: "#FF8800",
    shadowOpacity: 0.8,
    shadowRadius: 14,
  },
  fullScreenBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  epgDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    flexShrink: 0,
  },
  epgHeaderText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.accent,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  epgPanel: { flex: 1 },

  epgRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginBottom: 2,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "transparent",
  },
  epgRowNow: { borderColor: "rgba(255,102,0,0.3)" },

  epgDotCol: { width: 18, alignItems: "center", paddingTop: 2 },
  epgDotLive: {
    width: 13, height: 13, borderRadius: 6.5,
    backgroundColor: "rgba(255,102,0,0.25)",
    borderWidth: 1, borderColor: Colors.dark.accent,
    justifyContent: "center", alignItems: "center",
  },
  epgDotLiveInner: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.dark.accent },
  epgConnector: { width: 1, flex: 1, backgroundColor: "rgba(255,102,0,0.25)", marginTop: 3 },
  epgDotNext: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.dark.border, marginTop: 3 },

  epgInfo: { flex: 1, gap: 2 },
  epgMeta: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  nowBadge: {
    backgroundColor: Colors.dark.accent, borderRadius: 3,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  nowBadgeText: { color: "#fff", fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  upNextLabel: {
    fontSize: 9, fontWeight: "600", color: Colors.dark.textSecondary,
    letterSpacing: 0.4, textTransform: "uppercase",
  },
  epgTime: { fontSize: 11, color: Colors.dark.textSecondary, fontWeight: "500" },
  epgTitle: { fontSize: 12, fontWeight: "600", color: Colors.dark.textSecondary, lineHeight: 17 },
  epgTitleNow: { color: Colors.dark.text, fontSize: 13, fontWeight: "700" },
  epgDesc: { fontSize: 10, color: Colors.dark.textSecondary, lineHeight: 15, marginTop: 1 },

  epgState: { flex: 1, justifyContent: "center", alignItems: "center", gap: Spacing.sm },
  epgStateText: { color: Colors.dark.textSecondary, fontSize: 12 },

  toast: {
    position: "absolute",
    bottom: 60,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(8,8,8,0.92)",
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
  toastText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  // ── Fullscreen overlay ─────────────────────────────────────────────────────
  fsRoot: {
    position: "absolute",
    top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: "#000",
  },
  fsTopGradient: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: 120,
  },
  fsTopBar: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  fsTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },

  // ── Report content modal ──────────────────────────────────────────────────
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
  },
  reportSubmitText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
});
