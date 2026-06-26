import { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
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

// ── Non-linkable channel patterns ────────────────────────────────────────────
// label: fixed display string (Section channels).
// no label: raw channel name shown as-is (on-demand / catch-up services).
const NON_LINKABLE: Array<{ pattern: RegExp; label?: string }> = [
  { pattern: /sky\s*sports?\+\s*\(streaming\)/i, label: "Sky Sports+ Section" },
  { pattern: /superleague\+/i,                   label: "SuperLeague+ Section" },
  { pattern: /bbc\s*red\s*button/i },
  { pattern: /bbc\s*i?player/i },
  { pattern: /itvx\b|itv\s*x\b/i },
  { pattern: /\ball\s*4\b|channel\s*4\s*(player|on\s*demand)/i },
  { pattern: /\bmy\s*5\b|channel\s*5\s*(player|on\s*demand)/i },
  { pattern: /\bS4C\s*Clic\b|\bS4C\s*(on\s*demand|player)/i },
  { pattern: /\bSTV\s*Player\b/i },
];

function resolveChannelDisplay(raw: string): { displayLabel: string; linkable: boolean } {
  const trimmed = raw.trim();
  for (const { pattern, label } of NON_LINKABLE) {
    if (pattern.test(trimmed)) return { displayLabel: label ?? trimmed, linkable: false };
  }
  const display = trimmed.replace(/\s*\(tv\)\s*/gi, "").trim();
  return { displayLabel: display || trimmed, linkable: true };
}

// ── Channel alias map ────────────────────────────────────────────────────────
const CHANNEL_ALIASES: Array<[RegExp, string]> = [
  [/\s*\(tv\)\s*/gi, ""],
  [/sky\s*sports?\s*/gi, "SkySp "],
];

function applyAliases(name: string): string {
  let result = name;
  for (const [pattern, replacement] of CHANNEL_ALIASES) {
    result = result.replace(pattern, replacement);
  }
  return result.trim();
}

function qualityTier(streamName: string): number {
  const u = streamName.toUpperCase();
  if (u.includes(" FHD") || /\bFH\b/.test(u)) return 3;
  if (u.includes(" HD")) return 2;
  if (u.includes(" SD")) return 0;
  return 1;
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findStream(channelName: string, streams: LiveStream[]): LiveStream | undefined {
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
  candidates.sort((a, b) =>
    b.matchScore !== a.matchScore
      ? b.matchScore - a.matchScore
      : qualityTier(b.stream.name) - qualityTier(a.stream.name),
  );
  return candidates[0].stream;
}

// ── ChannelChip ──────────────────────────────────────────────────────────────
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

  const pressProps = {
    onPressIn:  () => setActive(true),
    onPressOut: () => setActive(false),
    onFocus:    () => setActive(true),
    onBlur:     () => setActive(false),
    onHoverIn:  () => setActive(true),
    onHoverOut: () => setActive(false),
  };

  if (isSection) {
    return (
      <View style={styles.chipSection}>
        <Feather name="radio" size={8} color="#6b8fc7" style={{ marginRight: 3 }} />
        <ThemedText style={styles.chipTextSection} numberOfLines={1}>{label}</ThemedText>
      </View>
    );
  }

  return (
    <Pressable
      onPress={matched ? onPress : undefined}
      {...pressProps}
      style={[
        styles.chip,
        matched ? styles.chipMatched : styles.chipUnmatched,
        active && matched && { borderColor: accent.accent, backgroundColor: withAlpha(accent.accent, 0.2) },
      ]}
    >
      {matched ? (
        <Feather name="tv" size={8} color={active ? accent.accent : Colors.dark.accent} style={{ marginRight: 3 }} />
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
function MatchRow({
  match,
  streams,
  onChannel,
  isLast,
}: {
  match: SportMatch;
  streams: LiveStream[];
  onChannel: (s: LiveStream) => void;
  isLast?: boolean;
}) {
  // Resolve each channel: section chips are always static.
  // If NO linkable channel finds a direct match, try non-linkable names as a
  // last resort so we can inject one extra orange chip below the blue ones.
  const { resolved, extraChip } = useMemo(() => {
    const resolved = match.uk_channels.map((ch) => {
      const { displayLabel, linkable } = resolveChannelDisplay(ch);
      const stream = linkable ? findStream(ch, streams) : undefined;
      return { displayLabel, linkable, stream };
    });

    const hasDirectLink = resolved.some((r) => r.linkable && r.stream);

    let extraChip: { label: string; stream: LiveStream } | null = null;
    if (!hasDirectLink) {
      for (const ch of match.uk_channels) {
        const { displayLabel } = resolveChannelDisplay(ch);
        const s = findStream(ch, streams);
        if (s) { extraChip = { label: displayLabel, stream: s }; break; }
      }
    }

    return { resolved, extraChip };
  }, [match.uk_channels, streams]);

  return (
    <View style={[styles.matchRow, isLast && styles.matchRowLast]}>
      {/* Time */}
      <View style={styles.matchTimePill}>
        <ThemedText style={styles.matchTimeText} numberOfLines={1}>
          {match.uk_time || "TBC"}
        </ThemedText>
      </View>

      {/* Teams + chips */}
      <View style={styles.matchBody}>
        <ThemedText style={styles.matchTeams} numberOfLines={1}>{match.teams}</ThemedText>
        {match.uk_channels.length > 0 ? (
          <View style={styles.chipRow}>
            {resolved.map(({ displayLabel, linkable, stream }, i) => (
              <ChannelChip
                key={i}
                label={displayLabel}
                matched={!!stream}
                isSection={!linkable}
                onPress={stream ? () => onChannel(stream!) : undefined}
              />
            ))}
            {extraChip ? (
              <ChannelChip
                key="extra"
                label={extraChip.label}
                matched={true}
                onPress={() => onChannel(extraChip!.stream)}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ── SportCard ────────────────────────────────────────────────────────────────
const SPORT_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  football:     "circle",
  formula_1:    "zap",
  formula_2:    "zap",
  formula_3:    "zap",
  motogp:       "zap",
  tennis:       "activity",
  cricket:      "activity",
  rugby_league: "activity",
  rugby_union:  "activity",
  boxing:       "activity",
  darts:        "crosshair",
  snooker:      "circle",
  cycling:      "wind",
  athletics:    "wind",
  golf:         "flag",
  basketball:   "circle",
};

function SportCard({
  group,
  streams,
  onChannel,
  forceExpanded,
}: {
  group: SportGroup;
  streams: LiveStream[];
  onChannel: (s: LiveStream) => void;
  forceExpanded?: boolean;
}) {
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const accent = useAccent();
  const [active, setActive] = useState(false);
  const icon = SPORT_ICON[group.sport_key] ?? "tv";

  const expanded = forceExpanded ?? manualExpanded ?? false;

  const totalMatches = useMemo(
    () => group.competitions.reduce((n, c) => n + c.matches.length, 0),
    [group],
  );

  return (
    <View style={styles.sportCard}>
      <Pressable
        onPress={() => setManualExpanded((e) => !(e ?? forceExpanded ?? false))}
        onPressIn={() => setActive(true)}
        onPressOut={() => setActive(false)}
        onFocus={() => setActive(true)}
        onBlur={() => setActive(false)}
        onHoverIn={() => setActive(true)}
        onHoverOut={() => setActive(false)}
        style={[styles.sportHeader, active && { backgroundColor: withAlpha(accent.accent, 0.07) }]}
      >
        {active ? (
          <LinearGradient
            colors={[withAlpha(accent.accent, 0.08), "transparent"]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
          />
        ) : null}
        <View style={[styles.sportIconWrap, { backgroundColor: withAlpha(accent.accent, 0.12) }]}>
          <Feather name={icon} size={14} color={accent.accent} />
        </View>
        <ThemedText style={[styles.sportLabel, active && { color: accent.accent }]}>
          {group.sport_label}
        </ThemedText>
        <View style={styles.sportMeta}>
          <View style={styles.matchCountBadge}>
            <ThemedText style={styles.matchCountText}>{totalMatches}</ThemedText>
          </View>
          <Feather
            name={expanded ? "chevron-up" : "chevron-down"}
            size={14}
            color={active ? accent.accent : Colors.dark.textSecondary}
          />
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.sportBody}>
          {group.competitions.map((comp, ci) => (
            <View key={ci}>
              <View style={[styles.compHeader, ci > 0 && styles.compHeaderBorder]}>
                <ThemedText style={styles.compName} numberOfLines={1}>{comp.name}</ThemedText>
              </View>
              {comp.matches.map((match, mi) => (
                <MatchRow
                  key={mi}
                  match={match}
                  streams={streams}
                  onChannel={onChannel}
                  isLast={mi === comp.matches.length - 1}
                />
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ── Search bar ───────────────────────────────────────────────────────────────
function SearchBar({
  value,
  onChange,
  onClear,
  resultCount,
  isSearching,
}: {
  value: string;
  onChange: (t: string) => void;
  onClear: () => void;
  resultCount: number;
  isSearching: boolean;
}) {
  const inputRef = useRef<TextInput>(null);
  const accent = useAccent();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.searchWrap}>
      <Pressable
        style={[styles.searchBar, focused && { borderColor: withAlpha(accent.accent, 0.5) }]}
        onPress={() => inputRef.current?.focus()}
      >
        <Feather name="search" size={14} color={focused ? accent.accent : Colors.dark.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          ref={inputRef}
          style={styles.searchInput}
          placeholder="Search teams, channels, sports…"
          placeholderTextColor={Colors.dark.textSecondary}
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          returnKeyType="search"
          clearButtonMode="never"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {value.length > 0 ? (
          <Pressable onPress={onClear} style={styles.clearBtn} hitSlop={8}>
            <Feather name="x" size={12} color={Colors.dark.textSecondary} />
          </Pressable>
        ) : null}
      </Pressable>
      {isSearching ? (
        <ThemedText style={styles.resultCount}>
          {resultCount === 0 ? "No results" : `${resultCount} match${resultCount !== 1 ? "es" : ""}`}
        </ThemedText>
      ) : null}
    </View>
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
  const [query, setQuery] = useState("");

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

  // ── Search filter ──────────────────────────────────────────────────────────
  const q = query.trim().toLowerCase();
  const isSearching = q.length > 0;

  const filteredListings = useMemo<SportGroup[]>(() => {
    if (!q) return listings;
    return listings
      .map((group) => {
        const sportHit = group.sport_label.toLowerCase().includes(q);
        const filteredComps = group.competitions
          .map((comp) => {
            const compHit = comp.name.toLowerCase().includes(q);
            const filteredMatches = comp.matches.filter((match) => {
              if (sportHit || compHit) return true;
              if (match.teams.toLowerCase().includes(q)) return true;
              if (match.uk_channels.some((ch) => ch.toLowerCase().includes(q))) return true;
              return false;
            });
            return filteredMatches.length > 0 ? { ...comp, matches: filteredMatches } : null;
          })
          .filter((c): c is SportCompetition => c !== null);
        return filteredComps.length > 0 ? { ...group, competitions: filteredComps } : null;
      })
      .filter((g): g is SportGroup => g !== null);
  }, [listings, q]);

  const totalFilteredMatches = useMemo(
    () => filteredListings.reduce((n, g) => n + g.competitions.reduce((m, c) => m + c.matches.length, 0), 0),
    [filteredListings],
  );

  const pt = insets.top + Spacing.sm;
  const pb = insets.bottom + Spacing["2xl"];

  return (
    <View style={[styles.root, { paddingTop: pt }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
          hitSlop={8}
        >
          <Feather name="arrow-left" size={17} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <ThemedText style={styles.screenTitle}>Sports on TV</ThemedText>
          <ThemedText style={styles.dateLabel}>{todayLabel}</ThemedText>
        </View>
        <Pressable
          onPress={fetchListings}
          style={[styles.iconBtn, loading && { opacity: 0.4 }]}
          disabled={loading}
          hitSlop={8}
        >
          <Feather name="refresh-cw" size={15} color={Colors.dark.textSecondary} />
        </Pressable>
      </View>

      {/* Search */}
      {!loading && !error && listings.length > 0 ? (
        <SearchBar
          value={query}
          onChange={setQuery}
          onClear={() => setQuery("")}
          resultCount={totalFilteredMatches}
          isSearching={isSearching}
        />
      ) : null}

      {/* Content */}
      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={Colors.dark.accent} size="large" />
          <ThemedText style={styles.emptySubtitle}>Loading listings…</ThemedText>
        </View>
      ) : error ? (
        <View style={styles.centre}>
          <Feather name="wifi-off" size={38} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.emptyTitle}>Could not load</ThemedText>
          <ThemedText style={styles.emptySubtitle}>{error}</ThemedText>
          <Pressable style={[styles.retryBtn, { borderColor: withAlpha(accent.accent, 0.4) }]} onPress={fetchListings}>
            <Feather name="refresh-cw" size={12} color={accent.accent} style={{ marginRight: 5 }} />
            <ThemedText style={[styles.retryText, { color: accent.accent }]}>Try again</ThemedText>
          </Pressable>
        </View>
      ) : listings.length === 0 ? (
        <View style={styles.centre}>
          <Feather name="calendar" size={42} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.emptyTitle}>No listings today</ThemedText>
          <ThemedText style={styles.emptySubtitle}>
            Check back after the next sync, or ask your admin to trigger one.
          </ThemedText>
        </View>
      ) : isSearching && filteredListings.length === 0 ? (
        <View style={styles.centre}>
          <Feather name="search" size={38} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.emptyTitle}>No results</ThemedText>
          <ThemedText style={styles.emptySubtitle}>Try a different team, sport, or channel name.</ThemedText>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: pb }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {filteredListings.map((group) => (
            <SportCard
              key={group.sport_key}
              group={group}
              streams={liveStreams}
              onChannel={handleChannel}
              forceExpanded={isSearching ? true : undefined}
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

  // ── Header ─────────────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  screenTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  dateLabel: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginTop: 1,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    flexShrink: 0,
  },

  // ── Search ─────────────────────────────────────────────────────────────────
  searchWrap: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: 5,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.text,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } as any : {}),
  },
  clearBtn: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundTertiary,
    marginLeft: 4,
  },
  resultCount: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    paddingLeft: 4,
  },

  // ── Scroll ─────────────────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: 2,
    gap: 6,
  },

  // ── Sport card ─────────────────────────────────────────────────────────────
  sportCard: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  sportHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    gap: Spacing.sm,
    overflow: "hidden",
  },
  sportIconWrap: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.xs,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sportLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  sportMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  matchCountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  matchCountText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
  },
  sportBody: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },

  // ── Competition header ──────────────────────────────────────────────────────
  compHeader: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  compHeaderBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  compName: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  // ── Match row ──────────────────────────────────────────────────────────────
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.dark.border,
    gap: Spacing.sm,
  },
  matchRowLast: {},
  matchTimePill: {
    minWidth: 48,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  matchTimeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.dark.accent,
    fontVariant: ["tabular-nums"],
  },
  matchBody: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  matchTeams: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },

  // ── Channel chips ───────────────────────────────────────────────────────────
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 2,
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
    fontSize: 10,
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
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "#3a5a8a",
    backgroundColor: "rgba(58,90,138,0.18)",
  },
  chipTextSection: {
    fontSize: 10,
    fontWeight: "600",
    color: "#6b8fc7",
  },

  // ── States ─────────────────────────────────────────────────────────────────
  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing["4xl"],
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 19,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    marginTop: Spacing.xs,
  },
  retryText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
