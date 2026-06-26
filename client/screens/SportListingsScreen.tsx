import { useState, useCallback, useMemo, useRef, useEffect, createContext, useContext, memo } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
  Animated,
  Easing,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
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

// ── Module-level listings cache (survives screen unmounts, instant revisits) ───
let _listingsCache: SportGroup[] = [];
let _cacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;
const ASYNC_STORAGE_KEY = "sports_listings_cache_v1";
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
    // norm() strips "+", which makes "ITV 1" and "ITV +1" look identical (both
    // become "itv1").  When a stream name contains "+" but the query does not,
    // the score-3 exact match is spurious — demote it to 2 so the quality-tier
    // tiebreaker (FHD > HD > plain) picks the right stream.
    if (
      matchScore === 3 &&
      s.name.includes("+") &&
      !variants.some((v) => v.includes("+"))
    ) {
      matchScore = 2;
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

// ── Channel-conflict resolution ────────────────────────────────────────────────
// If two live matches share the same channel, only the one with the LATEST
// start time is considered "live" on that channel.  We track which match keys
// "own" at least one channel via a React context so MatchRow can suppress the
// LIVE badge without prop-drilling through three component layers.
const LiveOwnersCtx = createContext<Set<string>>(new Set());

function computeLiveOwners(groups: SportGroup[]): Set<string> {
  // channel (lower-cased) → { timeMins, matchKey }
  const channelOwner = new Map<string, { timeMins: number; key: string }>();
  for (const group of groups) {
    for (const comp of group.competitions) {
      for (const match of comp.matches) {
        if (!isMatchLive(match.uk_time, group.sport_key)) continue;
        const timeMins = parseHHMM(match.uk_time) ?? 0;
        const key = `${match.uk_time}|${match.teams}`;
        for (const ch of match.uk_channels) {
          const normCh = ch.toLowerCase().trim();
          const existing = channelOwner.get(normCh);
          if (!existing || timeMins > existing.timeMins) {
            channelOwner.set(normCh, { timeMins, key });
          }
        }
      }
    }
  }
  // Collect all winning match keys
  return new Set(Array.from(channelOwner.values()).map((v) => v.key));
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
const ChannelChip = memo(function ChannelChip({
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
        active && matched && styles.chipMatchedActive,
        active && !matched && styles.chipUnmatchedActive,
      ]}
    >
      {matched ? (
        <Feather name="tv" size={8} color={active ? "#fff" : ACCENT} style={{ marginRight: 3 }} />
      ) : null}
      <ThemedText
        style={[
          styles.chipText,
          matched ? styles.chipTextMatched : styles.chipTextUnmatched,
          active && matched && { color: "#fff" },
          active && !matched && { color: Colors.dark.text },
        ]}
        numberOfLines={1}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
});

// ── CompetitionSection ─────────────────────────────────────────────────────────
const CompetitionSection = memo(function CompetitionSection({
  comp, sportKey, streams, onChannel, defaultExpanded,
}: {
  comp: { name: string; matches: SportMatch[] };
  sportKey: string;
  streams: LiveStream[];
  onChannel: (s: LiveStream) => void;
  defaultExpanded?: boolean;
}) {
  const accent = ACCENT;
  const [open, setOpen] = useState(defaultExpanded !== false);
  const [compHovered, setCompHovered] = useState(false);
  const liveOwners = useContext(LiveOwnersCtx);
  const liveCount = comp.matches.filter((m) => {
    if (!isMatchLive(m.uk_time, sportKey)) return false;
    if (m.uk_channels.length === 0) return true;
    return liveOwners.has(`${m.uk_time}|${m.teams}`);
  }).length;

  return (
    <View style={styles.compSection}>
      <Pressable
        style={[styles.compHeader, compHovered && styles.compHeaderHover]}
        onPress={() => setOpen((v) => !v)}
        onHoverIn={() => setCompHovered(true)}
        onHoverOut={() => setCompHovered(false)}
        onFocus={() => setCompHovered(true)}
        onBlur={() => setCompHovered(false)}
      >
        <View style={styles.compHeaderLeft}>
          <View style={[styles.compAccentBar, { backgroundColor: accent }]} />
          <ThemedText style={styles.compHeaderLabel} numberOfLines={1}>{comp.name}</ThemedText>
        </View>
        <View style={styles.compHeaderRight}>
          {liveCount > 0 ? (
            <View style={styles.compLiveBadge}>
              <View style={styles.liveDotSm} />
              <ThemedText style={styles.compLiveText}>{liveCount} LIVE</ThemedText>
            </View>
          ) : null}
          <ThemedText style={styles.compMatchCount}>
            {comp.matches.length} match{comp.matches.length !== 1 ? "es" : ""}
          </ThemedText>
          <Feather
            name={open ? "chevron-up" : "chevron-down"}
            size={13}
            color={Colors.dark.textSecondary}
            style={{ marginLeft: 8 }}
          />
        </View>
      </Pressable>
      {open ? (
        <View style={styles.compBody}>
          {comp.matches.map((match, mi) => (
            <MatchRow
              key={mi}
              match={match}
              competition={comp.name}
              sportKey={sportKey}
              streams={streams}
              onChannel={onChannel}
              isFirst={mi === 0}
              hideCompetitionLabel
            />
          ))}
        </View>
      ) : null}
    </View>
  );
});

// ── MatchRow ───────────────────────────────────────────────────────────────────
const MatchRow = memo(function MatchRow({
  match, competition, sportKey, streams, onChannel, isFirst, hideCompetitionLabel,
}: {
  match: SportMatch;
  competition: string;
  sportKey: string;
  streams: LiveStream[];
  onChannel: (s: LiveStream) => void;
  isFirst?: boolean;
  hideCompetitionLabel?: boolean;
}) {
  const rawStatus = getMatchStatus(match.uk_time, sportKey);
  const liveOwners = useContext(LiveOwnersCtx);
  const matchKey = `${match.uk_time}|${match.teams}`;
  // If another match with a later start time is live on the same channel,
  // suppress this match's LIVE badge (it's been "replaced" on that channel).
  const status: MatchStatus =
    rawStatus === "live" && match.uk_channels.length > 0 && !liveOwners.has(matchKey)
      ? null
      : rawStatus;

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
        {!hideCompetitionLabel ? (
          <ThemedText style={styles.matchComp} numberOfLines={1}>{competition}</ThemedText>
        ) : null}
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
});

// ── SportCard ──────────────────────────────────────────────────────────────────
const SportCard = memo(function SportCard({
  group, streams, onChannel, expanded, onExpand, onCollapse, isFocusTarget,
}: {
  group: SportGroup;
  streams: LiveStream[];
  onChannel: (s: LiveStream) => void;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  isFocusTarget?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [headerHovered, setHeaderHovered] = useState(false);
  const [expanding, setExpanding] = useState(false);

  // Reset expanding flag whenever the card actually becomes expanded or collapses
  useEffect(() => { setExpanding(false); }, [expanded]);

  const totalMatches = useMemo(
    () => group.competitions.reduce((n, c) => n + c.matches.length, 0),
    [group],
  );
  const liveOwners = useContext(LiveOwnersCtx);
  const liveCount = useMemo(
    () => group.competitions.reduce(
      (n, c) => n + c.matches.filter((m) => {
        if (!isMatchLive(m.uk_time, group.sport_key)) return false;
        if (m.uk_channels.length === 0) return true;
        return liveOwners.has(`${m.uk_time}|${m.teams}`);
      }).length, 0,
    ),
    [group, liveOwners],
  );

  const icon = sportIcon(group.sport_key);

  if (!expanded) {
    return (
      <Pressable
        onPress={() => {
          if (expanding) return;
          setExpanding(true);
          // Let the spinner render first, then trigger the expand
          setTimeout(() => onExpand(), 30);
        }}
        hasTVPreferredFocus={isFocusTarget && Platform.OS !== "web"}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
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
          {expanding ? (
            <ActivityIndicator size="small" color={ACCENT} style={{ marginLeft: 8, width: 20 }} />
          ) : (
            <Feather name="chevron-right" size={16} color={Colors.dark.textSecondary} style={{ marginLeft: 8 }} />
          )}
        </View>
      </Pressable>
    );
  }

  // Expanded card
  return (
    <View style={styles.expandedCard}>
      {/* Expanded header */}
      <Pressable
        onPress={onCollapse}
        hasTVPreferredFocus={isFocusTarget && Platform.OS !== "web"}
        onHoverIn={() => setHeaderHovered(true)}
        onHoverOut={() => setHeaderHovered(false)}
        onFocus={() => setHeaderHovered(true)}
        onBlur={() => setHeaderHovered(false)}
        style={[styles.expandedHeader, headerHovered && styles.expandedHeaderHover]}
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

      {/* Matches — sub-categories when multiple competitions exist */}
      <View style={styles.expandedBody}>
        {group.competitions.length > 1 ? (
          group.competitions.map((comp, ci) => (
            <CompetitionSection
              key={ci}
              comp={comp}
              sportKey={group.sport_key}
              streams={streams}
              onChannel={onChannel}
              defaultExpanded
            />
          ))
        ) : (
          group.competitions.flatMap((comp, ci) =>
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
          )
        )}
      </View>
    </View>
  );
});

// ── Loading bar ────────────────────────────────────────────────────────────────
const TRACK_W = 280;
const STRIP_W = 100;

const loadBarStyles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  icon: { marginBottom: 18 },
  label: { fontSize: 16, fontWeight: "700", color: Colors.dark.text, textAlign: "center", marginBottom: 20 },
  track: { width: TRACK_W, height: 5, borderRadius: 3, backgroundColor: BORDER, overflow: "hidden" },
  strip: { position: "absolute", left: 0, top: 0, width: STRIP_W, height: "100%", borderRadius: 3, backgroundColor: ACCENT },
  sub: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: 14 },
});

