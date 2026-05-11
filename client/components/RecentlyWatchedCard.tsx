import React, { useState } from "react";
import { View, StyleSheet, Pressable, Image } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import { getApiUrl } from "@/lib/query-client";
import { useWatchHistory } from "@/contexts/WatchHistoryContext";
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
}

interface Props {
  style?: any;
  onPress?: (item: RecentlyWatched) => void;
  refreshKey?: number;
  maxItems?: number;
  onLayout?: (e: any) => void;
  /**
   * When provided, render N labelled sections inside one card box.
   * Each section has its own header + filtered items.
   * When omitted, falls back to legacy single-section "Previously Watched".
   */
  sections?: WatchSectionConfig[];
}

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
        isActive && { backgroundColor: accent.withAlpha(accent.accent, 0.08) },
      ]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {isActive ? (
        <LinearGradient
          colors={[accent.withAlpha(accent.accent, 0.12), accent.withAlpha(accent.accent, 0.04)]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}

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
        {item.content_type === "live" ? (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <ThemedText style={styles.liveText}>LIVE</ThemedText>
          </View>
        ) : null}
        {item.content_type !== "live" && item.duration && item.duration > 0 && !item.is_completed ? (
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: accent.accent },
                { width: `${Math.max(2, Math.min(100, ((item.current_time ?? 0) / item.duration) * 100))}%` },
              ]}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.infoCol}>
        <View style={[styles.typePill, { backgroundColor: accent.accentDim }]}>
          <Feather
            name={TYPE_ICON[item.content_type] ?? "play"}
            size={9}
            color={accent.accent}
          />
          <ThemedText style={[styles.typeText, { color: accent.accent }]}>
            {TYPE_LABEL[item.content_type] ?? item.content_type}
          </ThemedText>
        </View>
        <ThemedText style={styles.contentName} numberOfLines={1}>
          {item.name}
        </ThemedText>
      </View>

      <View
        style={[
          styles.playIcon,
          isActive && { borderColor: accent.accent, backgroundColor: accent.accentDim },
        ]}
      >
        <Feather
          name="play"
          size={12}
          color={isActive ? accent.accent : Colors.dark.textSecondary}
        />
      </View>

      {isActive ? <View style={[styles.activeBar, { backgroundColor: accent.accent }]} /> : null}
    </Pressable>
  );
}

function dedupe(entries: RecentlyWatched[]): RecentlyWatched[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = e.stream_id != null ? String(e.stream_id) : `__id_${e.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function WatchSection({
  cfg,
  entries,
  onPress,
  defaultMax,
  isLoading,
  accentColor,
}: {
  cfg: WatchSectionConfig;
  entries: RecentlyWatched[];
  onPress?: (item: RecentlyWatched) => void;
  defaultMax?: number;
  isLoading: boolean;
  accentColor: string;
}) {
  const filtered = dedupe(entries.filter(cfg.filter));
  const max = cfg.maxItems ?? defaultMax;
  const items = max ? filtered.slice(0, max) : filtered;
  const isEmpty = items.length === 0;

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
        <View style={styles.itemsList}>
          {items.map((item, index) => (
            <React.Fragment key={item.id}>
              {index > 0 ? <View style={styles.separator} /> : null}
              <RecentlyWatchedRow item={item} onPress={() => onPress?.(item)} />
            </React.Fragment>
          ))}
          {items.length === 1 && (max ?? 0) > 1 ? (
            <View style={[styles.separator, { opacity: 0 }]} />
          ) : null}
        </View>
      )}
    </View>
  );
}

export default function RecentlyWatchedCard({ style, onPress, refreshKey, maxItems, onLayout, sections }: Props) {
  const { entries, isLoading: isCtxLoading, refetch } = useWatchHistory();
  const accent = useAccent();

  // Trigger refetch when external `refreshKey` changes (HomeScreen focus)
  React.useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const isLoading = isCtxLoading && entries.length === 0;

  // Multi-section mode
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
        <View style={styles.itemsList}>
          {(displayItems ?? []).map((item, index) => (
            <React.Fragment key={item.id}>
              {index > 0 ? <View style={styles.separator} /> : null}
              <RecentlyWatchedRow
                item={item}
                onPress={() => onPress?.(item)}
              />
            </React.Fragment>
          ))}
          {displayItems && displayItems.length === 1 ? (
            <View style={[styles.separator, { opacity: 0 }]} />
          ) : null}
        </View>
      )}
    </View>
  );
}

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
}): Promise<RecentlyWatched | null> {
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
      }),
    });
    const data = await res.json();
    return data ?? null;
  } catch {
    return null;
  }
}

export async function fetchResumeFor(profileId: string, streamId: string): Promise<RecentlyWatched | null> {
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

  itemsList: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  separator: {
    width: 1,
    backgroundColor: Colors.dark.border,
  },

  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderRadius: BorderRadius.sm,
    paddingVertical: 4,
    paddingHorizontal: 4,
    overflow: "hidden",
    minWidth: 0,
  },

  thumbWrap: {
    width: 52,
    height: 34,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    backgroundColor: Colors.dark.backgroundSecondary,
    flexShrink: 0,
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
    bottom: 2,
    left: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(220,30,30,0.85)",
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  liveDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: "#fff" },
  liveText: { color: "#fff", fontSize: 7, fontWeight: "800", letterSpacing: 0.4 },
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
    flex: 1,
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
});
