import { useState, useCallback, useMemo, useRef, useEffect } from "react";
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
import { xtreamApi } from "@/lib/xtream-api";
import type { LiveStream } from "@/lib/xtream-api";
import SideMenuButton from "@/components/SideMenuButton";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const ACCENT = "#FF6600";
const BG_ROOT = "#080808";
const BG_CARD = "#141414";
const BG_CARD_ALT = "#1a1a1a";
const BORDER = "#252525";
const LIVE_GREEN = "#22c55e";
const SOON_AMBER = "#f59e0b";

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

// ── Non-linkable channel patterns ─────────────────────────────────────────────
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

// ── Time utilities ─────────────────────────────────────────────────────────────
function parseHHMM(t: string): number | null {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  return m ? +m[1] * 60 + +m[2] : null;
}

function ukNowMinutes(): number {
  const d = new Date();
  const h = +new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", hour12: false }).format(d);
  const min = +new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", minute: "2-digit" }).format(d);
  return h * 60 + min;
}

// ── Per-sport estimated durations (minutes) ───────────────────────────────────
// These are generous upper-bounds so we don't drop the LIVE badge too early.
// Without EPG we can't know the true end time, so we err on the side of
// keeping the badge on rather than dropping it prematurely.
const SPORT_DURATION: Array<[RegExp, number]> = [
  // ── Canonical keys (new) ──────────────────────────────────────────────────
  [/^football$/,          115], // 90 min + HT + stoppages
  [/^combat$/,            300], // undercard + main event
  [/^rugby$/,             100], // 80 min + HT + stoppages
  [/^motorsport$/,        200], // F1 race ~90m + formation/podium
  [/^darts$/,             120],
  [/^golf$/,              480], // round ~4-5h
  [/^cricket$/,           600], // all-day Tests / 50-over
  [/^tennis$/,            180], // best-of-3 ~3h
  [/^snooker$/,           360], // session can be 6h
  [/^ppv$/,               300],
  [/^us_sports$/,         210], // NFL ~3.5h; NBA/MLB/NHL similar
  [/^horse_racing$/,       30], // each race is short
  [/^athletics$/,         180],
  [/^olympics$/,          480],
  [/^cycling$/,           300], // grand tour stage ~4-5h
  [/^afl$/,               130],
  // ── Legacy fallbacks (old keys in DB before re-sync) ─────────────────────
  [/formula[_\s]?1/i,     200],
  [/formula[_\s]?[23]/i,  100],
  [/motogp/i,             120],
  [/nascar/i,             240],
  [/wrc|rally/i,          480],
  [/boxing/i,             300],
  [/ufc|mma/i,            300],
  [/wrestling|wwe|aew|bare.?knuckle/i, 240],
  [/rugby/i,              100],
  [/horse.?racing/i,       30],
  [/nfl|american.?football/i, 210],
  [/mlb|baseball/i,       210],
  [/nba|basketball/i,     150],
  [/nhl|ice.?hockey/i,    180],
  [/cycling/i,            300],
  [/athletics/i,          180],
  [/olympics/i,           480],
  [/cricket/i,            600],
  [/snooker|pool/i,       360],
  [/golf/i,               480],
  [/darts/i,              120],
  [/afl/i,                130],
];

const DEFAULT_DURATION = 120; // fallback for anything not in the list

function estimatedDuration(sportKey: string): number {
  for (const [pattern, mins] of SPORT_DURATION) {
    if (pattern.test(sportKey)) return mins;
  }
  return DEFAULT_DURATION;
}

type MatchStatus = "live" | "soon" | null;

function getMatchStatus(ukTime: string, sportKey = ""): MatchStatus {
  const mins = parseHHMM(ukTime);
  if (mins === null) return null;
  const now = ukNowMinutes();
  const diff = mins - now; // positive = future, negative = past
  const duration = estimatedDuration(sportKey);
  if (diff <= 0 && diff > -duration) return "live";
  if (diff > 0 && diff <= 30) return "soon";
  return null;
}

function isMatchLive(ukTime: string, sportKey = ""): boolean {
  return getMatchStatus(ukTime, sportKey) === "live";
}

