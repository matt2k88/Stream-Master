import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { PlayerUI } from "./playerTheme";
import { PlayerLabels } from "./playerLabels";
import { Colors } from "@/constants/theme";
import type { EpgListing } from "@/lib/xtream-api";
import { decodeEpg, epgClock } from "@/lib/epg";

export type EpgPanelProps = {
  channelName: string;
  listings: EpgListing[];
  loading: boolean;
  onClose: () => void;
  onActivity?: () => void;
};

/**
 * What's on now and what's coming up, for the channel being watched.
 *
 * Xtream returns short-EPG titles and descriptions base64-encoded and ordered
 * from the current programme onward, so the first entry is "now" and the rest
 * are "next" — see lib/epg.ts for the decoding.
 */
export function EpgPanel({ channelName, listings, loading, onClose, onActivity }: EpgPanelProps) {
  const now = listings[0];
  const upcoming = listings.slice(1);

  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <Feather name="calendar" size={16} color={Colors.dark.accent} />
        <View style={styles.headText}>
          <Text style={styles.title}>{PlayerLabels.guide}</Text>
          <Text style={styles.channel} numberOfLines={1}>{channelName}</Text>
        </View>
      </View>

      {loading && listings.length === 0 ? (
        <View style={styles.state}>
          <ActivityIndicator color={Colors.dark.accent} />
          <Text style={styles.stateText}>Loading guide…</Text>
        </View>
      ) : listings.length === 0 ? (
        <View style={styles.state}>
          <Feather name="calendar" size={20} color="rgba(255,255,255,0.3)" />
          <Text style={styles.stateText}>No guide for this channel</Text>
        </View>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listInner}>
          {now ? (
            <View style={styles.nowBlock}>
              <View style={styles.badgeRow}>
                <View style={styles.nowBadge}>
                  <Text style={styles.nowBadgeText}>ON NOW</Text>
                </View>
                <Text style={styles.time}>
                  {epgClock(now.start_timestamp)} – {epgClock(now.stop_timestamp)}
                </Text>
              </View>
              <Text style={styles.nowTitle} numberOfLines={2}>{decodeEpg(now.title)}</Text>
              {decodeEpg(now.description) ? (
                <Text style={styles.desc} numberOfLines={3}>{decodeEpg(now.description)}</Text>
              ) : null}
            </View>
          ) : null}

          {upcoming.length ? <Text style={styles.upNextLabel}>COMING UP</Text> : null}
          {upcoming.map((item, index) => (
            <EpgRow
              key={item.id ?? `${item.start_timestamp}`}
              time={epgClock(item.start_timestamp)}
              title={decodeEpg(item.title)}
              preferFocus={index === 0}
              onActivity={onActivity}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/** A listing row. Focusable purely so the remote can scroll the list — there is
 *  nothing to activate, so focus is shown with a strong fill rather than a
 *  pressable-looking highlight. */
function EpgRow({
  time,
  title,
  preferFocus,
  onActivity,
}: {
  time: string;
  title: string;
  preferFocus?: boolean;
  onActivity?: () => void;
}) {
  const [lit, setLit] = useState(false);
  return (
    <Pressable
      focusable
      hasTVPreferredFocus={preferFocus}
      onFocus={() => { setLit(true); onActivity?.(); }}
      onBlur={() => setLit(false)}
      onPress={() => onActivity?.()}
      style={[styles.nextRow, lit && styles.nextRowLit]}
    >
      <Text style={[styles.nextTime, lit && styles.nextTextLit]}>{time}</Text>
      <Text style={[styles.nextTitle, lit && styles.nextTextLit]} numberOfLines={1}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: PlayerUI.panel.bg,
    borderColor: PlayerUI.panel.border,
    borderWidth: 1,
    borderRadius: PlayerUI.panel.radius,
    overflow: "hidden",
    maxWidth: 520,
    width: "100%",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headText: { flex: 1, minWidth: 0 },
  title: { color: "#fff", fontSize: 15, fontFamily: PlayerUI.font.display, letterSpacing: -0.1 },
  channel: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontFamily: PlayerUI.font.uiRegular, marginTop: 2 },
  list: { maxHeight: 240 },
  listInner: { paddingBottom: 8 },
  state: { alignItems: "center", gap: 8, paddingVertical: 26 },
  stateText: { color: "rgba(255,255,255,0.5)", fontSize: 13, fontFamily: PlayerUI.font.uiRegular },
  nowBlock: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  nowBadge: {
    backgroundColor: Colors.dark.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  nowBadgeText: { color: "#1A0A00", fontSize: 10, fontFamily: PlayerUI.font.uiBold, letterSpacing: 0.8 },
  time: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: PlayerUI.font.uiRegular, fontVariant: ["tabular-nums"] },
  nowTitle: { color: "#fff", fontSize: 17, fontFamily: PlayerUI.font.display, letterSpacing: -0.2 },
  desc: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: PlayerUI.font.uiRegular, lineHeight: 18, marginTop: 6 },
  upNextLabel: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
    fontFamily: PlayerUI.font.uiBold,
    letterSpacing: 1.2,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 6,
  },
  nextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  nextTime: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontFamily: PlayerUI.font.uiRegular,
    fontVariant: ["tabular-nums"],
    width: 46,
  },
  nextTitle: { flex: 1, minWidth: 0, color: "rgba(255,255,255,0.88)", fontSize: 13, fontFamily: PlayerUI.font.uiRegular },
  // Focus inside the Guide has to be as obvious as focus on a button, or there
  // is no way to tell which row the remote is on while scrolling.
  nextRowLit: {
    backgroundColor: "#fff",
    borderRadius: 8,
  },
  nextTextLit: { color: "#0B0B11", fontFamily: PlayerUI.font.ui },
});
