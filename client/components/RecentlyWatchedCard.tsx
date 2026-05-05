import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, Pressable, Image } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import { getApiUrl } from "@/lib/query-client";
import { useProfile } from "@/contexts/ProfileContext";

interface RecentlyWatched {
  id: string;
  profile_id: string;
  content_type: "live" | "movie" | "series";
  stream_id: string | null;
  name: string;
  thumbnail_url: string | null;
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
}

export default function RecentlyWatchedCard({ style, onPress }: Props) {
  const { activeProfile } = useProfile();
  const [item, setItem] = useState<RecentlyWatched | null | undefined>(undefined);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const isActive = pressed || focused;

  const fetchItem = useCallback(async () => {
    if (!activeProfile) return;
    try {
      const url = new URL("/api/recently-watched", getApiUrl());
      url.searchParams.set("profile_id", activeProfile.id);
      const res = await fetch(url.toString());
      const data = await res.json();
      setItem(data ?? null);
    } catch {
      setItem(null);
    }
  }, [activeProfile]);

  useEffect(() => {
    fetchItem();
  }, [fetchItem]);

  const isEmpty = item === null || item === undefined;
  const isLoading = item === undefined;

  return (
    <Pressable
      style={[styles.card, isActive && !isEmpty && styles.cardActive, style]}
      onPress={() => item && onPress?.(item)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={isEmpty}
    >
      {isActive && !isEmpty ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.12)", "rgba(255,102,0,0.04)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}

      {/* Section label */}
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
            <Feather name="play-circle" size={22} color={Colors.dark.textSecondary} />
          </View>
          <ThemedText style={styles.emptyText}>Start watching something</ThemedText>
          <ThemedText style={styles.emptyHint}>Your last played content will appear here</ThemedText>
        </View>
      ) : (
        <View style={styles.contentRow}>
          {/* Thumbnail */}
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
                  size={20}
                  color={Colors.dark.textSecondary}
                />
              </View>
            )}
            {/* Live badge overlay */}
            {item.content_type === "live" ? (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <ThemedText style={styles.liveText}>LIVE</ThemedText>
              </View>
            ) : null}
          </View>

          {/* Info */}
          <View style={styles.infoCol}>
            <View style={styles.typePill}>
              <Feather
                name={TYPE_ICON[item.content_type] ?? "play"}
                size={10}
                color={Colors.dark.accent}
              />
              <ThemedText style={styles.typeText}>
                {TYPE_LABEL[item.content_type] ?? item.content_type}
              </ThemedText>
            </View>
            <ThemedText style={styles.contentName} numberOfLines={2}>
              {item.name}
            </ThemedText>
          </View>

          {/* Play icon */}
          <View style={[styles.playIcon, isActive && styles.playIconActive]}>
            <Feather
              name="play"
              size={14}
              color={isActive ? Colors.dark.accent : Colors.dark.textSecondary}
            />
          </View>
        </View>
      )}

      {isActive && !isEmpty ? <View style={styles.activeBar} /> : null}
    </Pressable>
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
  cardActive: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
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
  },
  emptyIconRing: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyHint: {
    color: Colors.dark.textMuted,
    fontSize: 10,
    textAlign: "center",
  },

  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  thumbWrap: {
    width: 80,
    height: 45,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    backgroundColor: Colors.dark.backgroundSecondary,
    flexShrink: 0,
    position: "relative",
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
    bottom: 3,
    left: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(220,30,30,0.85)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  liveDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#fff" },
  liveText: { color: "#fff", fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },

  infoCol: {
    flex: 1,
    gap: 3,
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    alignSelf: "flex-start",
    backgroundColor: Colors.dark.accentDim,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  typeText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.dark.accent,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  contentName: {
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },

  playIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
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
    left: "15%",
    right: "15%",
    height: 2,
    backgroundColor: Colors.dark.accent,
    borderRadius: 1,
  },
});