// ── Sport sort order ──────────────────────────────────────────────────────────
// Canonical keys only — matches the approved sport list order.
const SPORT_SORT_ORDER = [
  "football",
  "combat",
  "rugby",
  "motorsport",
  "darts",
  "golf",
  "cricket",
  "tennis",
  "snooker",
  "ppv",
  "us_sports",
  "horse_racing",
  "athletics",
  "olympics",
  "cycling",
  "afl",
  "other",
];

function sportSortIndex(key: string): number {
  const k = key.toLowerCase();
  // Exact match (canonical keys)
  const exact = SPORT_SORT_ORDER.indexOf(k);
  if (exact !== -1) return exact;
  // Fuzzy fallback for any legacy keys still in the DB
  const fuzzy = SPORT_SORT_ORDER.findIndex((s) => k.startsWith(s) || s.startsWith(k));
  return fuzzy === -1 ? 997 : fuzzy;
}

// ── Sport icon map ─────────────────────────────────────────────────────────────
const SPORT_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  // Canonical keys
  football:     "target",
  combat:       "zap",
  rugby:        "activity",
  motorsport:   "zap",
  darts:        "crosshair",
  golf:         "flag",
  cricket:      "activity",
  tennis:       "activity",
  snooker:      "circle",
  ppv:          "star",
  us_sports:    "award",
  horse_racing: "wind",
  athletics:    "wind",
  olympics:     "award",
  cycling:      "wind",
  afl:          "activity",
  other:        "tv",
  // Legacy fallbacks (old DB rows before re-sync)
  formula_1:    "zap",
  formula_2:    "zap",
  formula_3:    "zap",
  motogp:       "zap",
  rally:        "zap",
  nascar:       "zap",
  boxing:       "zap",
  ufc:          "zap",
  mma:          "zap",
  wrestling:    "zap",
  rugby_league: "activity",
  rugby_union:  "activity",
  super_league: "activity",
  basketball:   "circle",
  nfl:          "award",
  nba:          "award",
  mlb:          "award",
  nhl:          "award",
};

function sportIcon(key: string): keyof typeof Feather.glyphMap {
  return SPORT_ICON[key.toLowerCase().replace(/\s+/g, "_")] ?? "tv";
}

// ── ChannelChip ────────────────────────────────────────────────────────────────
function ChannelChip({
  label, matched, onPress, isSection = false,
}: {
  label: string; matched: boolean; onPress?: () => void; isSection?: boolean;
}) {
  const [active, setActive] = useState(false);
  const pressProps = {
    onPressIn: () => setActive(true), onPressOut: () => setActive(false),
    onFocus: () => setActive(true), onBlur: () => setActive(false),
    onHoverIn: () => setActive(true), onHoverOut: () => setActive(false),
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
        active && matched && { borderColor: ACCENT, backgroundColor: "rgba(255,102,0,0.2)" },
      ]}
    >
      {matched ? (
        <Feather name="tv" size={8} color={active ? ACCENT : ACCENT} style={{ marginRight: 3 }} />
      ) : null}
      <ThemedText
        style={[styles.chipText, matched ? styles.chipTextMatched : styles.chipTextUnmatched]}
        numberOfLines={1}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

