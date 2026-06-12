import React, { useState, useRef, useEffect } from "react";
import { View, StyleSheet, Pressable, Image, ScrollView, Animated } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import { getApiUrl } from "@/lib/query-client";
import { useWatchHistory } from "@/contexts/WatchHistoryContext";
import { GUEST_PROFILE_ID } from "@/contexts/ProfileContext";
import { useAccent } from "@/contexts/ThemeContext";

export interface RecentlyWatched {
  id: string;
  profile_id: string;
  content_type: "live" | "movie" | "series";
  stream_id: string | null;
  name: string;
  thumbnail_url: string | null;
  stream_url: string | null;
  updated_at: string;
  current_time?: number | null;
  duration?: number | null;
  is_completed?: boolean | null;
  series_id?: string | null;
  season_num?: number | null;
  episode_num?: number | null;
  audio_track?: number | null;
  text_track?: number | null;
  series_last_modified?: string | null;
  series_total_episodes?: number | null;
  series_final_season?: number | null;
  series_final_episode?: number | null;
}

const TYPE_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  live: "tv",
  movie: "film",
  series: "grid",
};

const TYPE_LABEL: Record<string, string> = {
  live: "Live TV",
  movie: "Movie",
  series: "Series",
};

export interface WatchSectionConfig {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  filter: (e: RecentlyWatched) => boolean;
  emptyText?: string;
  maxItems?: number;
  variant?: "recently-watched" | "continue-watching";
}

