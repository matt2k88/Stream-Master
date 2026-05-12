// Dedicated Android VLC PlayerScreen — built from scratch using the raw
// VLCPlayer component directly (no shim). Used for VOD + series when the
// active profile prefers the VLC engine. Live TV and non-Android platforms
// continue to use the existing PlayerScreen.
//
// Why a dedicated screen?
//   - The expo-video-style shim hid critical libvlc state transitions
//     (Stopped on seek, paused-on-stop) which made continue-watching and
//     skip seek unreliable on Android.
//   - Talking directly to VLCPlayer lets us own the recovery flow:
//       * Issue seek as a 0..1 fraction via vlcRef.seek(frac).
//       * If libvlc transitions to Stopped during/after the seek, call
//         vlcRef.resume(true) (which the wrapper translates into native
//         play()), and re-issue the seek on the next onProgress tick once
//         the player is back in a Playing/seekable state.
//       * Override the wrapper's auto-pause-on-stopped so we never get
//         stuck on a frozen frame.

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { VLCPlayer } from "react-native-vlc-media-player";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { LinearGradient } from "expo-linear-gradient";
import { saveRecentlyWatched } from "@/components/RecentlyWatchedCard";
import { useProfile } from "@/contexts/ProfileContext";
import { useFavourites } from "@/contexts/FavouritesContext";
import { useWatchHistory } from "@/contexts/WatchHistoryContext";
import { xtreamApi, Episode } from "@/lib/xtream-api";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type PlayerRouteProp = RouteProp<RootStackParamList, "Player">;

const HIDE_DELAY = 5000;

interface Track { id: number; name: string }

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Convert library's track map { "0": "English", ... } into [{id,name}, ...]
function normaliseTracks(raw: any): Track[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((t: any) => ({
      id: typeof t.id === "number" ? t.id : parseInt(t.id, 10),
      name: t.name ?? t.title ?? String(t.id ?? "?"),
    })).filter((t) => !isNaN(t.id));
  }
  // Plain object map: { "0": "Disable", "1": "English", ... }
  const out: Track[] = [];
  for (const k of Object.keys(raw)) {
    const id = parseInt(k, 10);
    if (isNaN(id)) continue;
    out.push({ id, name: String(raw[k]) });
  }
  return out;
}