// ── MatchRow ───────────────────────────────────────────────────────────────────
function MatchRow({
  match, competition, sportKey, streams, onChannel, isFirst,
}: {
  match: SportMatch;
  competition: string;
  sportKey: string;
  streams: LiveStream[];
  onChannel: (s: LiveStream) => void;
  isFirst?: boolean;
}) {
  const status = getMatchStatus(match.uk_time, sportKey);

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
        const { displayLabel, linkable } = resolveChannelDisplay(ch);
        if (!linkable) continue;
        const s = findStream(ch, streams);
        if (s) { extraChip = { label: displayLabel, stream: s }; break; }
      }
    }
    return { resolved, extraChip };
  }, [match.uk_channels, streams]);

  return (
    <View style={[styles.matchRow, !isFirst && styles.matchRowBorder]}>
      {/* Time column */}
      <View style={styles.matchTimeCol}>
        <ThemedText style={[styles.matchTime, status === "live" && { color: LIVE_GREEN }]}>
          {match.uk_time || "TBC"}
        </ThemedText>
        {status === "live" ? (
          <View style={styles.statusBadgeLive}>
            <ThemedText style={styles.statusBadgeText}>LIVE</ThemedText>
          </View>
        ) : status === "soon" ? (
          <View style={styles.statusBadgeSoon}>
            <ThemedText style={styles.statusBadgeText}>SOON</ThemedText>
          </View>
        ) : null}
      </View>

      {/* Info column */}
      <View style={styles.matchInfo}>
        <ThemedText style={styles.matchTeams} numberOfLines={1}>{match.teams}</ThemedText>
        <ThemedText style={styles.matchComp} numberOfLines={1}>{competition}</ThemedText>
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

// ── SportCard ──────────────────────────────────────────────────────────────────
function SportCard({
  group, streams, onChannel, defaultExpanded,
}: {
  group: SportGroup;
  streams: LiveStream[];
  onChannel: (s: LiveStream) => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const [hovered, setHovered] = useState(false);

  const totalMatches = useMemo(
    () => group.competitions.reduce((n, c) => n + c.matches.length, 0),
    [group],
  );
  const liveCount = useMemo(
    () => group.competitions.reduce(
      (n, c) => n + c.matches.filter((m) => isMatchLive(m.uk_time, group.sport_key)).length, 0,
    ),
    [group],
  );

  const icon = sportIcon(group.sport_key);

  if (!expanded) {
    return (
      <Pressable
        onPress={() => setExpanded(true)}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={[styles.collapsedRow, hovered && styles.collapsedRowHover]}
      >
        <View style={styles.sportIconCircle}>
          <Feather name={icon} size={16} color="#fff" />
        </View>
        <View style={styles.collapsedMeta}>
          <ThemedText style={styles.collapsedLabel}>{group.sport_label}</ThemedText>
          <ThemedText style={styles.collapsedSub}>
            {totalMatches} event{totalMatches !== 1 ? "s" : ""} today
            {liveCount > 0 ? `  •  ${liveCount} live` : ""}
          </ThemedText>
        </View>
        <View style={styles.collapsedRight}>
          {liveCount > 0 ? (
            <View style={styles.liveDot} />
          ) : null}
          <View style={styles.countBadge}>
            <ThemedText style={styles.countBadgeText}>{totalMatches} EVENTS</ThemedText>
          </View>
          <Feather name="chevron-right" size={16} color={Colors.dark.textSecondary} style={{ marginLeft: 8 }} />
        </View>
      </Pressable>
    );
  }

  // Expanded card
  return (
    <View style={styles.expandedCard}>
      {/* Expanded header */}
      <Pressable
        onPress={() => setExpanded(false)}
        style={styles.expandedHeader}
      >
        <View style={styles.sportIconCircle}>
          <Feather name={icon} size={16} color="#fff" />
        </View>
        <View style={styles.expandedHeaderMeta}>
          <ThemedText style={styles.collapsedLabel}>{group.sport_label}</ThemedText>
          {group.competitions.length === 1 ? (
            <ThemedText style={styles.expandedCompLabel}>{group.competitions[0].name}</ThemedText>
          ) : null}
        </View>
        <View style={styles.expandedHeaderRight}>
          {liveCount > 0 ? (
            <View style={styles.liveCountBadge}>
              <View style={styles.liveDotSm} />
              <ThemedText style={styles.liveCountText}>{liveCount} LIVE</ThemedText>
            </View>
          ) : null}
          <View style={styles.eventCountBadge}>
            <ThemedText style={styles.eventCountText}>{totalMatches} EVENTS TODAY</ThemedText>
          </View>
          <Feather name="chevron-up" size={16} color={Colors.dark.textSecondary} style={{ marginLeft: 10 }} />
        </View>
      </Pressable>

      {/* Matches */}
      <View style={styles.expandedBody}>
        {group.competitions.map((comp, ci) =>
          comp.matches.map((match, mi) => (
            <MatchRow
              key={`${ci}-${mi}`}
              match={match}
              competition={comp.name}
              sportKey={group.sport_key}
              streams={streams}
              onChannel={onChannel}
              isFirst={ci === 0 && mi === 0}
            />
          ))
        )}
      </View>
    </View>
  );
}

// ── Stats strip ────────────────────────────────────────────────────────────────
function StatsStrip({
  totalEvents, totalSports, nextUp,
}: {
  totalEvents: number;
  totalSports: number;
  nextUp: { teams: string; time: string } | null;
}) {
  return (
    <View style={styles.statsStrip}>
      <View style={styles.statBox}>
        <Feather name="tv" size={16} color={ACCENT} />
        <ThemedText style={styles.statNum}>{totalEvents}</ThemedText>
        <ThemedText style={styles.statLabel}>Events</ThemedText>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statBox}>
        <Feather name="grid" size={16} color={ACCENT} />
        <ThemedText style={styles.statNum}>{totalSports}</ThemedText>
        <ThemedText style={styles.statLabel}>Sports</ThemedText>
      </View>
      {nextUp ? (
        <>
          <View style={styles.statDivider} />
          <View style={[styles.statBox, styles.statBoxNext]}>
            <Feather name="clock" size={14} color={ACCENT} style={{ marginRight: 6 }} />
            <View>
              <ThemedText style={styles.statNextLabel}>Next Up</ThemedText>
              <ThemedText style={styles.statNextTeams} numberOfLines={1}>{nextUp.teams}</ThemedText>
              <ThemedText style={[styles.statNextTime, { color: ACCENT }]}>{nextUp.time}</ThemedText>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

// ── Disclaimer ─────────────────────────────────────────────────────────────────
function DisclaimerBanner() {
  return (
    <View style={styles.disclaimer}>
      <Feather name="info" size={12} color="#b89a30" style={{ marginRight: 6, flexShrink: 0 }} />
      <ThemedText style={styles.disclaimerText}>
        TV channel information may not always be accurate. Please check official broadcaster websites for precise scheduling.
      </ThemedText>
    </View>
  );
}

// ── Sport filter tabs ──────────────────────────────────────────────────────────
function FilterTabs({
  sports, selected, onSelect, hasLive,
}: {
  sports: SportGroup[];
  selected: string;
  onSelect: (key: string) => void;
  hasLive: boolean;
}) {
  const tabs: Array<{ key: string; label: string; icon: keyof typeof Feather.glyphMap }> = [
    { key: "all", label: "All Sports", icon: "grid" },
    ...(hasLive ? [{ key: "live", label: "Live Now", icon: "radio" as keyof typeof Feather.glyphMap }] : []),
    ...sports.map((g) => ({ key: g.sport_key, label: g.sport_label, icon: sportIcon(g.sport_key) })),
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterScroll}
      contentContainerStyle={styles.filterContent}
      keyboardShouldPersistTaps="handled"
    >
      {tabs.map((tab) => {
        const active = selected === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onSelect(tab.key)}
            style={[styles.filterTab, active && styles.filterTabActive]}
          >
            <Feather
              name={tab.icon}
              size={12}
              color={active ? "#fff" : Colors.dark.textSecondary}
              style={{ marginRight: 5 }}
            />
            <ThemedText style={[styles.filterTabText, active && styles.filterTabTextActive]}>
              {tab.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function SportListingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { liveStreams } = useData();

  const [listings, setListings] = useState<SportGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sportFilter, setSportFilter] = useState("all");
  const [clockStr, setClockStr] = useState("");
  const inputRef = useRef<TextInput>(null);

  // Live UK clock (HH:MM)
  useEffect(() => {
    const fmt = () =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date());
    setClockStr(fmt());
    const id = setInterval(() => setClockStr(fmt()), 30_000);
    return () => clearInterval(id);
  }, []);

  const todayLong = useMemo(() =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date()),
  []);

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

  const handleChannel = useCallback((stream: LiveStream) => {
    navigation.navigate("LivePreview", {
      streamId: stream.stream_id,
      name: stream.name,
      streamUrl: xtreamApi.getLiveStreamUrl(stream.stream_id),
      thumbnail: stream.stream_icon ?? undefined,
      streamIcon: stream.stream_icon ?? undefined,
    });
  }, [navigation]);

  // ── Computed stats ───────────────────────────────────────────────────────────
  const { totalEvents, totalSports, nextUp, hasLive } = useMemo(() => {
    let totalEvents = 0;
    let hasLive = false;
    let nextUp: { teams: string; time: string } | null = null;
    const now = ukNowMinutes();
    let bestDiff = Infinity;

    for (const g of listings) {
      for (const comp of g.competitions) {
        for (const m of comp.matches) {
          totalEvents++;
          if (isMatchLive(m.uk_time, g.sport_key)) hasLive = true;
          const mins = parseHHMM(m.uk_time);
          if (mins !== null) {
            const diff = mins - now;
            if (diff > 0 && diff < bestDiff) {
              bestDiff = diff;
              nextUp = { teams: m.teams, time: m.uk_time };
            }
          }
        }
      }
    }
    return { totalEvents, totalSports: listings.length, nextUp, hasLive };
  }, [listings]);

  // ── Filtering ────────────────────────────────────────────────────────────────
  const q = query.trim().toLowerCase();
  const isSearching = q.length > 0;

  const filteredListings = useMemo<SportGroup[]>(() => {
    let result = [...listings].sort(
      (a, b) => sportSortIndex(a.sport_key) - sportSortIndex(b.sport_key),
    );

    // Sport filter
    if (sportFilter === "live") {
      result = result
        .map((g) => ({
          ...g,
          competitions: g.competitions
            .map((c) => ({ ...c, matches: c.matches.filter((m) => isMatchLive(m.uk_time, g.sport_key)) }))
            .filter((c) => c.matches.length > 0),
        }))
        .filter((g) => g.competitions.length > 0);
    } else if (sportFilter !== "all") {
      result = result.filter((g) => g.sport_key === sportFilter);
    }

    // Search filter
    if (!q) return result;
    return result
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
  }, [listings, sportFilter, q]);

  const totalFiltered = useMemo(
    () => filteredListings.reduce((n, g) => n + g.competitions.reduce((m, c) => m + c.matches.length, 0), 0),
    [filteredListings],
  );

  const pt = insets.top + Spacing.sm;
  const pb = insets.bottom + Spacing["2xl"];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: pt }]}>

      {/* ── Top header ── */}
      <View style={styles.topBar}>
        <SideMenuButton />
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <Feather name="arrow-left" size={18} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.topBarCenter}>
          <View style={styles.pageTitleRow}>
            <ThemedText style={styles.pageTitle}>Sports on TV</ThemedText>
            <View style={styles.todayBadge}>
              <ThemedText style={styles.todayBadgeText}>TODAY</ThemedText>
            </View>
          </View>
          <ThemedText style={styles.pageSubtitle}>
            {todayLong}  •  Live and upcoming TV coverage
          </ThemedText>
        </View>
        <View style={styles.topBarRight}>
          {clockStr ? <ThemedText style={styles.clockText}>{clockStr}</ThemedText> : null}
          <Pressable
            onPress={fetchListings}
            style={[styles.refreshBtn, loading && { opacity: 0.4 }]}
            disabled={loading}
            hitSlop={8}
          >
            <Feather name="refresh-cw" size={13} color={Colors.dark.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* ── Stats + disclaimer (only when data loaded) ── */}
      {!loading && !error && listings.length > 0 ? (
        <>
          <StatsStrip totalEvents={totalEvents} totalSports={totalSports} nextUp={nextUp} />
          <DisclaimerBanner />
        </>
      ) : null}

      {/* ── Search bar ── */}
      {!loading && !error && listings.length > 0 ? (
        <View style={styles.searchWrap}>
          <Pressable style={styles.searchBar} onPress={() => inputRef.current?.focus()}>
            <Feather name="search" size={14} color={Colors.dark.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Search teams, channels, sports…"
              placeholderTextColor={Colors.dark.textSecondary}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              {...(Platform.OS === "web" ? { outlineStyle: "none" } as any : {})}
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery("")} style={styles.clearBtn} hitSlop={8}>
                <Feather name="x" size={12} color={Colors.dark.textSecondary} />
              </Pressable>
            ) : null}
          </Pressable>
          {isSearching ? (
            <ThemedText style={styles.resultCount}>
              {totalFiltered === 0 ? "No results" : `${totalFiltered} match${totalFiltered !== 1 ? "es" : ""}`}
            </ThemedText>
          ) : null}
        </View>
      ) : null}

      {/* ── Filter tabs ── */}
      {!loading && !error && listings.length > 0 ? (
        <FilterTabs
          sports={listings}
          selected={sportFilter}
          onSelect={(k) => { setSportFilter(k); setQuery(""); }}
          hasLive={hasLive}
        />
      ) : null}

      {/* ── Content ── */}
      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={ACCENT} size="large" />
          <ThemedText style={styles.emptySubtitle}>Loading listings…</ThemedText>
        </View>
      ) : error ? (
        <View style={styles.centre}>
          <Feather name="wifi-off" size={38} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.emptyTitle}>Could not load</ThemedText>
          <ThemedText style={styles.emptySubtitle}>{error}</ThemedText>
          <Pressable style={styles.retryBtn} onPress={fetchListings}>
            <Feather name="refresh-cw" size={12} color={ACCENT} style={{ marginRight: 5 }} />
            <ThemedText style={[styles.retryText, { color: ACCENT }]}>Try again</ThemedText>
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
      ) : filteredListings.length === 0 ? (
        <View style={styles.centre}>
          <Feather name="search" size={36} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.emptyTitle}>No results</ThemedText>
          <ThemedText style={styles.emptySubtitle}>
            {sportFilter === "live" ? "No events are live right now." : "Try a different search term."}
          </ThemedText>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: pb }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {filteredListings.map((group, i) => (
            <SportCard
              key={group.sport_key}
              group={group}
              streams={liveStreams}
              onChannel={handleChannel}
              defaultExpanded={i === 0 || isSearching || sportFilter !== "all"}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_ROOT },

  // ── Top bar ──────────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  backBtn: {
    width: 36, height: 36,
    borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: BORDER,
    alignItems: "center", justifyContent: "center",
    backgroundColor: BG_CARD, flexShrink: 0, marginTop: 2,
  },
  topBarCenter: { flex: 1 },
  pageTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pageTitle: {
    fontSize: 22, fontWeight: "800", color: Colors.dark.text, letterSpacing: -0.3,
  },
  todayBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: ACCENT,
  },
  todayBadgeText: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },
  pageSubtitle: {
    fontSize: 12, color: Colors.dark.textSecondary, marginTop: 3,
  },
  topBarRight: { alignItems: "flex-end", gap: 2, flexShrink: 0 },
  clockText: { fontSize: 20, fontWeight: "700", color: Colors.dark.text, fontVariant: ["tabular-nums"] },
  refreshBtn: {
    width: 30, height: 30,
    borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: BORDER,
    alignItems: "center", justifyContent: "center",
    backgroundColor: BG_CARD, marginTop: 4,
  },

  // ── Stats strip ───────────────────────────────────────────────────────────────
  statsStrip: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: BORDER,
    backgroundColor: BG_CARD,
    overflow: "hidden",
  },
  statBox: {
    flex: 1, flexDirection: "row", alignItems: "center",
    paddingVertical: 10, paddingHorizontal: Spacing.md, gap: 6,
  },
  statBoxNext: { flex: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: BORDER },
  statNum: { fontSize: 20, fontWeight: "800", color: Colors.dark.text },
  statLabel: { fontSize: 11, color: Colors.dark.textSecondary },
  statNextLabel: { fontSize: 10, color: Colors.dark.textSecondary, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  statNextTeams: { fontSize: 12, fontWeight: "700", color: Colors.dark.text, maxWidth: 180 },
  statNextTime: { fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] },

  // ── Disclaimer ────────────────────────────────────────────────────────────────
  disclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(184,154,48,0.3)",
    backgroundColor: "rgba(184,154,48,0.08)",
  },
  disclaimerText: { fontSize: 11, color: "#b89a30", lineHeight: 16, flex: 1 },

  // ── Search ────────────────────────────────────────────────────────────────────
  searchWrap: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: 4,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BG_CARD,
    borderWidth: 1, borderColor: BORDER,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: 42,
  },
  searchInput: {
    flex: 1, fontSize: 14, color: Colors.dark.text,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } as any : {}),
  },
  clearBtn: {
    width: 20, height: 20,
    alignItems: "center", justifyContent: "center",
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundTertiary,
    marginLeft: 4,
  },
  resultCount: { fontSize: 11, color: Colors.dark.textSecondary, paddingLeft: 4 },

  // ── Filter tabs ───────────────────────────────────────────────────────────────
  filterScroll: { flexGrow: 0, marginBottom: Spacing.sm },
  filterContent: { paddingHorizontal: Spacing.lg, gap: 6, flexDirection: "row" },
  filterTab: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: BORDER,
    backgroundColor: BG_CARD,
  },
  filterTabActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  filterTabText: { fontSize: 12, fontWeight: "600", color: Colors.dark.textSecondary },
  filterTabTextActive: { color: "#fff" },

  // ── Scroll ────────────────────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: 2, gap: 2 },

  // ── Collapsed row ─────────────────────────────────────────────────────────────
  collapsedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    backgroundColor: BG_CARD,
    borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: BORDER,
    gap: Spacing.md,
  },
  collapsedRowHover: { backgroundColor: BG_CARD_ALT },
  sportIconCircle: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: ACCENT,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  collapsedMeta: { flex: 1, gap: 2 },
  collapsedLabel: { fontSize: 15, fontWeight: "700", color: Colors.dark.text },
  collapsedSub: { fontSize: 11, color: Colors.dark.textSecondary },
  collapsedRight: { flexDirection: "row", alignItems: "center", flexShrink: 0 },
  liveDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: LIVE_GREEN, marginRight: 8,
  },
  countBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  countBadgeText: { fontSize: 10, fontWeight: "700", color: Colors.dark.textSecondary },

  // ── Expanded card ─────────────────────────────────────────────────────────────
  expandedCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: ACCENT + "55",
    backgroundColor: BG_CARD,
    overflow: "hidden",
    borderLeftWidth: 3, borderLeftColor: ACCENT,
  },
  expandedHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    gap: Spacing.md,
    backgroundColor: "rgba(255,102,0,0.06)",
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  sportIconCircleLg: {
    width: 48, height: 48,
    borderRadius: 24,
    backgroundColor: ACCENT,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  expandedHeaderMeta: { flex: 1, gap: 3 },
  expandedSportLabel: { fontSize: 18, fontWeight: "800", color: Colors.dark.text },
  expandedCompLabel: { fontSize: 13, color: ACCENT, fontWeight: "600" },
  expandedHeaderRight: { flexDirection: "row", alignItems: "center", flexShrink: 0, gap: 8 },
  liveCountBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(34,197,94,0.15)",
    borderWidth: 1, borderColor: "rgba(34,197,94,0.3)",
  },
  liveDotSm: { width: 6, height: 6, borderRadius: 3, backgroundColor: LIVE_GREEN },
  liveCountText: { fontSize: 10, fontWeight: "700", color: LIVE_GREEN },
  eventCountBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,102,0,0.15)",
    borderWidth: 1, borderColor: "rgba(255,102,0,0.3)",
  },
  eventCountText: { fontSize: 10, fontWeight: "700", color: ACCENT },

  // ── Match body ────────────────────────────────────────────────────────────────
  expandedBody: {},
  matchRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  matchRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER },
  matchTimeCol: { width: 58, alignItems: "center", flexShrink: 0, gap: 4 },
  matchTime: {
    fontSize: 16, fontWeight: "800", color: ACCENT,
    fontVariant: ["tabular-nums"], textAlign: "center",
  },
  statusBadgeLive: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    backgroundColor: LIVE_GREEN,
  },
  statusBadgeSoon: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    backgroundColor: SOON_AMBER,
  },
  statusBadgeText: { fontSize: 8, fontWeight: "800", color: "#000" },
  matchInfo: { flex: 1, gap: 3 },
  matchTeams: { fontSize: 14, fontWeight: "700", color: Colors.dark.text },
  matchComp: { fontSize: 11, color: Colors.dark.textSecondary },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },

  // ── Chips ─────────────────────────────────────────────────────────────────────
  chip: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: BorderRadius.full, borderWidth: 1,
  },
  chipMatched: {
    borderColor: ACCENT + "88",
    backgroundColor: "rgba(255,102,0,0.12)",
  },
  chipUnmatched: {
    borderColor: BORDER,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  chipText: { fontSize: 11, fontWeight: "600" },
  chipTextMatched: { color: ACCENT },
  chipTextUnmatched: { color: Colors.dark.textSecondary },
  chipSection: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: BorderRadius.full, borderWidth: 1,
    borderColor: "#3a5a8a",
    backgroundColor: "rgba(58,90,138,0.18)",
  },
  chipTextSection: { fontSize: 11, fontWeight: "600", color: "#6b8fc7" },

  // ── States ────────────────────────────────────────────────────────────────────
  centre: {
    flex: 1, alignItems: "center", justifyContent: "center",
    padding: Spacing["4xl"], gap: Spacing.md,
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: Colors.dark.text, textAlign: "center" },
  emptySubtitle: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center", lineHeight: 19 },
  retryBtn: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: ACCENT + "66",
    marginTop: Spacing.xs,
  },
  retryText: { fontSize: 13, fontWeight: "600" },
});