interface Props {
  style?: any;
  onPress?: (item: RecentlyWatched) => void;
  onInfoPress?: (item: RecentlyWatched) => void;
  refreshKey?: number;
  maxItems?: number;
  onLayout?: (e: any) => void;
  sections?: WatchSectionConfig[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatRemaining(current: number | null | undefined, duration: number | null | undefined): string | null {
  if (!duration || duration <= 0) return null;
  const cur = current ?? 0;
  const rem = Math.max(0, duration - cur);
  const totalMins = Math.floor(rem / 60);
  if (totalMins <= 0) return null;
  if (totalMins < 60) return `${totalMins}m left`;
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hrs}h ${mins}m left` : `${hrs}h left`;
}

function formatEpisodeLabel(item: RecentlyWatched): string | null {
  if (item.content_type !== "series") return null;
  if (!item.season_num && !item.episode_num) return null;
  const parts: string[] = [];
  if (item.season_num) parts.push(`S${item.season_num}`);
  if (item.episode_num) parts.push(`E${item.episode_num}`);
  return parts.join(" ");
}

// ── Recently Watched row (compact, for live TV) ────────────────────────────

function RecentlyWatchedRow({
  item,
  onPress,
}: {
  item: RecentlyWatched;
  onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const isActive = pressed || focused;
  const accent = useAccent();

  return (
    <Pressable
      style={[
        styles.row,
        isActive && { borderColor: accent.withAlpha(accent.accent, 0.55) },
      ]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {/* Thumbnail fills top of card */}
      <View style={styles.thumbWrap}>
        {item.thumbnail_url ? (
          <Image
            source={{ uri: item.thumbnail_url }}
            style={styles.thumb}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.thumbFallback}>
            <Feather
              name={TYPE_ICON[item.content_type] ?? "play"}
              size={18}
              color={Colors.dark.textSecondary}
            />
          </View>
        )}

        {/* Active tint overlay */}
        {isActive ? (
          <LinearGradient
            colors={[accent.withAlpha(accent.accent, 0.18), "transparent"]}
            style={StyleSheet.absoluteFill}
          />
        ) : null}

        {/* LIVE badge */}
        {item.content_type === "live" ? (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <ThemedText style={styles.liveText}>LIVE</ThemedText>
          </View>
        ) : null}

        {/* Progress bar */}
        {item.content_type !== "live" && item.duration && item.duration > 0 && !item.is_completed ? (
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: accent.accent },
                { width: `${Math.max(2, Math.min(100, ((item.current_time ?? 0) / item.duration) * 100))}%` as any },
              ]}
            />
          </View>
        ) : null}
      </View>

      {/* Info strip below thumbnail */}
      <View style={styles.infoCol}>
        <View style={[styles.typePill, { backgroundColor: accent.accentDim }]}>
          <Feather name={TYPE_ICON[item.content_type] ?? "play"} size={9} color={accent.accent} />
          <ThemedText style={[styles.typeText, { color: accent.accent }]}>
            {TYPE_LABEL[item.content_type] ?? item.content_type}
          </ThemedText>
        </View>
        <ThemedText style={styles.contentName} numberOfLines={1}>
          {item.name}
        </ThemedText>
      </View>

      {/* Left accent bar when active */}
      {isActive ? <View style={[styles.activeBar, { backgroundColor: accent.accent }]} /> : null}
    </Pressable>
  );
}

// ── Continue Watching card (expandable on hover — buttons slide in on right) ─

const CW_CARD_W = 148;           // slightly narrower, fits portrait posters better
const CW_CARD_EXPANDED_W = 310;
const CW_CARD_H = 188;           // full card height (no info strip below — text overlaid)
const CW_THUMB_H = CW_CARD_H;   // alias kept for panel height
const CW_PANEL_W = CW_CARD_EXPANDED_W - CW_CARD_W;

function ContinueWatchingCard({
  item,
  onPress,
  onInfoPress,
}: {
  item: RecentlyWatched;
  onPress: () => void;
  onInfoPress?: () => void;
}) {
  const [outerFocused, setOuterFocused] = useState(false);
  const [outerHovered, setOuterHovered] = useState(false);
  const [resumeFocused, setResumeFocused] = useState(false);
  const [resumeHovered, setResumeHovered] = useState(false);
  const [infoFocused, setInfoFocused] = useState(false);
  const [infoHovered, setInfoHovered] = useState(false);

  const accent = useAccent();

  // Card is "active" as long as ANY part of it holds focus/hover
  const isActive =
    outerFocused || outerHovered ||
    resumeFocused || resumeHovered ||
    infoFocused || infoHovered;

  const cardWidth = useRef(new Animated.Value(CW_CARD_W)).current;
  const panelOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardWidth, {
        toValue: isActive ? CW_CARD_EXPANDED_W : CW_CARD_W,
        duration: 180,
        useNativeDriver: false,
      }),
      Animated.timing(panelOpacity, {
        toValue: isActive ? 1 : 0,
        duration: isActive ? 200 : 120,
        useNativeDriver: false,
      }),
    ]).start();
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const remaining = formatRemaining(item.current_time, item.duration);
  const episodeLabel = formatEpisodeLabel(item);
  const progressPct =
    item.duration && item.duration > 0
      ? Math.max(2, Math.min(100, ((item.current_time ?? 0) / item.duration) * 100))
      : 0;
  const metaParts = [episodeLabel, remaining].filter(Boolean);

  return (
    <Animated.View
      style={[
        styles.cwCard,
        { width: cardWidth },
        isActive && { borderColor: accent.withAlpha(accent.accent, 0.6) },
      ]}
    >
      {/* Main press target — tapping the card resumes */}
      <Pressable
        style={styles.cwCardPressable}
        onPress={onPress}
        onFocus={() => setOuterFocused(true)}
        onBlur={() => setOuterFocused(false)}
        onHoverIn={() => setOuterHovered(true)}
        onHoverOut={() => setOuterHovered(false)}
      >
        {/* ── Row: full-bleed thumbnail (left) + slide-in action panel (right) ── */}
        <View style={styles.cwThumbRow}>

          {/* ── Left: full-bleed image column ── */}
          <View style={styles.cwThumbArea}>
            {item.thumbnail_url ? (
              <Image
                source={{ uri: item.thumbnail_url }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.cwThumbFallback}>
                <Feather name={TYPE_ICON[item.content_type] ?? "play"} size={26} color={Colors.dark.textSecondary} />
              </View>
            )}

            {/* Gradient: transparent at top → black at bottom so text is readable */}
            <LinearGradient
              colors={["transparent", "transparent", "rgba(0,0,0,0.82)", "#000"]}
              locations={[0, 0.42, 0.72, 1.0]}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />

            {/* Type badge — top-left */}
            <View style={styles.cwTypeBadge}>
              <Feather name={TYPE_ICON[item.content_type] ?? "play"} size={8} color={accent.accent} />
              <ThemedText style={[styles.cwTypeText, { color: accent.accent }]}>
                {TYPE_LABEL[item.content_type] ?? item.content_type}
              </ThemedText>
            </View>

            {/* Title + meta — overlaid on gradient at the bottom */}
            <View style={[styles.cwInfo, progressPct > 0 && styles.cwInfoWithProgress]}>
              <ThemedText style={styles.cwTitle} numberOfLines={2}>{item.name}</ThemedText>
              {metaParts.length > 0 ? (
                <ThemedText style={styles.cwMeta} numberOfLines={1}>
                  {metaParts.join("  ·  ")}
                </ThemedText>
              ) : null}
            </View>

            {/* Progress bar — absolute bottom */}
            {progressPct > 0 ? (
              <View style={styles.cwProgressTrack}>
                <View style={[styles.cwProgressFill, { backgroundColor: accent.accent, width: `${progressPct}%` as any }]} />
              </View>
            ) : null}
          </View>

          {/* ── Right: action panel slides in on hover/focus ── */}
          <Animated.View style={[styles.cwPanel, { opacity: panelOpacity }]}>
            {/* Resume button */}
            <Pressable
              focusable
              style={[
                styles.cwPanelBtn,
                styles.cwPanelResumeBtn,
                { backgroundColor: accent.accent },
                (resumeFocused || resumeHovered) && styles.cwPanelBtnActive,
              ]}
              onPress={onPress}
              onFocus={() => setResumeFocused(true)}
              onBlur={() => setResumeFocused(false)}
              onHoverIn={() => setResumeHovered(true)}
              onHoverOut={() => setResumeHovered(false)}
            >
              <View style={[styles.cwPanelBtnIcon, (resumeFocused || resumeHovered) && { backgroundColor: "rgba(255,255,255,0.25)" }]}>
                <Feather name="play" size={13} color="#fff" />
              </View>
              <ThemedText style={styles.cwPanelBtnLabel}>Resume</ThemedText>
            </Pressable>

            {/* Info button */}
            {onInfoPress ? (
              <Pressable
                focusable
                style={[
                  styles.cwPanelBtn,
                  styles.cwPanelInfoBtn,
                  (infoFocused || infoHovered) && styles.cwPanelBtnActive,
                  (infoFocused || infoHovered) && { borderColor: accent.accent },
                ]}
                onPress={onInfoPress}
                onFocus={() => setInfoFocused(true)}
                onBlur={() => setInfoFocused(false)}
                onHoverIn={() => setInfoHovered(true)}
                onHoverOut={() => setInfoHovered(false)}
              >
                <View style={[styles.cwPanelBtnIcon, (infoFocused || infoHovered) && { backgroundColor: accent.withAlpha(accent.accent, 0.15) }]}>
                  <Feather name="info" size={13} color={infoFocused || infoHovered ? accent.accent : Colors.dark.textSecondary} />
                </View>
                <ThemedText style={[styles.cwPanelBtnLabel, { color: infoFocused || infoHovered ? accent.accent : Colors.dark.textSecondary }]}>
                  Details
                </ThemedText>
              </Pressable>
            ) : null}
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── Deduplication ──────────────────────────────────────────────────────────

function dedupe(entries: RecentlyWatched[]): RecentlyWatched[] {
  const seenStream = new Set<string>();
  const seenSeries = new Set<string>();
  const out: RecentlyWatched[] = [];
  for (const e of entries) {
    if (e.content_type === "series" && e.series_id != null) {
      const k = String(e.series_id);
      if (seenSeries.has(k)) continue;
      seenSeries.add(k);
      out.push(e);
      continue;
    }
    const key = e.stream_id != null ? String(e.stream_id) : `__id_${e.id}`;
    if (seenStream.has(key)) continue;
    seenStream.add(key);
    out.push(e);
  }
  return out;
}

// ── Section renderer ───────────────────────────────────────────────────────

function WatchSection({
  cfg,
  entries,
  onPress,
  onInfoPress,
  defaultMax,
  isLoading,
  accentColor,
}: {
  cfg: WatchSectionConfig;
  entries: RecentlyWatched[];
  onPress?: (item: RecentlyWatched) => void;
  onInfoPress?: (item: RecentlyWatched) => void;
  defaultMax?: number;
  isLoading: boolean;
  accentColor: string;
}) {
  const filtered = dedupe(entries.filter(cfg.filter));
  const max = cfg.maxItems ?? defaultMax;
  const items = max ? filtered.slice(0, max) : filtered;
  const isEmpty = items.length === 0;
  const isContinue = cfg.variant === "continue-watching";

  return (
    <View style={styles.sectionWrap}>
      <View style={styles.labelRow}>
        <Feather name={cfg.icon} size={11} color={accentColor} />
        <ThemedText style={[styles.sectionLabel, { color: accentColor }]}>{cfg.label}</ThemedText>
      </View>

      {isLoading ? (
        <View style={styles.emptyBody}>
          <ThemedText style={styles.emptyText}>Loading...</ThemedText>
        </View>
      ) : isEmpty ? (
        <View style={styles.emptyBody}>
          <View style={styles.emptyIconRing}>
            <Feather name="play-circle" size={20} color={Colors.dark.textSecondary} />
          </View>
          <ThemedText style={styles.emptyText}>{cfg.emptyText ?? "Nothing yet"}</ThemedText>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={isContinue ? styles.cwItemsList : styles.itemsList}
        >
          {items.map((item) =>
            isContinue ? (
              <ContinueWatchingCard
                key={item.id}
                item={item}
                onPress={() => onPress?.(item)}
                onInfoPress={onInfoPress ? () => onInfoPress(item) : undefined}
              />
            ) : (
              <RecentlyWatchedRow key={item.id} item={item} onPress={() => onPress?.(item)} />
            )
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function RecentlyWatchedCard({ style, onPress, onInfoPress, refreshKey, maxItems, onLayout, sections }: Props) {
  const { entries, isLoading: isCtxLoading, refetch } = useWatchHistory();
  const accent = useAccent();

  React.useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const isLoading = isCtxLoading && entries.length === 0;

  if (sections && sections.length > 0) {
    return (
      <View style={[styles.card, style]} onLayout={onLayout}>
        {sections.map((cfg, i) => (
          <React.Fragment key={`${cfg.label}-${i}`}>
            {i > 0 ? <View style={styles.sectionDivider} /> : null}
            <WatchSection
              cfg={cfg}
              entries={entries}
              onPress={onPress}
              onInfoPress={onInfoPress}
              defaultMax={maxItems}
              isLoading={isLoading}
              accentColor={accent.accent}
            />
          </React.Fragment>
        ))}
      </View>
    );
  }

  // Legacy single-section mode
  const dedupedEntries = dedupe(entries);
  const displayItems = maxItems ? dedupedEntries.slice(0, maxItems) : dedupedEntries;
  const isEmpty = displayItems.length === 0;

  return (
    <View style={[styles.card, style]} onLayout={onLayout}>
      <View style={styles.labelRow}>
        <Feather name="clock" size={11} color={accent.accent} />
        <ThemedText style={[styles.sectionLabel, { color: accent.accent }]}>Previously Watched</ThemedText>
      </View>

      {isLoading ? (
        <View style={styles.emptyBody}>
          <ThemedText style={styles.emptyText}>Loading...</ThemedText>
        </View>
      ) : isEmpty ? (
        <View style={styles.emptyBody}>
          <View style={styles.emptyIconRing}>
            <Feather name="play-circle" size={20} color={Colors.dark.textSecondary} />
          </View>
          <ThemedText style={styles.emptyText}>Start watching something</ThemedText>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.itemsList}
        >
          {(displayItems ?? []).map((item) => (
            <RecentlyWatchedRow key={item.id} item={item} onPress={() => onPress?.(item)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── Async helpers (unchanged) ──────────────────────────────────────────────

export async function saveRecentlyWatched(params: {
  profileId: string;
  contentType: "live" | "movie" | "series";
  streamId?: string;
  name: string;
  thumbnailUrl?: string;
  streamUrl?: string;
  currentTime?: number;
  duration?: number;
  isCompleted?: boolean;
  seriesId?: string;
  seasonNum?: number;
  episodeNum?: number;
  audioTrack?: number;
  textTrack?: number;
  seriesLastModified?: string;
  seriesTotalEpisodes?: number;
  seriesFinalSeason?: number;
  seriesFinalEpisode?: number;
}): Promise<RecentlyWatched | null> {
  if (params.profileId === GUEST_PROFILE_ID) return null;
  try {
    const url = new URL("/api/recently-watched", getApiUrl());
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile_id: params.profileId,
        content_type: params.contentType,
        stream_id: params.streamId ?? null,
        name: params.name,
        thumbnail_url: params.thumbnailUrl ?? null,
        stream_url: params.streamUrl ?? null,
        current_time: typeof params.currentTime === "number" ? params.currentTime : undefined,
        duration: typeof params.duration === "number" ? params.duration : undefined,
        is_completed: typeof params.isCompleted === "boolean" ? params.isCompleted : undefined,
        series_id: params.seriesId ?? undefined,
        season_num: typeof params.seasonNum === "number" ? params.seasonNum : undefined,
        episode_num: typeof params.episodeNum === "number" ? params.episodeNum : undefined,
        audio_track: typeof params.audioTrack === "number" ? params.audioTrack : undefined,
        text_track: typeof params.textTrack === "number" ? params.textTrack : undefined,
        series_last_modified: typeof params.seriesLastModified === "string" ? params.seriesLastModified : undefined,
        series_total_episodes: typeof params.seriesTotalEpisodes === "number" ? params.seriesTotalEpisodes : undefined,
        series_final_season: typeof params.seriesFinalSeason === "number" ? params.seriesFinalSeason : undefined,
        series_final_episode: typeof params.seriesFinalEpisode === "number" ? params.seriesFinalEpisode : undefined,
      }),
    });
    const data = await res.json();
    return data ?? null;
  } catch {
    return null;
  }
}

export async function fetchResumeFor(profileId: string, streamId: string): Promise<RecentlyWatched | null> {
  if (profileId === GUEST_PROFILE_ID) return null;
  try {
    const url = new URL("/api/recently-watched/by-stream", getApiUrl());
    url.searchParams.set("profile_id", profileId);
    url.searchParams.set("stream_id", streamId);
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    return data ?? null;
  } catch {
    return null;
  }
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
    padding: Spacing.sm,
    gap: Spacing.xs,
  },

  sectionWrap: {
    gap: Spacing.xs,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: Spacing.xs,
    opacity: 0.6,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  emptyBody: {
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    flexDirection: "row",
  },
  emptyIconRing: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
  },

  // Recently Watched row styles (live TV - vertical cards, same width as CW cards)
  itemsList: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingRight: Spacing.xs,
    paddingBottom: 2,
  },
  row: {
    width: CW_CARD_W,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundDefault,
    overflow: "hidden",
  },
  thumbWrap: {
    width: "100%",
    height: 84,
    backgroundColor: Colors.dark.backgroundSecondary,
    overflow: "hidden",
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  thumbFallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  liveBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(200,20,20,0.88)",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  liveDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#fff" },
  liveText: { color: "#fff", fontSize: 7, fontWeight: "800", letterSpacing: 0.5 },
  progressTrack: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  progressFill: {
    height: "100%",
  },
  infoCol: {
    paddingHorizontal: Spacing.xs,
    paddingTop: 5,
    paddingBottom: 6,
    gap: 2,
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    alignSelf: "flex-start",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  typeText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  contentName: {
    color: Colors.dark.text,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14,
  },
  playIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  activeBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    borderRadius: 1,
  },

  // Continue Watching card styles
  cwItemsList: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingRight: Spacing.xs,
    paddingBottom: 2,
  },
  cwCard: {
    // width is controlled by Animated.Value (CW_CARD_W → CW_CARD_EXPANDED_W)
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundDefault,
    overflow: "hidden",
  },
  cwCardPressable: {
    flex: 1,
  },
  // Top row: thumbnail on left, action panel slides in on right
  cwThumbRow: {
    flexDirection: "row",
    height: CW_THUMB_H,
  },
  cwThumbArea: {
    width: CW_CARD_W,
    height: CW_CARD_H,
    backgroundColor: Colors.dark.backgroundSecondary,
    flexShrink: 0,
    overflow: "hidden",
  },
  cwThumbFallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  cwTypeBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(0,0,0,0.78)",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  cwTypeText: {
    fontSize: 7,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  cwProgressTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  cwProgressFill: {
    height: "100%",
  },

  // Action panel — slides in to the right of the thumbnail
  cwPanel: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "stretch",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  cwPanelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 6,
    borderColor: "rgba(255,255,255,0.12)",
  },
  cwPanelResumeBtn: {
    // background colour set inline via accent
  },
  cwPanelInfoBtn: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  cwPanelBtnActive: {
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  cwPanelBtnIcon: {
    width: 26,
    height: 26,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(255,255,255,0.12)",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  cwPanelBtnLabel: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    flex: 1,
  },

  // Title + meta — absolute overlay at the bottom of the image
  cwInfo: {
    position: "absolute",
    bottom: 6,
    left: 6,
    right: 6,
    gap: 2,
  },
  cwInfoWithProgress: {
    bottom: 10,   // lift above the 3px progress bar + a little breathing room
  },
  cwTitle: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 14,
  },
  cwMeta: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 9,
    fontWeight: "500",
    lineHeight: 13,
  },
});
