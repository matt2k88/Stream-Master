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
import { useVideoPlayer, VideoView } from "expo-video";
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
}: {
  item: LiveStream;
  isSelected: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const isActive = focused || isSelected;

  return (
    <Pressable
      style={[styles.channelRow, isActive && styles.channelRowActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
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

  const listRef = useRef<FlatList>(null);

  const player = useVideoPlayer(streamUrl, (p) => {
    p.muted = false;
    p.play();
  });

  // Track current stream URL so we can reload it on focus return
  const currentStreamUrlRef = useRef(streamUrl);
  const hasMountedRef = useRef(false);

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
        // Returning from full-screen — reload stream from live edge
        try {
          player.replace(currentStreamUrlRef.current);
          player.play();
        } catch {}
      }
      hasMountedRef.current = true;
      return () => {
        // Screen lost focus (navigating away) — stop streaming immediately
        try { player.pause(); } catch {}
      };
    }, [player])
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

  // Scroll sidebar to selected channel on mount
  useEffect(() => {
    if (categoryChannels.length === 0) return;
    const idx = categoryChannels.findIndex((s) => s.stream_id === selectedId);
    if (idx > 0) {
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
      }, 300);
    }
  }, []); // only on mount

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

  const handleChannelPress = useCallback((s: LiveStream) => {
    const newUrl = xtreamApi.getLiveStreamUrl(s.stream_id);
    currentStreamUrlRef.current = newUrl;
    savedChannelRef.current = null; // re-log new channel on next readyToPlay
    setSelectedId(s.stream_id);
    setSelectedName(s.name);
    setSelectedIcon(s.stream_icon ?? undefined);
    try { player.replace(newUrl); player.play(); } catch {}
  }, [player]);

  // ── Log to recently_watched on readyToPlay (per channel) ───────────────────
  useEffect(() => {
    const sub = player.addListener("statusChange", (e) => {
      if (e.status !== "readyToPlay") return;
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
    });
    return () => sub.remove();
  }, [player, activeProfile, selectedId, selectedName, selectedIcon, upsertLocal]);

  const resetFsHideTimer = useCallback(() => {
    if (fsHideTimerRef.current) clearTimeout(fsHideTimerRef.current);
    fsHideTimerRef.current = setTimeout(() => setShowFsOverlay(false), 4000);
  }, []);

  const handleFullScreen = useCallback(() => {
    setIsFullscreen(true);
    setShowFsOverlay(true);
    resetFsHideTimer();
  }, [resetFsHideTimer]);

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
                  onPress={() => handleChannelPress(item)}
                />
              )}
              showsVerticalScrollIndicator={false}
              onScrollToIndexFailed={() => {}}
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
              so the SurfaceView underneath shows through. */}
          <Pressable
            style={[StyleSheet.absoluteFill, { zIndex: 60 }]}
            onPress={handlePlayerTap}
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
                  style={({ pressed, focused }) => [
                    styles.headerBtn,
                    (pressed || focused) && styles.headerBtnActive,
                  ]}
                  onPress={() => { setShowReport(true); resetFsHideTimer(); }}
                >
                  <Feather name="flag" size={18} color={Colors.dark.text} />
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
                  {REPORT_REASONS.map((r) => (
                    <Pressable
                      key={r}
                      style={({ pressed, focused }) => [
                        styles.reportReasonBtn,
                        reportReason === r && styles.reportReasonBtnSelected,
                        (pressed || focused) && styles.reportReasonBtnHover,
                      ]}
                      onPress={() => setReportReason(r)}
                    >
                      <View style={[styles.reportRadio, reportReason === r && styles.reportRadioSelected]}>
                        {reportReason === r ? <View style={styles.reportRadioDot} /> : null}
                      </View>
                      <ThemedText style={[styles.reportReasonText, reportReason === r && styles.reportReasonTextSelected]}>
                        {r}
                      </ThemedText>
                    </Pressable>
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
                  <Pressable
                    style={({ pressed, focused }) => [styles.reportCancelBtn, (pressed || focused) && styles.reportCancelBtnHover]}
                    onPress={() => {
                      setShowReport(false);
                      setReportReason(null);
                      setReportOther("");
                    }}
                    disabled={reportSubmitting}
                  >
                    <ThemedText style={styles.reportCancelText}>Cancel</ThemedText>
                  </Pressable>
                  <Pressable
                    style={({ pressed, focused }) => [
                      styles.reportSubmitBtn,
                      (!reportReason || (reportReason === "Other" && !reportOther.trim())) && styles.reportSubmitBtnDisabled,
                      (pressed || focused) && styles.reportSubmitBtnHover,
                    ]}
                    onPress={handleSubmitReport}
                    disabled={reportSubmitting || !reportReason || (reportReason === "Other" && !reportOther.trim())}
                  >
                    {reportSubmitting
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <ThemedText style={styles.reportSubmitText}>Submit Report</ThemedText>}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ThemedView>
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
      hasTVPreferredFocus
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
