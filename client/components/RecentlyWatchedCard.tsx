import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, Pressable, Image } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import { getApiUrl } from "@/lib/query-client";
import { useProfile } from "@/contexts/ProfileContext";

export interface RecentlyWatched {
  id: string;
  profile_id: string;
  content_type: "live" | "movie" | "series";
  stream_id: string | null;
  name: string;
  thumbnail_url: string | null;
  stream_url: string | null;
  updated_at: string;
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

interface Props {
  style?: any;
  onPress?: (item: RecentlyWatched) => void;
  refreshKey?: number;
  maxItems?: number;
  onLayout?: (e: any) => void;
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

  return (
    <Pressable
      style={[styles.row, isActive && styles.rowActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {isActive ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.12)", "rgba(255,102,0,0.04)"]}
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
      </View>

      <View style={styles.infoCol}>
        <View style={styles.typePill}>
          <Feather
            name={TYPE_ICON[item.content_type] ?? "play"}
            size={9}
            color={Colors.dark.accent}
          />
          <ThemedText style={styles.typeText}>
            {TYPE_LABEL[item.content_type] ?? item.content_type}
          </ThemedText>
        </View>
        <ThemedText style={styles.contentName} numberOfLines={1}>
          {item.name}
        </ThemedText>
      </View>

      <View style={[styles.playIcon, isActive && styles.playIconActive]}>
        <Feather
          name="play"
          size={12}
          color={isActive ? Colors.dark.accent : Colors.dark.textSecondary}
        />
      </View>

      {isActive ? <View style={styles.activeBar} /> : null}
    </Pressable>
  );
}

export default function RecentlyWatchedCard({ style, onPress, refreshKey, maxItems, onLayout }: Props) {
  const { activeProfile } = useProfile();
  const [items, setItems] = useState<RecentlyWatched[] | undefined>(undefined);

  const fetchItems = useCallback(async () => {
    if (!activeProfile) return;
    try {
      const url = new URL("/api/recently-watched", getApiUrl());
      url.searchParams.set("profile_id", activeProfile.id);
      const res = await fetch(url.toString());
      const data = await res.json();
      setItems(Array.isArray(data) ? data : data ? [data] : []);
    } catch {
      setItems([]);
    }
  }, [activeProfile]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems, refreshKey]);

  const displayItems = maxItems && items ? items.slice(0, maxItems) : items;
  const isEmpty = !displayItems || displayItems.length === 0;
  const isLoading = items === undefined;

  return (
    <View style={[styles.card, style]} onLayout={onLayout}>
      <View style={styles.labelRow}>
        <Feather name="clock" size={11} color={Colors.dark.accent} />
        <ThemedText style={styles.sectionLabel}>Previously Watched</ThemedText>
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
}) {
  try {
    const url = new URL("/api/recently-watched", getApiUrl());
    await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile_id: params.profileId,
        content_type: params.contentType,
        stream_id: params.streamId ?? null,
        name: params.name,
        thumbnail_url: params.thumbnailUrl ?? null,
        stream_url: params.streamUrl ?? null,
      }),
    });
  } catch {
    // silent — non-critical
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

  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.accent,
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
    gap: 0,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: 3,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderRadius: BorderRadius.sm,
    paddingVertical: 4,
    paddingHorizontal: 2,
    overflow: "hidden",
  },
  rowActive: {
    backgroundColor: "rgba(255,102,0,0.06)",
  },

  thumbWrap: {
    width: 72,
    height: 40,
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

  infoCol: {
    flex: 1,
    gap: 2,
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    alignSelf: "flex-start",
    backgroundColor: Colors.dark.accentDim,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  typeText: {
    fontSize: 8,
    fontWeight: "700",
    color: Colors.dark.accent,
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
  playIconActive: {
    backgroundColor: Colors.dark.accentDim,
    borderColor: Colors.dark.accent,
  },

  activeBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: Colors.dark.accent,
    borderRadius: 1,
  },
});