const LoadingBar = memo(function LoadingBar({ label }: { label: string }) {
  const pos = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    pos.setValue(0);
    const loop = Animated.loop(
      Animated.timing(pos, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pos]);
  const translateX = pos.interpolate({
    inputRange: [0, 1],
    outputRange: [-STRIP_W, TRACK_W],
  });
  return (
    <View style={loadBarStyles.wrap}>
      <Feather name="calendar" size={32} color={ACCENT} style={loadBarStyles.icon} />
      <ThemedText style={loadBarStyles.label}>{label}</ThemedText>
      <View style={loadBarStyles.track}>
        <Animated.View style={[loadBarStyles.strip, { transform: [{ translateX }] }]} />
      </View>
      <ThemedText style={loadBarStyles.sub}>This may take a moment…</ThemedText>
    </View>
  );
});

// ── Sport filter tabs ──────────────────────────────────────────────────────────
type FilterTab = { key: string; label: string; icon: keyof typeof Feather.glyphMap };

const FilterTabItem = memo(function FilterTabItem({
  tab, active, onSelect, isLoading,
}: { tab: FilterTab; active: boolean; onSelect: (key: string) => void; isLoading?: boolean }) {
  const [lit, setLit] = useState(false);
  const isLit = active || lit;
  return (
    <Pressable
      onPress={() => onSelect(tab.key)}
      onFocus={() => setLit(true)}
      onBlur={() => setLit(false)}
      onHoverIn={() => setLit(true)}
      onHoverOut={() => setLit(false)}
      onPressIn={() => setLit(true)}
      onPressOut={() => setLit(false)}
      style={[
        styles.filterTab,
        active && styles.filterTabActive,
        !active && lit && styles.filterTabHover,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color="#fff" style={{ marginRight: 5, width: 12, height: 12 }} />
      ) : (
        <Feather
          name={tab.icon}
          size={12}
          color={isLit ? "#fff" : Colors.dark.textSecondary}
          style={{ marginRight: 5 }}
        />
      )}
      <ThemedText style={[styles.filterTabText, isLit && styles.filterTabTextActive]}>
        {tab.label}
      </ThemedText>
    </Pressable>
  );
});