export default function VlcPlayerScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<PlayerRouteProp>();
  const {
    streamUrl, title, type, thumbnail, streamId,
    seriesId: seriesIdParam, seriesName: seriesNameParam,
    resumeTime, seasonNum, episodeNum,
  } = route.params;

  const { activeProfile } = useProfile();
  const { upsertLocal, getByStreamId } = useWatchHistory();
  const { isFavourite, toggleFavourite } = useFavourites();

  // ─── Player state ────────────────────────────────────────────────────────
  const vlcRef = useRef<any>(null);
  const [paused, setPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // seconds
  const [duration, setDuration] = useState(0); // seconds
  const [isLoading, setIsLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState("");
  const [audioTracks, setAudioTracks] = useState<Track[]>([]);
  const [textTracks, setTextTracks] = useState<Track[]>([]);
  const [activeAudio, setActiveAudio] = useState<number>(-1);
  const [activeText, setActiveText] = useState<number>(-1);

  // Refs that mirror state for use inside stable callbacks/timers
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const pausedRef = useRef(false);
  const seekableRef = useRef(false);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // Seek bookkeeping
  const pendingSeekSecondsRef = useRef<number | null>(null); // re-issue after restart
  const stoppedRecoveryRef = useRef(false);
  const lastSeekAtRef = useRef(0);
  // True from the moment seekTo() is called until onProgress confirms the
  // new position has settled. Continue-watching saves are gated on this so
  // an in-flight or rolled-back seek can never write a forward timestamp /
  // mark is_completed prematurely.
  const seekSettledTimeRef = useRef(0); // last confirmed (post-seek-window) seconds
  const seekInFlightRef = useRef(false);

  // Resume / continue-watching
  const resumeAppliedRef = useRef(false);
  const savedRef = useRef(false);
  const lastSavedRef = useRef(0);
  const completionPostedRef = useRef(false);
  const tracksRestoredRef = useRef(false);

  // ─── Favourite ────────────────────────────────────────────────────────────
  const favStreamType = type === "live" ? "live" : type === "series" ? "series" : "movies";
  const favStreamId = type === "series" && seriesIdParam
    ? parseInt(seriesIdParam, 10)
    : streamId ? parseInt(streamId, 10) : 0;
  const favStreamName = type === "series" && seriesNameParam ? seriesNameParam : title;
  const isFavourited = favStreamId > 0 ? isFavourite(favStreamId, favStreamType) : false;

  // Toast
  const toastAnim = useRef(new Animated.Value(0)).current;
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  // ─── Controls visibility ─────────────────────────────────────────────────
  const [showControls, setShowControls] = useState(true);
  const [activePanel, setActivePanel] = useState<"cc" | "audio" | null>(null);
  const activePanelRef = useRef<"cc" | "audio" | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When controls hide and re-show, the previously-focused button has been
  // pulled out of the focus tree (pointerEvents=none) and TV remote D-pad
  // navigation has nothing to land on. We bump `ctrlsKey` on every hide→show
  // transition and use it as a `key` on the centre play button so it
  // remounts and `hasTVPreferredFocus` re-fires, restoring D-pad focus.
  const [ctrlsKey, setCtrlsKey] = useState(0);
  const prevShowControlsRef = useRef(true);
  useEffect(() => { activePanelRef.current = activePanel; }, [activePanel]);
  useEffect(() => {
    if (showControls && !prevShowControlsRef.current) {
      setCtrlsKey((k) => k + 1);
    }
    prevShowControlsRef.current = showControls;
  }, [showControls]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!activePanelRef.current) setShowControls(false);
    }, HIDE_DELAY);
  }, []);
  const showAndReset = useCallback(() => {
    setShowControls(true);
    resetTimer();
  }, [resetTimer]);
  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [resetTimer]);

  // ─── Report content ──────────────────────────────────────────────────────
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportOther, setReportOther] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const REPORT_REASONS = [
    "Constant buffering", "Does not load", "Wrong language",
    "Jittery / stuttering", "Wrong content", "Other",
  ];
  const submitReport = useCallback(async () => {
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
          stream_id: streamId ?? null,
          stream_name: title,
          stream_type: type,
          reason: reportReason,
          other_text: reportReason === "Other" ? reportOther.trim() : null,
        }),
      });
      setReportDone(true);
      setTimeout(() => {
        setShowReport(false);
        setReportDone(false);
        setReportReason(null);
        setReportOther("");
      }, 1500);
    } catch {
      setShowReport(false);
    } finally {
      setReportSubmitting(false);
    }
  }, [reportReason, reportOther, activeProfile, streamId, title, type]);

  // ─── Next episode pre-fetch ──────────────────────────────────────────────
  const [nextEp, setNextEp] = useState<{ episode: Episode; season: number } | null>(null);
  const [showNext, setShowNext] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const nextPromptShownRef = useRef(false);
  const nextFiredRef = useRef(false);

  // Populated by the prefetch effect so save calls can persist
  // series_total_episodes + series_last_modified for series-wide state
  // (fully watched / new episodes) on the dashboard.
  const seriesSnapshotRef = useRef<{
    totalEpisodes?: number;
    lastModified?: string;
    finalSeason?: number;
    finalEpisode?: number;
  }>({});

  useEffect(() => {
    if (type !== "series" || !seriesIdParam || seasonNum == null || episodeNum == null) return;
    let cancelled = false;
    (async () => {
      try {
        const info = await xtreamApi.getSeriesInfo(parseInt(seriesIdParam, 10));
        if (cancelled || !info?.episodes) return;
        let total = 0;
        for (const arr of Object.values(info.episodes)) total += Array.isArray(arr) ? arr.length : 0;
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
        // Defensive re-save: the initial save may have fired before this
        // async fetch resolved, leaving the row's snapshot columns NULL.
        // Re-save now so the dashboard can flag the series WATCHED once
        // the user finishes the final episode.
        if (activeProfile && streamId) {
          saveRecentlyWatched({
            profileId: activeProfile.id,
            contentType: "series",
            streamId,
            name: title,
            thumbnailUrl: thumbnail,
            streamUrl,
            currentTime: currentTimeRef.current > 0 ? currentTimeRef.current : undefined,
            duration: durationRef.current > 0 ? durationRef.current : undefined,
            seriesId: seriesIdParam,
            seasonNum,
            episodeNum,
            seriesLastModified: seriesSnapshotRef.current.lastModified,
            seriesTotalEpisodes: seriesSnapshotRef.current.totalEpisodes,
            seriesFinalSeason: seriesSnapshotRef.current.finalSeason,
            seriesFinalEpisode: seriesSnapshotRef.current.finalEpisode,
          }).then((entry) => { if (entry) upsertLocal(entry); });
        }
        const eps = info.episodes[String(seasonNum)] || [];
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

  useEffect(() => {
    if (nextPromptShownRef.current || !nextEp) return;
    if (duration > 0 && currentTime > 0 && currentTime >= duration - 30) {
      nextPromptShownRef.current = true;
      setShowNext(true);
      setCountdown(10);
    }
  }, [currentTime, duration, nextEp]);

  const handleNextConfirm = useCallback(() => {
    if (nextFiredRef.current) return;
    if (!nextEp || !seriesIdParam) { setShowNext(false); return; }
    nextFiredRef.current = true;
    setShowNext(false);
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
  }, [nextEp, navigation, seriesIdParam, seriesNameParam, thumbnail, title]);

  useEffect(() => {
    if (!showNext) return;
    if (countdown <= 0) { handleNextConfirm(); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [showNext, countdown, handleNextConfirm]);

  // Reset everything when stream changes (navigation.replace path)
  useEffect(() => {
    savedRef.current = false;
    lastSavedRef.current = 0;
    completionPostedRef.current = false;
    resumeAppliedRef.current = false;
    nextPromptShownRef.current = false;
    nextFiredRef.current = false;
    pendingSeekSecondsRef.current = null;
    stoppedRecoveryRef.current = false;
    seekableRef.current = false;
    seekInFlightRef.current = false;
    seekSettledTimeRef.current = 0;
    lastSeekAtRef.current = 0;
    tracksRestoredRef.current = false;
    setNextEp(null);
    setShowNext(false);
    setCountdown(10);
    setCurrentTime(0);
    setDuration(0);
    setIsLoading(true);
    setError("");
  }, [streamId, streamUrl]);

  // ─── Core seek primitive ─────────────────────────────────────────────────
  // Seeks to absolute seconds. Computes a 0..1 fraction and asks libvlc.
  // If libvlc is in Stopped state (or about to be), we mark it as a pending
  // seek and let the recovery flow re-issue it after resume.
  const seekTo = useCallback((seconds: number) => {
    const dur = durationRef.current;
    if (dur <= 0 || !vlcRef.current) {
      pendingSeekSecondsRef.current = seconds;
      return;
    }
    const target = Math.max(0, Math.min(dur - 1, seconds));
    const frac = target / dur;
    lastSeekAtRef.current = Date.now();
    seekInFlightRef.current = true;
    // Optimistic UI update — onProgress will catch up after libvlc moves.
    setCurrentTime(target);
    currentTimeRef.current = target;
    try {
      vlcRef.current.seek(frac);
    } catch {
      pendingSeekSecondsRef.current = target;
    }
    // If we're paused, we still need playback to advance into the new
    // position. Resume immediately — the user pressed a skip key.
    if (pausedRef.current) {
      try { vlcRef.current.resume(true); } catch {}
      setPaused(false);
    }
  }, []);

  // Skip helpers
  const skip = useCallback((delta: number) => {
    seekTo(currentTimeRef.current + delta);
    showAndReset();
  }, [seekTo, showAndReset]);

  // Large skip acceleration (back/fwd 60s → 5m)
  const largeAccelRef = useRef<{ dir: "back" | "fwd" | null; count: number; lastTime: number }>({
    dir: null, count: 0, lastTime: 0,
  });
  const [largeStepBack, setLargeStepBack] = useState(60);
  const [largeStepFwd, setLargeStepFwd] = useState(60);
  const accelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordLargeSkip = useCallback((dir: "back" | "fwd") => {
    const now = Date.now();
    const a = largeAccelRef.current;
    if (a.dir === dir && now - a.lastTime < 1500) {
      a.count = Math.min(4, a.count + 1);
    } else {
      a.dir = dir;
      a.count = 1;
    }
    a.lastTime = now;
    const stepTable = [60, 120, 180, 300]; // 1m / 2m / 3m / 5m
    const step = stepTable[Math.min(a.count - 1, stepTable.length - 1)];
    if (dir === "back") setLargeStepBack(step); else setLargeStepFwd(step);
    if (accelTimerRef.current) clearTimeout(accelTimerRef.current);
    accelTimerRef.current = setTimeout(() => {
      largeAccelRef.current = { dir: null, count: 0, lastTime: 0 };
      setLargeStepBack(60); setLargeStepFwd(60);
    }, 2000);
    return step;
  }, []);
  const handleLargeBack = useCallback(() => {
    const step = recordLargeSkip("back");
    skip(-step);
  }, [recordLargeSkip, skip]);
  const handleLargeFwd = useCallback(() => {
    const step = recordLargeSkip("fwd");
    skip(step);
  }, [recordLargeSkip, skip]);

  // ─── VLCPlayer event handlers ────────────────────────────────────────────
  const onPlaying = useCallback((e: any) => {
    setIsLoading(false);
    setError("");
    if (typeof e?.duration === "number" && e.duration > 0) {
      setDuration(e.duration / 1000);
      durationRef.current = e.duration / 1000;
    }
    seekableRef.current = !!e?.seekable;

    // Apply continue-watching resume once
    if (!resumeAppliedRef.current && resumeTime && resumeTime > 5 && durationRef.current > 0) {
      resumeAppliedRef.current = true;
      // Defer one tick so libvlc finishes opening before we move position
      setTimeout(() => seekTo(resumeTime), 50);
    }
    // Drain any pending seek queued during Stopped recovery
    if (pendingSeekSecondsRef.current != null && durationRef.current > 0) {
      const t = pendingSeekSecondsRef.current;
      pendingSeekSecondsRef.current = null;
      setTimeout(() => seekTo(t), 50);
    }
    if (stoppedRecoveryRef.current) stoppedRecoveryRef.current = false;
    setPaused(false);
    pausedRef.current = false;

    // First successful playing event — log to recently watched. Carry the
    // previously-saved track prefs forward so the dedup-then-insert on the
    // server doesn't null them out when the user exits before the periodic
    // 10s save fires.
    if (activeProfile && !savedRef.current) {
      savedRef.current = true;
      const contentType = type === "live" ? "live" : type === "series" ? "series" : "movie";
      const prev = streamId ? getByStreamId(streamId) : undefined;
      saveRecentlyWatched({
        profileId: activeProfile.id,
        contentType,
        streamId,
        name: title,
        thumbnailUrl: thumbnail,
        streamUrl,
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
  }, [activeProfile, seekTo, resumeTime, type, streamId, title, thumbnail, streamUrl, seriesIdParam, seasonNum, episodeNum, upsertLocal, getByStreamId]);

  const onProgress = useCallback((e: any) => {
    if (typeof e?.currentTime !== "number") return;
    const cur = e.currentTime / 1000;
    const dur = typeof e.duration === "number" && e.duration > 0 ? e.duration / 1000 : durationRef.current;
    const sinceSeek = Date.now() - lastSeekAtRef.current;
    // Suppress stale 0 ticks right after a seek — libvlc occasionally emits
    // them for ~250ms while it locks onto the new keyframe. Tight 500ms
    // window keyed to the actual last seek dispatch.
    if (cur < 0.5 && sinceSeek < 500 && currentTimeRef.current > 1) {
      return;
    }
    setCurrentTime(cur);
    currentTimeRef.current = cur;
    if (dur > 0 && Math.abs(dur - durationRef.current) > 0.5) {
      setDuration(dur);
      durationRef.current = dur;
    }
    // Mark seek as settled once libvlc reports a non-zero position past the
    // brief stale-tick window. Continue-watching saves only consume time
    // through this gate so a failed seek can never persist a forward jump.
    if (seekInFlightRef.current && cur > 0.5 && sinceSeek > 400) {
      seekInFlightRef.current = false;
    }
    if (!seekInFlightRef.current) {
      seekSettledTimeRef.current = cur;
    }
  }, []);

  const onLoad = useCallback((e: any) => {
    if (typeof e?.duration === "number" && e.duration > 0) {
      setDuration(e.duration / 1000);
      durationRef.current = e.duration / 1000;
    }
    const aTracks = normaliseTracks(e?.audioTracks);
    const tTracks = normaliseTracks(e?.textTracks);
    setAudioTracks(aTracks);
    setTextTracks(tTracks);
    // Restore previously-selected tracks for this stream (only once).
    if (!tracksRestoredRef.current && streamId) {
      const prev = getByStreamId(streamId);
      if (prev) {
        if (typeof prev.audio_track === "number" && aTracks.some((t) => t.id === prev.audio_track)) {
          setActiveAudio(prev.audio_track);
        }
        if (typeof prev.text_track === "number" &&
            (prev.text_track === -1 || tTracks.some((t) => t.id === prev.text_track))) {
          setActiveText(prev.text_track);
        }
      }
      tracksRestoredRef.current = true;
    }
  }, [streamId, getByStreamId]);

  const onPaused = useCallback(() => {
    if (stoppedRecoveryRef.current) return; // ignore the auto-pause on stop
    setPaused(true);
    pausedRef.current = true;
    // ── Save-on-pause ─────────────────────────────────────────────────────
    // The throttled progress effect below only saves while currentTime
    // ticks (i.e. while playing). If the user pauses for several minutes
    // and the app crashes / closes, the resume point can be far behind
    // where they actually stopped. Persist immediately on pause so the
    // saved position is always within ~1s of reality.
    if (!activeProfile || !streamId) return;
    const cur = seekSettledTimeRef.current > 0 ? seekSettledTimeRef.current : currentTimeRef.current;
    const dur = durationRef.current;
    if (cur <= 5 || dur <= 0) return;
    if (completionPostedRef.current) return;
    if (dur - cur <= 30) return; // let the completion path handle end
    const contentType = type === "series" ? "series" : "movie";
    lastSavedRef.current = Date.now();
    saveRecentlyWatched({
      profileId: activeProfile.id, contentType, streamId, name: title,
      thumbnailUrl: thumbnail, streamUrl,
      currentTime: cur, duration: dur, isCompleted: false,
      seriesId: seriesIdParam, seasonNum, episodeNum,
      audioTrack: activeAudio, textTrack: activeText,
      seriesLastModified: seriesSnapshotRef.current.lastModified,
      seriesTotalEpisodes: seriesSnapshotRef.current.totalEpisodes,
      seriesFinalSeason: seriesSnapshotRef.current.finalSeason,
      seriesFinalEpisode: seriesSnapshotRef.current.finalEpisode,
    }).then((entry) => { if (entry) upsertLocal(entry); });
  }, [activeProfile, streamId, type, title, thumbnail, streamUrl, seriesIdParam, seasonNum, episodeNum, activeAudio, activeText, upsertLocal]);

  const onStopped = useCallback(() => {
    // The library auto-applies paused:true on stopped (via setNativeProps),
    // and libvlc also returns to the Stopped state when the user seeks past
    // the cached buffer. We only counter this when there's clear evidence
    // it was seek-related — within 3s of the last seek dispatch OR a seek
    // is still in flight. Outside that window we treat Stopped as a real
    // end-of-stream and let onEnd / next-episode handle it.
    const cur = currentTimeRef.current;
    const dur = durationRef.current;
    const sinceSeek = Date.now() - lastSeekAtRef.current;
    const isSeekRelated = seekInFlightRef.current || (lastSeekAtRef.current > 0 && sinceSeek < 3000);
    const isAtEnd = dur > 0 && cur >= dur - 2;
    if (!isSeekRelated || isAtEnd) {
      // Real end-of-stream or unrelated stop — let the natural flow run.
      return;
    }
    stoppedRecoveryRef.current = true;
    // Restart from where the user was trying to land, NOT current time
    // (which may already be the optimistic post-seek value, or 0).
    pendingSeekSecondsRef.current = cur > 1 ? cur : (resumeAppliedRef.current ? null : (resumeTime ?? null));
    setPaused(false);
    pausedRef.current = false;
    setIsLoading(true);
    // Microtask delay — give the wrapper's setNativeProps({paused:true}) a
    // moment to land before we counter it.
    setTimeout(() => {
      try { vlcRef.current?.resume(true); } catch {}
    }, 30);
  }, [resumeTime]);

  const onEnded = useCallback(() => {
    if (nextEp && !nextFiredRef.current) {
      nextPromptShownRef.current = true;
      setShowNext(true);
      setCountdown(3);
    } else {
      navigation.goBack();
    }
  }, [nextEp, navigation]);

  const onError = useCallback((_e: any) => {
    setIsLoading(false);
    setError("Playback failed");
  }, []);

  const onBuffering = useCallback((e: any) => {
    setIsBuffering(!!e?.isBuffering);
    if (e?.isBuffering) setIsLoading(true);
    else if (!error) setIsLoading(false);
  }, [error]);

  // ─── Continue-watching saves ─────────────────────────────────────────────
  // Persist ONLY the seek-settled position. `currentTime` may hold an
  // optimistic post-seek value that libvlc hasn't confirmed yet — using it
  // here would let a failed/rolled-back seek mark the entry completed or
  // jump the saved position forward. seekSettledTimeRef is the last value
  // observed via onProgress outside the seek window.
  useEffect(() => {
    if (!activeProfile || !streamId || duration <= 0) return;
    if (seekInFlightRef.current) return; // wait for libvlc to confirm
    const settled = seekSettledTimeRef.current;
    if (settled <= 0) return;
    const contentType = type === "series" ? "series" : "movie";
    const remaining = duration - settled;
    if (remaining <= 30 && !completionPostedRef.current) {
      completionPostedRef.current = true;
      saveRecentlyWatched({
        profileId: activeProfile.id, contentType, streamId, name: title,
        thumbnailUrl: thumbnail, streamUrl,
        currentTime: settled, duration, isCompleted: true,
        seriesId: seriesIdParam, seasonNum, episodeNum,
        audioTrack: activeAudio, textTrack: activeText,
        seriesLastModified: seriesSnapshotRef.current.lastModified,
        seriesTotalEpisodes: seriesSnapshotRef.current.totalEpisodes,
        seriesFinalSeason: seriesSnapshotRef.current.finalSeason,
        seriesFinalEpisode: seriesSnapshotRef.current.finalEpisode,
      }).then((entry) => { if (entry) upsertLocal(entry); });
      return;
    }
    const now = Date.now();
    if (!completionPostedRef.current && now - lastSavedRef.current >= 10000 && settled > 5) {
      lastSavedRef.current = now;
      saveRecentlyWatched({
        profileId: activeProfile.id, contentType, streamId, name: title,
        thumbnailUrl: thumbnail, streamUrl,
        currentTime: settled, duration, isCompleted: false,
        seriesId: seriesIdParam, seasonNum, episodeNum,
        audioTrack: activeAudio, textTrack: activeText,
        seriesLastModified: seriesSnapshotRef.current.lastModified,
        seriesTotalEpisodes: seriesSnapshotRef.current.totalEpisodes,
        seriesFinalSeason: seriesSnapshotRef.current.finalSeason,
        seriesFinalEpisode: seriesSnapshotRef.current.finalEpisode,
      }).then((entry) => { if (entry) upsertLocal(entry); });
    }
  }, [currentTime, duration, activeProfile, streamId, type, title, thumbnail, streamUrl, seriesIdParam, seasonNum, episodeNum, upsertLocal, activeAudio, activeText]);

  // ─── Hardware back ───────────────────────────────────────────────────────
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (activePanelRef.current) {
        setActivePanel(null);
        activePanelRef.current = null;
        showAndReset();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [showAndReset]);

  // ─── Toast for favourite ─────────────────────────────────────────────────
  const toggleFav = useCallback(async () => {
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
      Animated.delay(1500),
      Animated.timing(toastAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
    showAndReset();
  }, [favStreamId, favStreamName, favStreamType, isFavourited, toggleFavourite, thumbnail, showAndReset, toastAnim]);

  const handleBack = useCallback(() => {
    if (activePanel) { setActivePanel(null); activePanelRef.current = null; showAndReset(); return; }
    navigation.goBack();
  }, [activePanel, navigation, showAndReset]);

  const togglePlayPause = useCallback(() => {
    setPaused((p) => { pausedRef.current = !p; return !p; });
    showAndReset();
  }, [showAndReset]);

  // ─── TV remote D-pad seek (left/right) + media keys ──────────────────────
  const [seekBarFocused, setSeekBarFocused] = useState(false);
  const seekBarFocusedRef = useRef(false);
  const seekHoldRef = useRef<{ dir: string | null; start: number; lastFire: number }>({
    dir: null, start: 0, lastFire: 0,
  });
  useEffect(() => { seekBarFocusedRef.current = seekBarFocused; }, [seekBarFocused]);

  // Stable refs for the action handlers used by both the native
  // TVEventHandler subscription and the web keyboard listener — they
  // re-render less than every key event.
  const togglePlayPauseRef = useRef(togglePlayPause);
  const handleLargeBackRef = useRef(handleLargeBack);
  const handleLargeFwdRef = useRef(handleLargeFwd);
  const seekToRef = useRef(seekTo);
  const showAndResetRef = useRef(showAndReset);
  useEffect(() => { togglePlayPauseRef.current = togglePlayPause; }, [togglePlayPause]);
  useEffect(() => { handleLargeBackRef.current = handleLargeBack; }, [handleLargeBack]);
  useEffect(() => { handleLargeFwdRef.current = handleLargeFwd; }, [handleLargeFwd]);
  useEffect(() => { seekToRef.current = seekTo; }, [seekTo]);
  useEffect(() => { showAndResetRef.current = showAndReset; }, [showAndReset]);

  useEffect(() => {
    if (Platform.OS !== "android" && Platform.OS !== "ios") return;
    let tvHandler: any = null;
    try {
      const TVEventHandler = (require as any)("react-native").TVEventHandler;
      if (!TVEventHandler) return;
      tvHandler = new TVEventHandler();
      tvHandler.enable(null, (_: any, evt: { eventType: string }) => {
        const et = evt.eventType;
        // Media keys: work GLOBALLY (no focus check).
        if (et === "playPause" || et === "play" || et === "pause") {
          togglePlayPauseRef.current();
          return;
        }
        if (et === "rewind") {
          handleLargeBackRef.current();
          return;
        }
        if (et === "fastForward") {
          handleLargeFwdRef.current();
          return;
        }
        // D-pad left/right: requires seek bar focus + accelerate on hold.
        if (!seekBarFocusedRef.current) return;
        if (et !== "left" && et !== "right") return;
        const now = Date.now();
        const same = et === seekHoldRef.current.dir;
        if (!same || now - seekHoldRef.current.lastFire > 400) {
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
        seekToRef.current(currentTimeRef.current + delta);
        showAndResetRef.current();
      });
    } catch {}
    return () => { try { tvHandler?.disable(); } catch {} };
  }, []);

  // Web keyboard: media keys + Space/K (play/pause), J/L + Arrow (seek),
  // MediaRewind / MediaFastForward (fast skip).
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === " " || e.key === "Spacebar" || e.key === "k" || e.key === "K" ||
        e.key === "MediaPlayPause" || e.key === "MediaPlay" || e.key === "MediaPause"
      ) {
        e.preventDefault();
        togglePlayPauseRef.current();
        return;
      }
      if (e.key === "MediaRewind" || e.key === "MediaTrackPrevious") {
        e.preventDefault();
        handleLargeBackRef.current();
        return;
      }
      if (e.key === "MediaFastForward" || e.key === "MediaTrackNext") {
        e.preventDefault();
        handleLargeFwdRef.current();
        return;
      }
      const isLeft  = e.key === "ArrowLeft"  || e.key === "j" || e.key === "J";
      const isRight = e.key === "ArrowRight" || e.key === "l" || e.key === "L";
      if (!isLeft && !isRight) return;
      e.preventDefault();
      const delta = isLeft ? -10 : 10;
      seekToRef.current(currentTimeRef.current + delta);
      showAndResetRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ─── Source ──────────────────────────────────────────────────────────────
  // libvlc init options.
  //
  // The codec chain `mediacodec_ndk,mediacodec,all` matches what VLC's own
  // Android app uses: try the modern NDK MediaCodec first, fall back to the
  // legacy MediaCodec wrapper, then to anything else (software). This is
  // critical for 4K/HDR — hardware decoding hands frames directly to the
  // Android Surface in their native pixel format, so the OS can negotiate
  // HDR10 / Dolby Vision tone-mapping with the connected display. Pure
  // software decoding (the previous behaviour) renders to SDR Rec.709 and
  // can never engage the panel's HDR pipeline → the "bland" look on UHD
  // channels. The chained fallback means any stream HW can't handle still
  // plays via SW — nothing should regress.
  const source = useMemo(() => ({
    uri: streamUrl,
    initOptions: [
      "--http-reconnect",
      "--network-caching=1500",
      "--file-caching=1500",
      "--codec=mediacodec_ndk,mediacodec,all",
      "--avcodec-hw=mediacodec",
    ],
  }), [streamUrl]);

  // ─── Render ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <View style={styles.errorWrap}>
        <StatusBar hidden />
        <View style={styles.errorIcon}>
          <Feather name="alert-triangle" size={32} color={Colors.dark.error} />
        </View>
        <ThemedText style={styles.errorTitle}>Playback failed</ThemedText>
        <ThemedText style={styles.errorMsg}>{error}</ThemedText>
        <Pressable
          style={({ focused, pressed }) => [styles.errorBtn, (focused || pressed) && styles.errorBtnActive]}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={16} color="#fff" />
          <ThemedText style={styles.errorBtnText}>Back</ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      <Pressable style={StyleSheet.absoluteFill} onPress={showAndReset}>
        <VLCPlayer
          ref={vlcRef}
          style={StyleSheet.absoluteFill}
          source={source}
          paused={paused}
          autoplay
          autoAspectRatio
          resizeMode="contain"
          audioTrack={activeAudio >= 0 ? activeAudio : undefined}
          textTrack={activeText >= 0 ? activeText : -1}
          onPlaying={onPlaying}
          onProgress={onProgress}
          onPaused={onPaused}
          onStopped={onStopped}
          onEnd={onEnded}
          onError={onError}
          onBuffering={onBuffering}
          onLoad={onLoad}
        />
      </Pressable>

      {/* Loading spinner */}
      {(isLoading || isBuffering) && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={Colors.dark.accent} />
        </View>
      )}

      {/* Controls overlay */}
      <View style={[styles.overlay, !showControls && styles.overlayHidden]} pointerEvents={showControls ? "auto" : "none"}>
        <LinearGradient colors={["rgba(0,0,0,0.85)", "transparent"]} style={styles.topGradient} pointerEvents="none" />
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.9)"]} style={styles.bottomGradient} pointerEvents="none" />

        {/* Top bar */}
        <View style={styles.topBar}>
          <CtrlBtn icon="arrow-left" onPress={handleBack} onFocus={showAndReset} />
          <ThemedText style={styles.titleText} numberOfLines={1}>{title}</ThemedText>
          <CtrlBtn icon="flag" onPress={() => { setShowReport(true); showAndReset(); }} onFocus={showAndReset} />
          {favStreamId > 0 && (
            <CtrlBtn icon="star" onPress={toggleFav} onFocus={showAndReset} active={isFavourited} />
          )}
        </View>

        {/* Centre — play/pause + skip */}
        <View style={styles.centerRow}>
          <CtrlBtn icon="rewind" label="10s" onPress={() => skip(-10)} onFocus={showAndReset} />
          <CtrlBtn key={`play-${ctrlsKey}`} icon={paused ? "play" : "pause"} primary preferFocus onPress={togglePlayPause} onFocus={showAndReset} />
          <CtrlBtn icon="fast-forward" label="10s" onPress={() => skip(10)} onFocus={showAndReset} />
        </View>

        {/* Bottom — large skip + seek bar + tracks */}
        <View style={styles.bottomSection}>
          <View style={styles.largeSkipRow}>
            <CtrlBtn icon="chevrons-left" label={`${largeStepBack}s`} onPress={handleLargeBack} onFocus={showAndReset} />
            <View style={{ flex: 1 }} />
            <CtrlBtn icon="chevrons-right" label={`${largeStepFwd}s`} onPress={handleLargeFwd} onFocus={showAndReset} />
          </View>

          <View style={styles.progressRow}>
            <ThemedText style={styles.timeText}>{formatTime(currentTime)}</ThemedText>
            <SeekBar
              currentTime={currentTime}
              duration={duration}
              onSeek={(t) => { seekTo(t); showAndReset(); }}
              onFocusChange={setSeekBarFocused}
              onFocus={showAndReset}
            />
            <ThemedText style={styles.timeText}>{formatTime(duration)}</ThemedText>
          </View>

          <View style={styles.trackBtnRow}>
            <CtrlBtn
              icon="message-square"
              label="CC"
              onPress={() => { const v = activePanel === "cc" ? null : "cc"; setActivePanel(v); activePanelRef.current = v; showAndReset(); }}
              onFocus={showAndReset}
              active={activePanel === "cc"}
            />
            <CtrlBtn
              icon="volume-2"
              label="Audio"
              onPress={() => { const v = activePanel === "audio" ? null : "audio"; setActivePanel(v); activePanelRef.current = v; showAndReset(); }}
              onFocus={showAndReset}
              active={activePanel === "audio"}
            />
          </View>

          {activePanel === "cc" && (
            <TrackPanel
              title="Subtitles"
              tracks={textTracks}
              selectedId={activeText}
              showOff
              onSelect={(id) => { setActiveText(id); showAndReset(); }}
              onClose={() => { setActivePanel(null); activePanelRef.current = null; showAndReset(); }}
              onFocus={showAndReset}
            />
          )}
          {activePanel === "audio" && (
            <TrackPanel
              title="Audio"
              tracks={audioTracks}
              selectedId={activeAudio}
              onSelect={(id) => { setActiveAudio(id); showAndReset(); }}
              onClose={() => { setActivePanel(null); activePanelRef.current = null; showAndReset(); }}
              onFocus={showAndReset}
            />
          )}
        </View>
      </View>

      {/* Toast */}
      {toastVisible && (
        <Animated.View
          style={[styles.toast, {
            opacity: toastAnim,
            transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          }]}
          pointerEvents="none"
        >
          <Feather name="star" size={14} color={Colors.dark.accent} />
          <ThemedText style={styles.toastText}>{toastMsg}</ThemedText>
        </Animated.View>
      )}

      {/* Next episode prompt */}
      {showNext && nextEp && (
        <View style={styles.nextOverlay} pointerEvents="none">
          <View style={styles.nextCard}>
            <LinearGradient colors={["rgba(8,8,8,0.95)", "rgba(8,8,8,0.85)"]} style={StyleSheet.absoluteFill} />
            <ThemedText style={styles.nextLabel}>UP NEXT</ThemedText>
            <ThemedText style={styles.nextTitle} numberOfLines={2}>
              S{nextEp.season} • E{nextEp.episode.episode_num} — {nextEp.episode.title}
            </ThemedText>
            <View style={styles.nextCountdownRow}>
              <Feather name="clock" size={12} color={Colors.dark.accent} />
              <ThemedText style={styles.nextCountdown}>Playing in {countdown}s…</ThemedText>
            </View>
          </View>
        </View>
      )}

      {/* Report modal */}
      <Modal visible={showReport} transparent animationType="fade" onRequestClose={() => setShowReport(false)}>
        <View style={styles.reportBackdrop}>
          <View style={styles.reportCard}>
            {reportDone ? (
              <>
                <Feather name="check-circle" size={32} color={Colors.dark.accent} />
                <ThemedText style={styles.reportTitle}>Thanks — report sent</ThemedText>
              </>
            ) : (
              <>
                <View style={styles.reportHeader}>
                  <Feather name="flag" size={18} color={Colors.dark.error} />
                  <ThemedText style={styles.reportTitle}>Report content</ThemedText>
                </View>
                <ThemedText style={styles.reportSubtitle}>What's wrong with "{title}"?</ThemedText>
                <View style={styles.reportReasons}>
                  {REPORT_REASONS.map((r) => (
                    <Pressable
                      key={r}
                      style={({ focused, pressed }) => [
                        styles.reportReasonBtn,
                        reportReason === r && styles.reportReasonBtnSel,
                        (focused || pressed) && styles.reportReasonBtnHover,
                      ]}
                      onPress={() => setReportReason(r)}
                    >
                      <View style={[styles.reportRadio, reportReason === r && styles.reportRadioSel]}>
                        {reportReason === r && <View style={styles.reportRadioDot} />}
                      </View>
                      <ThemedText style={[styles.reportReasonText, reportReason === r && styles.reportReasonTextSel]}>{r}</ThemedText>
                    </Pressable>
                  ))}
                </View>
                {reportReason === "Other" && (
                  <TextInput
                    style={styles.reportOtherInput}
                    placeholder="Tell us more…"
                    placeholderTextColor={Colors.dark.textSecondary}
                    value={reportOther}
                    onChangeText={setReportOther}
                    multiline
                  />
                )}
                <View style={styles.reportBtnRow}>
                  <Pressable
                    style={({ focused, pressed }) => [styles.reportCancelBtn, (focused || pressed) && styles.reportCancelBtnHover]}
                    onPress={() => setShowReport(false)}
                  >
                    <ThemedText style={styles.reportCancelText}>Cancel</ThemedText>
                  </Pressable>
                  <Pressable
                    style={({ focused, pressed }) => [
                      styles.reportSubmitBtn,
                      (!reportReason || reportSubmitting) && styles.reportSubmitBtnDisabled,
                      (focused || pressed) && styles.reportSubmitBtnHover,
                    ]}
                    onPress={submitReport}
                    disabled={!reportReason || reportSubmitting}
                  >
                    {reportSubmitting
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <ThemedText style={styles.reportSubmitText}>Submit report</ThemedText>}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── CtrlBtn ──────────────────────────────────────────────────────────────
function CtrlBtn({
  icon, label, onPress, onFocus, active, primary, preferFocus,
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
  const hot = focused || pressed || active;
  if (primary) {
    return (
      <Pressable
        style={[btnStyles.play, hot && btnStyles.playActive]}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onFocus={() => { setFocused(true); onFocus?.(); }}
        onBlur={() => setFocused(false)}
        hasTVPreferredFocus={preferFocus}
      >
        <LinearGradient
          colors={hot ? ["rgba(255,140,26,0.55)", "rgba(255,85,0,0.55)"] : ["rgba(255,140,26,0.25)", "rgba(255,85,0,0.25)"]}
          style={StyleSheet.absoluteFill}
        />
        <Feather name={icon} size={36} color="#fff" />
      </Pressable>
    );
  }
  return (
    <Pressable
      style={[btnStyles.ctrl, hot && btnStyles.ctrlActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => { setFocused(true); onFocus?.(); }}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={preferFocus}
    >
      <Feather name={icon} size={label ? 14 : 20} color={active ? Colors.dark.accent : "#fff"} />
      {label ? <ThemedText style={[btnStyles.label, active && { color: Colors.dark.accent }]}>{label}</ThemedText> : null}
    </Pressable>
  );
}

// ─── SeekBar ──────────────────────────────────────────────────────────────
function SeekBar({
  currentTime, duration, onSeek, onFocus, onFocusChange,
}: {
  currentTime: number;
  duration: number;
  onSeek: (t: number) => void;
  onFocus?: () => void;
  onFocusChange?: (focused: boolean) => void;
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
    <Pressable
      style={btnStyles.seekWrap}
      focusable
      onFocus={() => onFocusChange?.(true)}
      onBlur={() => onFocusChange?.(false)}
    >
      <View
        style={btnStyles.seekHit}
        {...pan.panHandlers}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          barWidthRef.current = w;
          setBarWidth(w);
        }}
      >
        <View style={btnStyles.seekTrack}>
          <View style={[btnStyles.seekFill, { width: frac * barWidth }]} />
        </View>
        <View style={[btnStyles.seekThumb, { left: thumbLeft }]} pointerEvents="none" />
      </View>
    </Pressable>
  );
}

// ─── TrackPanel ───────────────────────────────────────────────────────────
function TrackPanel({
  title, tracks, selectedId, onSelect, onClose, showOff, onFocus,
}: {
  title: string;
  tracks: Track[];
  selectedId: number;
  onSelect: (id: number) => void;
  onClose: () => void;
  showOff?: boolean;
  onFocus?: () => void;
}) {
  return (
    <View style={btnStyles.panel}>
      <LinearGradient colors={["rgba(8,8,8,0.97)", "rgba(8,8,8,0.92)"]} style={StyleSheet.absoluteFill} />
      <View style={btnStyles.panelHeader}>
        <ThemedText style={btnStyles.panelTitle}>{title}</ThemedText>
        <Pressable style={({ focused, pressed }) => [btnStyles.panelClose, (focused || pressed) && btnStyles.panelCloseActive]} onPress={onClose} onFocus={onFocus}>
          <Feather name="x" size={14} color="#fff" />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={btnStyles.panelTracks} keyboardShouldPersistTaps="always">
        {showOff && (
          <Chip label="Off" selected={selectedId === -1} onPress={() => onSelect(-1)} onFocus={onFocus} preferFocus={selectedId === -1} />
        )}
        {tracks.length === 0 && (
          <View style={btnStyles.chip}><ThemedText style={btnStyles.chipText}>No tracks available</ThemedText></View>
        )}
        {tracks.map((t, idx) => (
          <Chip
            key={t.id}
            label={t.name}
            selected={selectedId === t.id}
            onPress={() => onSelect(t.id)}
            onFocus={onFocus}
            preferFocus={!showOff && idx === 0}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function Chip({ label, selected, onPress, onFocus, preferFocus }: {
  label: string; selected: boolean; onPress: () => void; onFocus?: () => void; preferFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const hot = focused || pressed;
  return (
    <Pressable
      style={[btnStyles.chip, selected && btnStyles.chipSelected, hot && btnStyles.chipFocused]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => { setFocused(true); onFocus?.(); }}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={preferFocus}
    >
      <ThemedText style={[btnStyles.chipText, selected && btnStyles.chipTextSelected]}>{label}</ThemedText>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)" },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },
  overlayHidden: { opacity: 0 },
  topGradient: { position: "absolute", top: 0, left: 0, right: 0, height: 130 },
  bottomGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: 220 },
  topBar: { flexDirection: "row", alignItems: "center", paddingTop: Spacing["2xl"], paddingHorizontal: Spacing["2xl"], gap: Spacing.md },
  titleText: { flex: 1, color: "#fff", fontSize: 15, fontWeight: "600", textAlign: "center" },
  centerRow: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: Spacing["3xl"] },
  bottomSection: { paddingHorizontal: Spacing["2xl"], paddingBottom: Spacing.xl, gap: Spacing.sm },
  largeSkipRow: { flexDirection: "row", alignItems: "center" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  timeText: { color: "rgba(255,255,255,0.8)", fontSize: 12, minWidth: 44 },
  trackBtnRow: { flexDirection: "row", gap: Spacing.md, justifyContent: "center" },
  toast: {
    position: "absolute", bottom: 80, alignSelf: "center", flexDirection: "row", alignItems: "center",
    gap: Spacing.sm, backgroundColor: "rgba(8,8,8,0.93)", borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.dark.accent,
  },
  toastText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  nextOverlay: { position: "absolute", right: Spacing.lg, bottom: Spacing.lg, maxWidth: 380 },
  nextCard: {
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: "rgba(255,102,0,0.4)",
    padding: Spacing.md, overflow: "hidden", gap: Spacing.xs,
  },
  nextLabel: { color: Colors.dark.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  nextTitle: { color: Colors.dark.text, fontSize: 14, fontWeight: "700", lineHeight: 18 },
  nextCountdownRow: { flexDirection: "row", alignItems: "center", gap: Spacing.xs, marginTop: Spacing.xs },
  nextCountdown: { color: Colors.dark.accent, fontSize: 13, fontWeight: "700" },

  errorWrap: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.dark.backgroundRoot, padding: Spacing["3xl"], gap: Spacing.md },
  errorIcon: { width: 70, height: 70, borderRadius: 35, borderWidth: 2, borderColor: "rgba(255,59,59,0.4)", justifyContent: "center", alignItems: "center", backgroundColor: "rgba(255,59,59,0.08)" },
  errorTitle: { fontSize: 20, fontWeight: "700", color: Colors.dark.text },
  errorMsg: { color: Colors.dark.textSecondary, textAlign: "center", fontSize: 13 },
  errorBtn: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.sm, backgroundColor: "rgba(255,255,255,0.1)" },
  errorBtnActive: { backgroundColor: Colors.dark.accent },
  errorBtnText: { color: "#fff", fontWeight: "700" },

  reportBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.78)", justifyContent: "center", alignItems: "center", padding: Spacing.xl },
  reportCard: { width: 400, maxWidth: "95%", backgroundColor: Colors.dark.backgroundDefault, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.dark.border, padding: Spacing.xl, gap: Spacing.md, alignItems: "center" },
  reportHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  reportTitle: { fontSize: 17, fontWeight: "700", color: Colors.dark.text },
  reportSubtitle: { fontSize: 12, color: Colors.dark.textSecondary, textAlign: "center" },
  reportReasons: { width: "100%", gap: Spacing.xs },
  reportReasonBtn: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.dark.border, backgroundColor: Colors.dark.backgroundSecondary },
  reportReasonBtnSel: { borderColor: Colors.dark.error, backgroundColor: "rgba(255,59,59,0.1)" },
  reportReasonBtnHover: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  reportRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.dark.border, justifyContent: "center", alignItems: "center" },
  reportRadioSel: { borderColor: Colors.dark.error },
  reportRadioDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: Colors.dark.error },
  reportReasonText: { fontSize: 14, color: Colors.dark.textSecondary, flex: 1 },
  reportReasonTextSel: { color: Colors.dark.text, fontWeight: "600" },
  reportOtherInput: { width: "100%", minHeight: 70, backgroundColor: Colors.dark.backgroundSecondary, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.dark.border, color: Colors.dark.text, fontSize: 14, padding: Spacing.md, textAlignVertical: "top" },
  reportBtnRow: { flexDirection: "row", gap: Spacing.sm, width: "100%", marginTop: Spacing.xs },
  reportCancelBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.dark.border, alignItems: "center", justifyContent: "center" },
  reportCancelBtnHover: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  reportCancelText: { color: Colors.dark.textSecondary, fontWeight: "600", fontSize: 14 },
  reportSubmitBtn: { flex: 2, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm, backgroundColor: Colors.dark.error, alignItems: "center", justifyContent: "center", minHeight: 42 },
  reportSubmitBtnDisabled: { opacity: 0.4 },
  reportSubmitBtnHover: { backgroundColor: "#ff5555" },
  reportSubmitText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});

const btnStyles = StyleSheet.create({
  ctrl: { minWidth: 52, height: 52, paddingHorizontal: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center", gap: 2 },
  ctrlActive: {
    backgroundColor: "rgba(255,102,0,0.45)",
    borderColor: Colors.dark.accent,
    borderWidth: 2,
    transform: [{ scale: 1.08 }],
    shadowColor: Colors.dark.accent,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  label: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "600" },

  play: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 2, borderColor: "rgba(255,102,0,0.5)", justifyContent: "center", alignItems: "center", overflow: "hidden" },
  playActive: {
    borderColor: Colors.dark.accent,
    borderWidth: 3,
    transform: [{ scale: 1.06 }],
    shadowColor: Colors.dark.accent,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },

  seekWrap: { flex: 1, paddingVertical: 6 },
  seekHit: { height: 28, justifyContent: "center" },
  seekTrack: { height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.22)", overflow: "hidden" },
  seekFill: { height: "100%", backgroundColor: Colors.dark.accent, borderRadius: 2 },
  seekThumb: { position: "absolute", width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.dark.accent, top: 8 },

  panel: { borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: "rgba(255,102,0,0.25)", overflow: "hidden", paddingVertical: Spacing.sm, marginTop: Spacing.sm },
  panelHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  panelTitle: { flex: 1, color: Colors.dark.accent, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  panelClose: { width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "transparent" },
  panelCloseActive: {
    backgroundColor: "rgba(255,102,0,0.5)",
    borderWidth: 2,
    borderColor: Colors.dark.accent,
    transform: [{ scale: 1.12 }],
    shadowColor: Colors.dark.accent,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  panelTracks: { flexDirection: "row", gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  chipSelected: { backgroundColor: Colors.dark.accentDim, borderColor: Colors.dark.accent },
  chipFocused: {
    backgroundColor: "rgba(255,102,0,0.45)",
    borderColor: Colors.dark.accent,
    borderWidth: 2,
    transform: [{ scale: 1.08 }],
    shadowColor: Colors.dark.accent,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  chipText: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "500" },
  chipTextSelected: { color: Colors.dark.accent, fontWeight: "700" },
});
