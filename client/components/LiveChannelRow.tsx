import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { PlayerUI } from "@/components/player/playerTheme";
import { parseChannelName } from "@/lib/channel-name";
import { decodeEpg } from "@/lib/epg";
import {
  requestEpg,
  getNowPlaying,
  getProgress,
  useEpgCacheVersion,
} from "@/lib/epg-cache";
import { setLongPressAction, clearLongPressAction } from "@/lib/tv-long-press";
import type { LiveStream } from "@/lib/xtream-api";

export const LIVE_ROW_HEIGHT = 78;

type Props = {
  item: LiveStream;
  width: number;
  isFavourited: boolean;
  onPress: (item: LiveStream) => void;
  onLongPress: (item: LiveStream) => void;
};

/**
 * A live channel as a row: logo, name, what's on now, and how far through it is.
 *
 * The grid of logos it replaces could not answer the only question that matters
 * when picking a live channel — "what's on" — even though the app already has
 * the data.
 *
 * EPG is requested from inside the row on purpose. FlashList only mounts rows
 * that are on (or near) screen, so the viewport caps how many channels are ever
 * asked for, without any scroll tracking. The cache de-duplicates and limits
 * concurrency, because the provider's short-EPG endpoint throttles under
 * parallel load.
 */
export const LiveChannelRow = React.memo(function LiveChannelRow({
  item,
  width,
  isFavourited,
  onPress,
  onLongPress,
}: Props) {
  const [lit, setLit] = useState(false);
  const version = useEpgCacheVersion();
  const streamId = item.stream_id;

  useEffect(() => {
    requestEpg(streamId);
  }, [streamId]);

  // `version` is read so this re-renders when a pending fetch lands.
  void version;
  const now = getNowPlaying(streamId);
  const progress = getProgress(streamId);
  const { title, badges } = parseChannelName(item.name);
  const nowTitle = now ? decodeEpg(now.title) : "";

  // Stable identity for the remote's hold-to-favourite registry.
  const actionRef = React.useRef(() => {});
  actionRef.current = () => onLongPress(item);

  return (
    <Pressable
      style={[styles.row, { width }, lit && styles.rowLit]}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      onPressIn={() => setLit(true)}
      onPressOut={() => setLit(false)}
      onFocus={() => { setLit(true); setLongPressAction(actionRef.current); }}
      onBlur={() => { setLit(false); clearLongPressAction(actionRef.current); }}
      focusable
    >
      <View style={styles.logoWrap}>
        {item.stream_icon ? (
          <Image
            source={item.stream_icon}
            style={styles.logo}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={String(streamId)}
            transition={0}
          />
        ) : (
          <Feather name="tv" size={18} color="rgba(255,255,255,0.35)" />
        )}
      </View>

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <ThemedText style={[styles.name, lit && styles.textLit]} numberOfLines={1}>
            {title}
          </ThemedText>
          {badges.map((b) => (
            <View key={b} style={[styles.badge, lit && styles.badgeLit]}>
              <ThemedText style={[styles.badgeText, lit && styles.badgeTextLit]}>{b}</ThemedText>
            </View>
          ))}
          {isFavourited ? (
            <Feather name="star" size={12} color={lit ? "#B23E00" : Colors.dark.accent} />
          ) : null}
        </View>

        {/* Deliberately renders nothing rather than a placeholder while the
            guide is still loading — a row that reflows as data lands is worse
            than one that fills in quietly. */}
        {nowTitle ? (
          <ThemedText style={[styles.now, lit && styles.nowLit]} numberOfLines={1}>
            {nowTitle}
          </ThemedText>
        ) : null}

        {progress != null ? (
          <View style={[styles.track, lit && styles.trackLit]}>
            <View style={[styles.fill, { width: `${progress}%` }]} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    height: LIVE_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  rowLit: {
    backgroundColor: "#fff",
    borderColor: Colors.dark.accent,
    borderWidth: 2,
  },
  logoWrap: {
    width: 52,
    height: 36,
    borderRadius: BorderRadius.xs,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logo: { width: "100%", height: "100%" },
  info: { flex: 1, minWidth: 0, gap: 3 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: {
    flexShrink: 1,
    fontSize: 15,
    fontFamily: PlayerUI.font.ui,
    color: "#fff",
  },
  textLit: { color: "#0B0B11" },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  badgeLit: { backgroundColor: "rgba(0,0,0,0.12)" },
  badgeText: {
    fontSize: 9,
    fontFamily: PlayerUI.font.uiBold,
    color: "rgba(255,255,255,0.65)",
    letterSpacing: 0.4,
  },
  badgeTextLit: { color: "rgba(0,0,0,0.6)" },
  now: { fontSize: 12, fontFamily: PlayerUI.font.uiRegular, color: Colors.dark.accent },
  nowLit: { color: "#B23E00" },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.16)",
    overflow: "hidden",
  },
  trackLit: { backgroundColor: "rgba(0,0,0,0.12)" },
  fill: { height: "100%", borderRadius: 2, backgroundColor: Colors.dark.accent },
});
