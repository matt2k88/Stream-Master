import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  BackHandler,
  Platform,
  ScrollView,
  Modal,
  TextInput,
  Animated,
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
import { useFavourites } from "@/contexts/FavouritesContext";

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

const REPORT_REASONS = [
  "Constant buffering",
  "Does not load",
  "Wrong language",
  "Jittery / stuttering",
  "Wrong content",
  "Other",
] as const;

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

// VLC reports times in milliseconds. Convert ms → s safely.
function msToSec(v: any): number {
  if (typeof v !== "number" || !isFinite(v) || v < 0) return 0;
  return v / 1000;
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
  iconColor,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  size?: number;
  autoFocus?: boolean;
  style?: any;
  active?: boolean;
  iconColor?: string;
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
      <Feather
        name={icon}
        size={size}
        color={isActive ? "#000" : (iconColor || Colors.dark.text)}
      />
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

export default function VlcPlayerScreen(props: VlcPlayerScreenProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { activeProfile } = useProfile();
  const { upsertLocal } = useWatchHistory();
  const { isFavourite, toggleFavourite } = useFavourites();

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

  // ── Favourite ────────────────────────────────────────────────────────────
  const favStreamType: "live" | "movies" | "series" =
    props.type === "live" ? "live" : props.type === "series" ? "series" : "movies";
  const favStreamId =
    props.type === "series" && props.seriesId
      ? parseInt(props.seriesId, 10)
      : props.streamId ? parseInt(props.streamId, 10) : 0;
  const favStreamName = props.type === "series" && props.seriesName ? props.seriesName : props.title;
  const isFavourited = favStreamId > 0 ? isFavourite(favStreamId, favStreamType) : false;

  const toastAnim = useRef(new Animated.Value(0)).current;
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  // ── Report state ─────────────────────────────────────────────────────────
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportOther, setReportOther] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportDone, setReportDone] = useState(false);

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
    hideTimerRef.current = setTimeout(() => {
      // Don't auto-hide while a panel or modal is open
      if (panel || showReport) return;
      setShowOverlay(false);
    }, HIDE_DELAY);
  }, [panel, showReport]);

  useEffect(() => {
    showAndReset();
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [showAndReset]);

  // ── Hardware back ─────────────────────────────────────────────────────────
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (showReport) { setShowReport(false); return true; }
      if (panel) { setPanel(null); showAndReset(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [panel, showReport, showAndReset]);

  const handleBack = useCallback(() => {
    if (showReport) { setShowReport(false); return; }
    if (panel) { setPanel(null); showAndReset(); return; }
    navigation.goBack();
  }, [navigation, panel, showReport, showAndReset]);

  // ── Favourite toggle + toast ─────────────────────────────────────────────
  const handleToggleFavourite = useCallback(async () => {
    if (!favStreamId) return;
    const wasAdded = !isFavourited;
    await toggleFavourite({
      streamId: favStreamId,
      streamType: favStreamType,
      streamName: favStreamName,
      streamIcon: props.thumbnail,
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
  }, [favStreamId, favStreamType, favStreamName, isFavourited, toggleFavourite, props.thumbnail, showAndReset, toastAnim]);

  // ── Report submit ─────────────────────────────────────────────────────────
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
          stream_id: props.streamId ?? null,
          stream_name: props.title,
          stream_type: props.type,
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
  }, [reportReason, reportOther, activeProfile, props.streamId, props.title, props.type]);

  // ── VLC events ────────────────────────────────────────────────────────────
  // VLC's onLoad doesn't fire reliably on this lib — onPlaying is the real
  // "I have started playback" signal. Treat both the same and never trust
  // duration here: use the larger of currentTime/duration we see in onProgress.
  const onLoad = useCallback((e: any) => {
    setLoading(false);
    setError(null);
    const dur = msToSec(e?.duration);
    if (dur > 0) setDuration(dur);
    if (Array.isArray(e?.audioTracks)) setAudioTracks(e.audioTracks);
    if (Array.isArray(e?.textTracks)) setTextTracks(e.textTracks);
  }, []);

  const onPlaying = useCallback((e: any) => {
    setLoading(false);
    setError(null);
    const dur = msToSec(e?.duration);
    if (dur > 0 && !durationRef.current) setDuration(dur);

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
    // Any progress event means we're past initial load — clear the loader
    // (covers the case where onLoad/onPlaying never reliably fired).
    setLoading(false);

    // VLC always reports milliseconds. Convert.
    const t = msToSec(e?.currentTime);
    if (t >= 0) setCurrentTime(t);

    const d = msToSec(e?.duration);
    if (d > 0 && Math.abs(d - durationRef.current) > 1) setDuration(d);

    if (typeof e?.position === "number" && isFinite(e.position)) setPosition(e.position);

    // Apply resume seek once duration is known.
    if (!resumeAppliedRef.current && !isLive && props.resumeTime && props.resumeTime > 5) {
      const knownDur = d > 0 ? d : durationRef.current;
      if (knownDur > 0) {
        resumeAppliedRef.current = true;
        const frac = Math.min(0.99, props.resumeTime / knownDur);
        setSeekTarget(frac);
        setTimeout(() => setSeekTarget(undefined), 250);
      }
    }

    // ── Continue-watching save (throttled) ──
    if (isLive || !activeProfile || !props.streamId) return;
    const dur = durationRef.current;
    const cur = t > 0 ? t : currentTimeRef.current;
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
  }, [activeProfile, isLive, upsertLocal, props.streamId, props.title, props.thumbnail, props.streamUrl, props.type, props.seriesId, props.seasonNum, props.episodeNum, props.resumeTime]);

  const onError = useCallback(() => {
    setLoading(false);
    setError("Playback failed. The stream may be offline or in an unsupported format.");
  }, []);

  // The package fires onBuffering with { isBuffering: bool } — only show the
  // spinner while truly buffering, hide it the moment buffering ends.
  const onBuffering = useCallback((e: any) => {
    if (typeof e?.isBuffering === "boolean") {
      setLoading(e.isBuffering);
    } else {
      // No payload — fall back to a brief "true" but trust onProgress to clear.
      setLoading(true);
    }
  }, []);

  const onStopped = useCallback(() => {
    setLoading(false);
  }, []);

  const onPaused = useCallback(() => {
    setLoading(false);
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
    if (showReport) return;
    if (panel) { setPanel(null); showAndReset(); return; }
    if (showOverlay) {
      setShowOverlay(false);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      showAndReset();
    }
  }, [panel, showReport, showOverlay, showAndReset]);

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

  // ── Report modal node ─────────────────────────────────────────────────────
  const reportModalNode = (
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
                {props.title}
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
  );

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
          onStopped={onStopped}
          onPaused={onPaused}
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
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable style={styles.errorBtn} onPress={() => navigation.goBack()}>
              <ThemedText style={styles.errorBtnText}>Back</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.errorBtn, { backgroundColor: "rgba(255,59,59,0.18)", borderWidth: 1, borderColor: Colors.dark.error }]}
              onPress={() => setShowReport(true)}
            >
              <ThemedText style={[styles.errorBtnText, { color: Colors.dark.error }]}>Report Content</ThemedText>
            </Pressable>
          </View>
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
          {/* Report */}
          <HoverIcon
            icon="flag"
            onPress={() => { setShowReport(true); showAndReset(); }}
            iconColor={Colors.dark.error}
          />
          {/* Favourite */}
          {favStreamId > 0 ? (
            <HoverIcon
              icon="star"
              onPress={handleToggleFavourite}
              active={isFavourited}
              iconColor={isFavourited ? Colors.dark.accent : Colors.dark.text}
            />
          ) : null}
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
                <View style={[styles.seekFill, { width: `${Math.max(0, Math.min(100, Math.round(position * 100)))}%` }]} />
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

      {/* Report modal */}
      {reportModalNode}
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
  timeText: { color: "#fff", fontSize: 12, minWidth: 60 },
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

  // Toast
  toast: {
    position: "absolute",
    top: 64,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(20,20,20,0.95)",
    borderWidth: 1,
    borderColor: Colors.dark.accent,
  },
  toastText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  // Report modal
  reportBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.78)",
    justifyContent: "center", alignItems: "center", padding: Spacing.xl,
  },
  reportCard: {
    width: 400, maxWidth: "95%",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.dark.border,
    padding: Spacing.xl, gap: Spacing.md, alignItems: "center",
  },
  reportHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  reportTitle: { fontSize: 17, fontWeight: "700", color: Colors.dark.text },
  reportSubtitle: { fontSize: 12, color: Colors.dark.textSecondary, textAlign: "center", maxWidth: "90%" },
  reportReasons: { width: "100%", gap: Spacing.xs },
  reportReasonBtn: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  reportReasonBtnSelected: { borderColor: Colors.dark.error, backgroundColor: "rgba(255,59,59,0.1)" },
  reportReasonBtnHover: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  reportRadio: {
    width: 18, height: 18, borderRadius: BorderRadius.full,
    borderWidth: 2, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  reportRadioSelected: { borderColor: Colors.dark.error },
  reportRadioDot: { width: 9, height: 9, borderRadius: BorderRadius.full, backgroundColor: Colors.dark.error },
  reportReasonText: { fontSize: 14, color: Colors.dark.textSecondary, flex: 1 },
  reportReasonTextSelected: { color: Colors.dark.text, fontWeight: "600" },
  reportOtherInput: {
    width: "100%", minHeight: 70,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.dark.border,
    color: Colors.dark.text, fontSize: 14, padding: Spacing.md,
    textAlignVertical: "top",
  },
  reportBtnRow: { flexDirection: "row", gap: Spacing.sm, width: "100%", marginTop: Spacing.xs },
  reportCancelBtn: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.dark.border,
    alignItems: "center", justifyContent: "center",
  },
  reportCancelBtnHover: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  reportCancelText: { color: Colors.dark.text, fontSize: 14, fontWeight: "600" },
  reportSubmitBtn: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.error,
    alignItems: "center", justifyContent: "center",
  },
  reportSubmitBtnDisabled: { opacity: 0.5 },
  reportSubmitBtnHover: { transform: [{ scale: 1.02 }] },
  reportSubmitText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
