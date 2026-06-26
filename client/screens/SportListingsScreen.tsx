import { useState, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { getApiUrl } from "@/lib/query-client";
import { useData } from "@/contexts/DataContext";
import { useAccent, withAlpha } from "@/contexts/ThemeContext";
import { LinearGradient } from "expo-linear-gradient";
import { xtreamApi } from "@/lib/xtream-api";
import type { LiveStream } from "@/lib/xtream-api";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface SportMatch {
  uk_time: string;
  teams: string;
  uk_channels: string[];
}
interface SportCompetition {
  name: string;
  matches: SportMatch[];
}
interface SportGroup {
  sport_key: string;
  sport_label: string;
  display_order: number;
  competitions: SportCompetition[];
}

// ── Channel name aliases ─────────────────────────────────────────────────────
// Maps broadcast channel names (as GPT extracts them) to the naming
// convention used on the IPTV service, so the fuzzy matcher can find them.
// ── Section channels (streaming/event — too many variants to link) ───────────
// These are shown as an informational chip with no stream link.
const SECTION_PATTERNS: Array<[RegExp, string]> = [
  [/sky\s*sports?\+\s*\(streaming\)/i, "Sky Sports+ Section"],
  [/superleague\+/i,                   "SuperLeague+ Section"],
];

// Returns { displayLabel, linkable } for a raw channel string from GPT.
// Non-linkable channels show a distinct chip; linkable ones go through findStream.
function resolveChannelDisplay(raw: string): { displayLabel: string; linkable: boolean } {
  const trimmed = raw.trim();
  for (const [pattern, label] of SECTION_PATTERNS) {
    if (pattern.test(trimmed)) return { displayLabel: label, linkable: false };
  }
  // Strip "(TV)" qualifier — purely informational, not part of the stream name
  const display = trimmed.replace(/\s*\(tv\)\s*/gi, "").trim();
  return { displayLabel: display || trimmed, linkable: true };
}

// ── Channel alias map ────────────────────────────────────────────────────────
const CHANNEL_ALIASES: Array<[RegExp, string]> = [
  // Strip "(TV)" before lookup (already stripped in display, belt-and-braces here)
  [/\s*\(tv\)\s*/gi, ""],
  // "Sky Sports X" / "Sky Sport X" → "SkySp X"  (covers "SkySp +" too via \s*)
  [/sky\s*sports?\s*/gi, "SkySp "],
  // Add more aliases here as needed, e.g.:
  // [/bt\s*sport\s*/gi, "BT Sport "],
];

function applyAliases(name: string): string {
  let result = name;
  for (const [pattern, replacement] of CHANNEL_ALIASES) {
    result = result.replace(pattern, replacement);
  }
  return result.trim();
}

// Quality tier: higher = better.  FHD / FH beat HD, SD is lowest.
function qualityTier(streamName: string): number {
  const u = streamName.toUpperCase();
  if (u.includes(" FHD") || /\bFH\b/.test(u)) return 3;
  if (u.includes(" HD")) return 2;
  if (u.includes(" SD")) return 0;
  return 1; // no explicit quality tag
}

// ── Channel fuzzy-matcher ───────────────────────────────────────────────────
function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findStream(channelName: string, streams: LiveStream[]): LiveStream | undefined {
  // Build a set of name variants to try (original + alias-transformed)
  const variants = Array.from(new Set([channelName, applyAliases(channelName)]));
  const needles = variants.map(norm).filter(Boolean);
  if (!needles.length) return undefined;

  const candidates: Array<{ stream: LiveStream; matchScore: number }> = [];

  for (const s of streams) {
    const hay = norm(s.name);
    if (!hay) continue;
    let matchScore = 0;
    for (const needle of needles) {
      if (hay === needle) { matchScore = Math.max(matchScore, 3); break; }
      if (hay.includes(needle) && needle.length > 2) matchScore = Math.max(matchScore, 2);
      else if (needle.includes(hay) && hay.length > 2) matchScore = Math.max(matchScore, 1);
    }
    if (matchScore > 0) candidates.push({ stream: s, matchScore });
  }

  if (!candidates.length) return undefined;

  // Prefer higher match score, then highest quality (FHD > HD > SD)
  candidates.sort((a, b) =>
    b.matchScore !== a.matchScore
      ? b.matchScore - a.matchScore
      : qualityTier(b.stream.name) - qualityTier(a.stream.name),
  );

  return candidates[0].stream;
}

// ── ChannelChip ─────────────────────────────────────────────────────────────
// isSection = streaming/event channel (Sky Sports+ Streaming, SuperLeague+):
//   shown in blue, informational only, never tappable.
// matched = found a linkable stream → orange, tappable.
// neither  = channel listed but no stream found → grey, not tappable.
function ChannelChip({
  label,
  matched,
  onPress,
  isSection = false,
}: {
  label: string;
  matched: boolean;
  onPress?: () => void;
  isSection?: boolean;
}) {
  const [active, setActive] = useState(false);
  const accent = useAccent();

  if (isSection) {
    return (
      <View style={styles.chipSection}>
        <Feather name="radio" size={9} color="#6b8fc7" style={{ marginRight: 3 }} />
        <ThemedText style={styles.chipTextSection} numberOfLines={1}>{label}</ThemedText>
      </View>
    );
  }

  return (
    <Pressable
      onPress={matched ? onPress : undefined}
      onPressIn={() => setActive(true)}
      onPressOut={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      onHoverIn={() => setActive(true)}
      onHoverOut={() => setActive(false)}
      style={[
        styles.chip,
        matched ? styles.chipMatched : styles.chipUnmatched,
        active && matched && { borderColor: accent.accent, backgroundColor: withAlpha(accent.accent, 0.2) },
      ]}
    >
      {matched ? (
        <Feather name="tv" size={9} color={active ? accent.accent : Colors.dark.accent} style={{ marginRight: 3 }} />
      ) : null}
      <ThemedText
        style={[styles.chipText, matched ? styles.chipTextMatched : styles.chipTextUnmatched, active && matched && { color: accent.accent }]}
        numberOfLines={1}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

// ── MatchRow ─────────────────────────────────────────────────────────────────
function MatchRow({ match, streams, onChannel }: { match: SportMatch; streams: LiveStream[]; onChannel: (s: LiveStream) => void }) {
  return (
    <View style={styles.matchRow}>
      <View style={styles.matchTimePill}>
        <ThemedText style={styles.matchTimeText}>{match.uk_time || "TBC"}</ThemedText>
      </View>
      <View style={styles.matchBody}>
        <ThemedText style={styles.matchTeams} numberOfLines={2}>{match.teams}</ThemedText>
        {match.uk_channels.length > 0 ? (
          <View style={styles.chipRow}>
            {match.uk_channels.map((ch, i) => {
              const { displayLabel, linkable } = resolveChannelDisplay(ch);
              const stream = linkable ? findStream(ch, streams) : undefined;
              return (
                <ChannelChip
                  key={i}
                  label={displayLabel}
                  matched={!!stream}
                  isSection={!linkable}
                  onPress={stream ? () => onChannel(stream) : undefined}
                />
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ── SportCard ────────────────────────────────────────────────────────────────
const SPORT_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  football: "circle",
  formula_1: "zap",
  formula_2: "zap",
  formula_3: "zap",
  motogp: "zap",
  tennis: "activity",
  cricket: "activity",
  rugby_league: "activity",
  rugby_union: "activity",
  boxing: "activity",
  darts: "crosshair",
  snooker: "circle",
  cycling: "wind",
  athletics: "wind",
  golf: "flag",
  basketball: "circle",
};

function SportCard({
  group,
  streams,
  onChannel,
  defaultExpanded,
}: {
  group: SportGroup;
  streams: LiveStream[];
  onChannel: (s: LiveStream) => void;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [active, setActive] = useState(false);
  const accent = useAccent();
  const icon = SPORT_ICON[group.sport_key] ?? "tv";
  const totalMatches = useMemo(
    () => group.competitions.reduce((n, c) => n + c.matches.length, 0),
    [group],
  );

  return (
    <View style={styles.sportCard}>
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        onPressIn={() => setActive(true)}
        onPressOut={() => setActive(false)}
        onFocus={() => setActive(true)}
        onBlur={() => setActive(false)}
        onHoverIn={() => setActive(true)}
        onHoverOut={() => setActive(false)}
        style={[styles.sportHeader, active && { borderColor: withAlpha(accent.accent, 0.45), backgroundColor: withAlpha(accent.accent, 0.07) }]}
      >
        {active ? (
          <LinearGradient
            colors={[withAlpha(accent.accent, 0.1), "transparent"]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
          />
        ) : null}
        <View style={[styles.sportIconWrap, { backgroundColor: withAlpha(accent.accent, active ? 0.2 : 0.12) }]}>
          <Feather name={icon} size={17} color={accent.accent} />
        </View>
        <ThemedText style={[styles.sportLabel, active && { color: accent.accent }]}>{group.sport_label}</ThemedText>
        <View style={styles.sportMeta}>
          <ThemedText style={styles.matchCountText}>{totalMatches} match{totalMatches !== 1 ? "es" : ""}</ThemedText>
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={active ? accent.accent : Colors.dark.textSecondary} />
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.sportBody}>
          {group.competitions.map((comp, ci) => (
            <View key={ci} style={[styles.compSection, ci > 0 && styles.compSectionBorder]}>
              <View style={styles.compHeaderRow}>
                <Feather name="flag" size={11} color={Colors.dark.textSecondary} style={{ marginRight: 5 }} />
                <ThemedText style={styles.compName} numberOfLines={1}>{comp.name}</ThemedText>
              </View>
              {comp.matches.map((match, mi) => (
                <MatchRow key={mi} match={match} streams={streams} onChannel={onChannel} />
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ── BackButton ───────────────────────────────────────────────────────────────
function BackButton() {
  const navigation = useNavigation<NavigationProp>();
  const [active, setActive] = useState(false);
  const accent = useAccent();
  return (
    <Pressable
      onPress={() => navigation.goBack()}
      onPressIn={() => setActive(true)}
      onPressOut={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      onHoverIn={() => setActive(true)}
      onHoverOut={() => setActive(false)}
      style={[styles.backBtn, active && { borderColor: withAlpha(accent.accent, 0.5), backgroundColor: withAlpha(accent.accent, 0.1) }]}
    >
      <Feather name="arrow-left" size={18} color={active ? accent.accent : Colors.dark.text} />
    </Pressable>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function SportListingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { liveStreams } = useData();
  const accent = useAccent();

  const [listings, setListings] = useState<SportGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/sports/listings", getApiUrl());
      const r = await fetch(url.toString());
      if (!r.ok) throw new Error(`Server error ${r.status}`);
      const data = await r.json();
      setListings(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchListings(); }, [fetchListings]));

  const handleChannel = useCallback(
    (stream: LiveStream) => {
      navigation.navigate("LivePreview", {
        streamId: stream.stream_id,
        name: stream.name,
        streamUrl: xtreamApi.getLiveStreamUrl(stream.stream_id),
        thumbnail: stream.stream_icon ?? undefined,
        streamIcon: stream.stream_icon ?? undefined,
      });
    },
    [navigation],
  );

  const todayLabel = useMemo(() => {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date());
  }, []);

  const pt = insets.top + Spacing.md;
  const pb = insets.bottom + Spacing["2xl"];

  return (
    <View style={[styles.root, { paddingTop: pt }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <BackButton />
        <View style={styles.headerCenter}>
          <ThemedText style={styles.screenTitle}>Sports on TV</ThemedText>
          <ThemedText style={styles.dateLabel}>{todayLabel}</ThemedText>
        </View>
        <Pressable
          onPress={fetchListings}
          style={[styles.backBtn, loading && { opacity: 0.5 }]}
          disabled={loading}
        >
          <Feather name="refresh-cw" size={16} color={Colors.dark.textSecondary} />
        </Pressable>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={Colors.dark.accent} size="large" />
          <ThemedText style={styles.emptySubtitle}>Loading listings…</ThemedText>
        </View>
      ) : error ? (
        <View style={styles.centre}>
          <Feather name="wifi-off" size={40} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.emptyTitle}>Could not load</ThemedText>
          <ThemedText style={styles.emptySubtitle}>{error}</ThemedText>
          <Pressable style={[styles.retryBtn, { borderColor: withAlpha(accent.accent, 0.4) }]} onPress={fetchListings}>
            <Feather name="refresh-cw" size={13} color={accent.accent} style={{ marginRight: 5 }} />
            <ThemedText style={[styles.retryText, { color: accent.accent }]}>Try again</ThemedText>
          </Pressable>
        </View>
      ) : listings.length === 0 ? (
        <View style={styles.centre}>
          <Feather name="calendar" size={44} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.emptyTitle}>No listings today</ThemedText>
          <ThemedText style={styles.emptySubtitle}>
            Check back after the next sync, or ask your admin to trigger one.
          </ThemedText>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: pb }]}
          showsVerticalScrollIndicator={false}
        >
          <ThemedText style={styles.sectionHint}>
            Tap a channel to jump straight to the live stream
          </ThemedText>
          {listings.map((group, i) => (
            <SportCard
              key={group.sport_key}
              group={group}
              streams={liveStreams}
              onChannel={handleChannel}
              defaultExpanded={i === 0}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  dateLabel: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginTop: 1,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    gap: Spacing.sm,
  },
  sectionHint: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xs,
  },
  // ── Sport card ─────────────────────────────────────────────────────────────
  sportCard: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
    marginBottom: Spacing.xs,
  },
  sportHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: "transparent",
    overflow: "hidden",
  },
  sportIconWrap: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sportLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  sportMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  matchCountText: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
  },
  sportBody: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  // ── Competition section ───────────────────────────────────────────────────
  compSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  compSectionBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  compHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  compName: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  // ── Match row ──────────────────────────────────────────────────────────────
  matchRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border + "55",
  },
  matchTimePill: {
    minWidth: 44,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 3,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  matchTimeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.accent,
    fontVariant: ["tabular-nums"],
  },
  matchBody: {
    flex: 1,
    gap: Spacing.xs,
  },
  matchTeams: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
    lineHeight: 18,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  // ── Channel chip ───────────────────────────────────────────────────────────
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  chipMatched: {
    borderColor: Colors.dark.accent + "66",
    backgroundColor: Colors.dark.accentDim,
  },
  chipUnmatched: {
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  chipTextMatched: {
    color: Colors.dark.accent,
  },
  chipTextUnmatched: {
    color: Colors.dark.textSecondary,
  },
  chipSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "#3a5a8a",
    backgroundColor: "rgba(58,90,138,0.18)",
  },
  chipTextSection: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6b8fc7",
  },
  // ── States ────────────────────────────────────────────────────────────────
  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing["4xl"],
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  retryText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