function FilterTabs({
  sports, selected, onSelect, hasLive, loadingKey,
}: {
  sports: SportGroup[];
  selected: string;
  onSelect: (key: string) => void;
  hasLive: boolean;
  loadingKey: string | null;
}) {
  const tabs: FilterTab[] = [
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
      {tabs.map((tab) => (
        <FilterTabItem
          key={tab.key}
          tab={tab}
          active={selected === tab.key}
          onSelect={onSelect}
          isLoading={loadingKey === tab.key}
        />
      ))}
    </ScrollView>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function SportListingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { liveStreams } = useData();

  const [listings, setListings] = useState<SportGroup[]>(_listingsCache);
  const [loading, setLoading] = useState(_listingsCache.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sportFilter, setSportFilter] = useState("all");
  const [expandedSportKey, setExpandedSportKey] = useState<string | null>(null);
  const [justToggledKey, setJustToggledKey] = useState<string | null>(null);
  const toggleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filterLoadingKey, setFilterLoadingKey] = useState<string | null>(null);
  const filterLoadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [clockStr, setClockStr] = useState("");
  const inputRef = useRef<TextInput>(null);

  // TV-remote / hover focus state for header controls
  const [backFocused, setBackFocused] = useState(false);
  const [refreshFocused, setRefreshFocused] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [clearFocused, setClearFocused] = useState(false);

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

  const fetchListings = useCallback(async (force = false) => {
    const hasCache = _listingsCache.length > 0;

    if (hasCache && !force) {
      // Serve from cache as long as it was populated on today's UK calendar date.
      // Once it's a new day the next page-load will fetch fresh automatically.
      const cachedDate = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date(_cacheAt));
      const todayDate = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date());
      if (cachedDate === todayDate) {
        setListings(_listingsCache);
        setLoading(false);
        return;
      }
    }

    // No cache, new UK day, or forced refresh (refresh button) → show loading bar
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/sports/listings", getApiUrl());
      const r = await fetch(url.toString());
      if (!r.ok) throw new Error(`Server error ${r.status}`);
      const data = await r.json();
      const arr = Array.isArray(data) ? data : [];
      _listingsCache = arr;
      _cacheAt = Date.now();
      setListings(arr);
      AsyncStorage.setItem(
        ASYNC_STORAGE_KEY,
        JSON.stringify({ data: arr, cachedAt: _cacheAt }),
      ).catch(() => {});
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  // Hydrate from AsyncStorage on first mount (cross-session persistence)
  useEffect(() => {
    if (_listingsCache.length > 0) return;
    AsyncStorage.getItem(ASYNC_STORAGE_KEY).then((raw) => {
      if (!raw) return;
      if (_listingsCache.length > 0) return; // network already loaded
      try {
        const { data, cachedAt } = JSON.parse(raw);
        if (Array.isArray(data) && data.length > 0) {
          _listingsCache = data;
          _cacheAt = cachedAt ?? 0;
          setListings(data);
          setLoading(false);
        }
      } catch {}
    }).catch(() => {});
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

  // ── Channel ownership (computed from full listings so "live" filter uses it) ──
  const liveOwners = useMemo(() => computeLiveOwners(listings), [listings]);

  // Helper: is this match effectively live (owns at least one channel) ──────────
  const isEffLive = useCallback(
    (m: SportMatch, sportKey: string) => {
      if (!isMatchLive(m.uk_time, sportKey)) return false;
      if (m.uk_channels.length === 0) return true;
      return liveOwners.has(`${m.uk_time}|${m.teams}`);
    },
    [liveOwners],
  );

  // ── Computed stats ───────────────────────────────────────────────────────────
  const { totalEvents, totalSports, nextUp, hasLive } = useMemo(() => {
    let totalEvents = 0;
    let hasLive = false;
    let nextUp: { teams: string; time: string; sport: string; channel: string | null } | null = null;
    const now = ukNowMinutes();
    let bestDiff = Infinity;

    for (const g of listings) {
      for (const comp of g.competitions) {
        for (const m of comp.matches) {
          totalEvents++;
          if (isEffLive(m, g.sport_key)) hasLive = true;
          const mins = parseHHMM(m.uk_time);
          if (mins !== null) {
            const diff = mins - now;
            if (diff > 0 && diff < bestDiff) {
              bestDiff = diff;
              const firstLinkable = m.uk_channels.find(
                (ch) => resolveChannelDisplay(ch).linkable,
              );
              nextUp = {
                teams: m.teams,
                time: m.uk_time,
                sport: g.sport_label,
                channel: firstLinkable
                  ? resolveChannelDisplay(firstLinkable).displayLabel
                  : m.uk_channels[0] ?? null,
              };
            }
          }
        }
      }
    }
    return { totalEvents, totalSports: listings.length, nextUp, hasLive };
  }, [listings, isEffLive]);

  // ── Filtering ────────────────────────────────────────────────────────────────
  const q = query.trim().toLowerCase();
  const isSearching = q.length > 0;

  const filteredListings = useMemo<SportGroup[]>(() => {
    let result = [...listings].sort(
      (a, b) => sportSortIndex(a.sport_key) - sportSortIndex(b.sport_key),
    );

    // Sport filter — "live" uses effective ownership so displaced matches are excluded
    if (sportFilter === "live") {
      result = result
        .map((g) => ({
          ...g,
          competitions: g.competitions
            .map((c) => ({ ...c, matches: c.matches.filter((m) => isEffLive(m, g.sport_key)) }))
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

      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <SideMenuButton />
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          onFocus={() => setBackFocused(true)}
          onBlur={() => setBackFocused(false)}
          onHoverIn={() => setBackFocused(true)}
          onHoverOut={() => setBackFocused(false)}
          style={[styles.backBtn, backFocused && styles.iconBtnFocus]}
        >
          <Feather name="arrow-left" size={18} color={Colors.dark.text} />
        </Pressable>
        {/* Compact title + badge */}
        <View style={styles.topBarTitle}>
          <ThemedText style={styles.pageTitle}>Sports on TV</ThemedText>
          <View style={styles.todayBadge}>
            <ThemedText style={styles.todayBadgeText}>TODAY</ThemedText>
          </View>
        </View>
        {/* Inline search — only when data is present */}
        {!loading && !error && listings.length > 0 ? (
          <View style={styles.headerSearchWrap}>
            <Pressable
              style={[styles.headerSearchBar, searchFocused && styles.searchBarFocus]}
              onPress={() => inputRef.current?.focus()}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onHoverIn={() => setSearchFocused(true)}
              onHoverOut={() => setSearchFocused(false)}
            >
              <Feather name="search" size={13} color={Colors.dark.textSecondary} style={{ marginRight: 6 }} />
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
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                {...(Platform.OS === "web" ? { outlineStyle: "none" } as any : {})}
              />
              {query.length > 0 ? (
                <ThemedText style={styles.resultCountInline}>
                  {totalFiltered === 0 ? "0" : `${totalFiltered}`}
                </ThemedText>
              ) : null}
              {query.length > 0 ? (
                <Pressable
                  onPress={() => setQuery("")}
                  hitSlop={8}
                  onFocus={() => setClearFocused(true)}
                  onBlur={() => setClearFocused(false)}
                  onHoverIn={() => setClearFocused(true)}
                  onHoverOut={() => setClearFocused(false)}
                  style={[styles.clearBtn, clearFocused && styles.clearBtnFocus]}
                >
                  <Feather name="x" size={12} color={Colors.dark.textSecondary} />
                </Pressable>
              ) : null}
            </Pressable>
          </View>
        ) : null}
        {/* Clock + refresh */}
        <View style={styles.topBarRight}>
          {clockStr ? <ThemedText style={styles.clockText}>{clockStr}</ThemedText> : null}
          <Pressable
            onPress={() => fetchListings(true)}
            disabled={loading}
            hitSlop={8}
            onFocus={() => setRefreshFocused(true)}
            onBlur={() => setRefreshFocused(false)}
            onHoverIn={() => setRefreshFocused(true)}
            onHoverOut={() => setRefreshFocused(false)}
            style={[
              styles.refreshBtn,
              loading && { opacity: 0.4 },
              !loading && refreshFocused && styles.iconBtnFocus,
            ]}
          >
            <Feather name="refresh-cw" size={13} color={Colors.dark.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* ── Compact info row: stats + disclaimer on one line ── */}
      {!loading && !error && listings.length > 0 ? (
        <View style={styles.infoRow}>
          <View style={styles.statBox}>
            <Feather name="tv" size={13} color={ACCENT} />
            <ThemedText style={styles.statNum}>{totalEvents}</ThemedText>
            <ThemedText style={styles.statLabel}>Events</ThemedText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Feather name="grid" size={13} color={ACCENT} />
            <ThemedText style={styles.statNum}>{totalSports}</ThemedText>
            <ThemedText style={styles.statLabel}>Sports</ThemedText>
          </View>
          {nextUp ? (
            <>
              <View style={styles.statDivider} />
              <View style={[styles.statBox, styles.statBoxNext]}>
                <Feather name="clock" size={11} color={ACCENT} style={{ marginRight: 4 }} />
                <View>
                  <ThemedText style={styles.statNextLabel}>Next Up</ThemedText>
                  <ThemedText style={styles.statNextTeams} numberOfLines={1}>
                    <ThemedText style={styles.statNextSport}>{nextUp.sport} · </ThemedText>
                    {nextUp.teams}
                  </ThemedText>
                  {nextUp.channel ? (
                    <ThemedText style={styles.statNextChannel} numberOfLines={1}>{nextUp.channel}</ThemedText>
                  ) : null}
                </View>
                <ThemedText style={[styles.statNextTime, { color: ACCENT, marginLeft: 8 }]}>{nextUp.time}</ThemedText>
              </View>
            </>
          ) : null}
          <View style={styles.statDivider} />
          <View style={styles.infoDisclaimer}>
            <Feather name="info" size={11} color="#b89a30" style={{ marginRight: 5, flexShrink: 0 }} />
            <ThemedText style={styles.disclaimerText} numberOfLines={2}>
              TV channel info may not always be accurate. Check broadcaster websites for exact scheduling.
            </ThemedText>
          </View>
        </View>
      ) : null}

      {/* ── Filter tabs ── */}
      {!loading && !error && listings.length > 0 ? (
        <FilterTabs
          sports={listings}
          selected={sportFilter}
          onSelect={(k) => {
            // Show spinner on the tapped tab briefly before applying filter
            setFilterLoadingKey(k);
            if (filterLoadingTimerRef.current) clearTimeout(filterLoadingTimerRef.current);
            filterLoadingTimerRef.current = setTimeout(() => {
              setFilterLoadingKey(null);
              setSportFilter(k);
              setQuery("");
              if (k !== "all" && k !== "live") {
                setExpandedSportKey(k);
              } else {
                setExpandedSportKey(null);
              }
            }, 40);
          }}
          hasLive={hasLive}
          loadingKey={filterLoadingKey}
        />
      ) : null}

      {/* ── Content ── */}
      {loading ? (
        <LoadingBar label="Updating Sports Listings" />
      ) : error ? (
        <View style={styles.centre}>
          <Feather name="wifi-off" size={38} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.emptyTitle}>Could not load</ThemedText>
          <ThemedText style={styles.emptySubtitle}>{error}</ThemedText>
          <Pressable
            style={({ pressed, focused, hovered }: any) => [
              styles.retryBtn,
              (pressed || focused || hovered) && styles.retryBtnFocus,
            ]}
            onPress={() => fetchListings(true)}
          >
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
        <LiveOwnersCtx.Provider value={liveOwners}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: pb }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {filteredListings.map((group) => {
              const isExpanded =
                expandedSportKey === group.sport_key ||
                (expandedSportKey === null && (isSearching || sportFilter !== "all") && filteredListings.length === 1);
              return (
                <SportCard
                  key={group.sport_key}
                  group={group}
                  streams={liveStreams}
                  onChannel={handleChannel}
                  expanded={isExpanded}
                  isFocusTarget={justToggledKey === group.sport_key}
                  onExpand={() => {
                    setExpandedSportKey(group.sport_key);
                    if (toggleTimerRef.current) clearTimeout(toggleTimerRef.current);
                    setJustToggledKey(group.sport_key);
                    toggleTimerRef.current = setTimeout(() => setJustToggledKey(null), 600);
                  }}
                  onCollapse={() => {
                    setExpandedSportKey(null);
                    if (toggleTimerRef.current) clearTimeout(toggleTimerRef.current);
                    setJustToggledKey(group.sport_key);
                    toggleTimerRef.current = setTimeout(() => setJustToggledKey(null), 600);
                  }}
                />
              );
            })}
          </ScrollView>
        </LiveOwnersCtx.Provider>
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
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.md,
  },
  backBtn: {
    width: 36, height: 36,
    borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: BORDER,
    alignItems: "center", justifyContent: "center",
    backgroundColor: BG_CARD, flexShrink: 0, marginTop: 2,
  },
  iconBtnFocus: { borderColor: ACCENT, backgroundColor: "rgba(255,102,0,0.15)" },
  topBarTitle: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  pageTitle: {
    fontSize: 18, fontWeight: "800", color: Colors.dark.text, letterSpacing: -0.3,
  },
  todayBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: ACCENT,
  },
  todayBadgeText: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },
  headerSearchWrap: { flex: 1 },
  headerSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BG_CARD,
    borderWidth: 1, borderColor: BORDER,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: 38,
  },
  resultCountInline: {
    fontSize: 11, fontWeight: "700", color: ACCENT, marginRight: 6,
  },
  topBarRight: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, flexShrink: 0 },
  clockText: { fontSize: 18, fontWeight: "700", color: Colors.dark.text, fontVariant: ["tabular-nums"] },
  refreshBtn: {
    width: 30, height: 30,
    borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: BORDER,
    alignItems: "center", justifyContent: "center",
    backgroundColor: BG_CARD,
  },

  // ── Combined info row (stats + disclaimer) ───────────────────────────────────
  infoRow: {
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
    flexDirection: "row", alignItems: "center",
    paddingVertical: 7, paddingHorizontal: Spacing.md, gap: 5,
  },
  statBoxNext: { flex: 2 },
  statDivider: { width: 1, height: 26, backgroundColor: BORDER },
  statNum: { fontSize: 16, fontWeight: "800", color: Colors.dark.text },
  statLabel: { fontSize: 10, color: Colors.dark.textSecondary },
  statNextLabel: { fontSize: 9, color: Colors.dark.textSecondary, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  statNextTeams: { fontSize: 11, fontWeight: "700", color: Colors.dark.text, maxWidth: 160 },
  statNextSport: { fontSize: 11, fontWeight: "700", color: ACCENT },
  statNextChannel: { fontSize: 9, fontWeight: "600", color: Colors.dark.textSecondary, maxWidth: 160 },
  statNextTime: { fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  infoDisclaimer: {
    flex: 1, flexDirection: "row", alignItems: "center",
    paddingVertical: 7, paddingHorizontal: Spacing.md,
    borderLeftWidth: 1, borderLeftColor: "rgba(184,154,48,0.25)",
    backgroundColor: "rgba(184,154,48,0.05)",
  },
  disclaimerText: { fontSize: 10, color: "#b89a30", lineHeight: 14, flex: 1 },

  // ── Search (in header — shared focus style) ───────────────────────────────────
  searchBarFocus: { borderColor: ACCENT, backgroundColor: BG_CARD_ALT },
  searchInput: {
    flex: 1, fontSize: 13, color: Colors.dark.text,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } as any : {}),
  },
  clearBtn: {
    width: 20, height: 20,
    alignItems: "center", justifyContent: "center",
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundTertiary,
    marginLeft: 4,
  },
  clearBtnFocus: { backgroundColor: ACCENT + "44" },

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
  filterTabHover: { borderColor: ACCENT, backgroundColor: "rgba(255,102,0,0.22)" },
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
  collapsedRowHover: { backgroundColor: BG_CARD_ALT, borderColor: ACCENT + "80" },
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
  expandedHeaderHover: { backgroundColor: "rgba(255,102,0,0.13)" },
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

  // ── Competition sub-section ───────────────────────────────────────────────────
  compSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  compHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  compHeaderHover: { backgroundColor: "rgba(255,102,0,0.08)" },
  compHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
    minWidth: 0,
  },
  compAccentBar: {
    width: 3,
    height: 14,
    borderRadius: 2,
    flexShrink: 0,
  },
  compHeaderLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
    flex: 1,
  },
  compHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  compLiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(34,197,94,0.15)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.3)",
  },
  compLiveText: { fontSize: 9, fontWeight: "700", color: LIVE_GREEN },
  compMatchCount: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  compBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
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
  chipMatchedActive: {
    borderColor: ACCENT,
    backgroundColor: ACCENT,
  },
  chipUnmatchedActive: {
    borderColor: Colors.dark.textSecondary + "99",
    backgroundColor: "rgba(255,255,255,0.12)",
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
  retryBtnFocus: { borderColor: ACCENT, backgroundColor: "rgba(255,102,0,0.15)" },
  retryText: { fontSize: 13, fontWeight: "600" },
});
