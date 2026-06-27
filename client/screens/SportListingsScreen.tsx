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
import { xtreamApi } from "@/lib/xtream-api";
import type { LiveStream } from "@/lib/xtream-api";
import SideMenuButton from "@/components/SideMenuButton";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const ACCENT = "#FF6600";
const BG_ROOT = "#080808";
const BG_CARD = "#141414";
const BG_CARD_ALT = "#1a1a1a";
const BG_LEFT = "#111111";
const BORDER = "#252525";
const LIVE_GREEN = "#22c55e";

// ── Module-level listings cache (survives screen unmounts, instant revisits) ───
let _listingsCache: SportGroup[] = [];
let _cacheAt = 0;
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
const SPORT_DURATION: Array<[RegExp, number]> = [
  [/^football$/,          115],
  [/^combat$/,            300],
  [/^rugby$/,             100],
  [/^motorsport$/,        200],
  [/^darts$/,             120],
  [/^golf$/,              480],
  [/^cricket$/,           600],
  [/^tennis$/,            180],
  [/^snooker$/,           360],
  [/^ppv$/,               300],
  [/^us_sports$/,         210],
  [/^horse_racing$/,       30],
  [/^athletics$/,         180],
  [/^olympics$/,          480],
  [/^cycling$/,           300],
  [/^afl$/,               130],
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

const DEFAULT_DURATION = 120;

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
  const diff = mins - now;
  const duration = estimatedDuration(sportKey);
  if (diff <= 0 && diff > -duration) return "live";
  if (diff > 0 && diff <= 30) return "soon";
  return null;
}

function isMatchLive(ukTime: string, sportKey = ""): boolean {
  return getMatchStatus(ukTime, sportKey) === "live";
}

// ── Channel-conflict resolution ────────────────────────────────────────────────
const LiveOwnersCtx = createContext<Set<string>>(new Set());

function computeLiveOwners(groups: SportGroup[]): Set<string> {
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
  return new Set(Array.from(channelOwner.values()).map((v) => v.key));
}

// ── Sport sort order ──────────────────────────────────────────────────────────
const SPORT_SORT_ORDER = [
  "football", "combat", "rugby", "motorsport", "darts", "golf",
  "cricket", "tennis", "snooker", "ppv", "us_sports", "horse_racing",
  "athletics", "olympics", "cycling", "afl", "other",
];

function sportSortIndex(key: string): number {
  const k = key.toLowerCase();
  const exact = SPORT_SORT_ORDER.indexOf(k);
  if (exact !== -1) return exact;
  const fuzzy = SPORT_SORT_ORDER.findIndex((s) => k.startsWith(s) || s.startsWith(k));
  return fuzzy === -1 ? 997 : fuzzy;
}

// ── Sport icon map ─────────────────────────────────────────────────────────────
const SPORT_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  football: "target", combat: "zap", rugby: "activity", motorsport: "zap",
  darts: "crosshair", golf: "flag", cricket: "activity", tennis: "activity",
  snooker: "circle", ppv: "star", us_sports: "award", horse_racing: "wind",
  athletics: "wind", olympics: "award", cycling: "wind", afl: "activity", other: "tv",
  formula_1: "zap", formula_2: "zap", formula_3: "zap", motogp: "zap",
  rally: "zap", nascar: "zap", boxing: "zap", ufc: "zap", mma: "zap",
  wrestling: "zap", rugby_league: "activity", rugby_union: "activity",
  super_league: "activity", basketball: "circle", nfl: "award",
  nba: "award", mlb: "award", nhl: "award",
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
  comp, sportKey, streams, onChannel, defaultExpanded, isFocusTarget,
}: {
  comp: SportCompetition;
  sportKey: string;
  streams: LiveStream[];
  onChannel: (s: LiveStream) => void;
  defaultExpanded?: boolean;
  isFocusTarget?: boolean;
}) {
  const [open, setOpen] = useState(defaultExpanded !== false);
  const [hovered, setHovered] = useState(false);
  const liveOwners = useContext(LiveOwnersCtx);
  const liveCount = comp.matches.filter((m) => {
    if (!isMatchLive(m.uk_time, sportKey)) return false;
    if (m.uk_channels.length === 0) return true;
    return liveOwners.has(`${m.uk_time}|${m.teams}`);
  }).length;

  return (
    <View style={styles.compSection}>
      <Pressable
        style={[styles.compHeader, hovered && styles.compHeaderHover]}
        onPress={() => setOpen((v) => !v)}
        hasTVPreferredFocus={isFocusTarget && Platform.OS !== "web"}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
      >
        <View style={styles.compHeaderLeft}>
          <View style={[styles.compAccentBar, { backgroundColor: ACCENT }]} />
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
            {comp.matches.length} event{comp.matches.length !== 1 ? "s" : ""}
          </ThemedText>
          <Feather
            name={open ? "chevron-up" : "chevron-down"}
            size={13}
            color={Colors.dark.textSecondary}
            style={{ marginLeft: 6 }}
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

  const nextDayLabel = useMemo(() => {
    const mins = parseHHMM(match.uk_time);
    if (mins === null || mins >= 4 * 60) return null;
    const ukHour = parseInt(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false })
        .format(new Date()), 10,
    );
    if (ukHour < 4) return null;
    return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" })
      .format(new Date(Date.now() + 24 * 60 * 60 * 1000))
      .toUpperCase();
  }, [match.uk_time]);

  return (
    <View style={[styles.matchRow, !isFirst && styles.matchRowBorder]}>
      {/* Time + status column */}
      <View style={styles.matchTimeCol}>
        <ThemedText style={[styles.matchTime, status === "live" && { color: LIVE_GREEN }]}>
          {match.uk_time || "TBC"}
        </ThemedText>
        {nextDayLabel ? (
          <View style={styles.nextDayBadge}>
            <ThemedText style={styles.nextDayBadgeText}>{nextDayLabel}</ThemedText>
          </View>
        ) : status === "live" ? (
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

// ── LeftSportRow ──────────────────────────────────────────────────────────────
const LeftSportRow = memo(function LeftSportRow({
  group, selected, onSelect, liveOwners, isFirst,
}: {
  group: SportGroup;
  selected: boolean;
  onSelect: () => void;
  liveOwners: Set<string>;
  isFirst?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  const totalMatches = useMemo(
    () => group.competitions.reduce((n, c) => n + c.matches.length, 0),
    [group],
  );
  const liveCount = useMemo(() =>
    group.competitions.reduce(
      (n, c) => n + c.matches.filter((m) => {
        if (!isMatchLive(m.uk_time, group.sport_key)) return false;
        if (m.uk_channels.length === 0) return true;
        return liveOwners.has(`${m.uk_time}|${m.teams}`);
      }).length, 0,
    ),
    [group, liveOwners],
  );

  const icon = sportIcon(group.sport_key);
  const compSubtitle = useMemo(() => {
    const names = group.competitions.map((c) => c.name).filter(Boolean);
    if (names.length === 0) return "";
    if (names.length <= 2) return names.join(" · ");
    return names.slice(0, 2).join(" · ") + ` +${names.length - 2}`;
  }, [group]);

  return (
    <Pressable
      onPress={onSelect}
      hasTVPreferredFocus={isFirst && !selected && Platform.OS !== "web"}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.leftRow,
        selected && styles.leftRowSelected,
        !selected && hovered && styles.leftRowHover,
      ]}
    >
      {selected ? <View style={styles.leftSelBar} /> : null}
      <View style={[styles.leftIconCircle, selected && styles.leftIconCircleSel]}>
        <Feather name={icon} size={15} color="#fff" />
      </View>
      <View style={styles.leftMeta}>
        <View style={styles.leftMetaRow}>
          <ThemedText
            style={[styles.leftLabel, selected && { color: ACCENT }]}
            numberOfLines={1}
          >
            {group.sport_label}
          </ThemedText>
          {liveCount > 0 ? (
            <View style={styles.leftLiveBadge}>
              <View style={styles.liveDotSm} />
              <ThemedText style={styles.leftLiveText}>{liveCount}</ThemedText>
            </View>
          ) : null}
        </View>
        {compSubtitle ? (
          <ThemedText style={styles.leftSub} numberOfLines={1}>
            {compSubtitle}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.leftCountCol}>
        <ThemedText style={[styles.leftCountNum, selected && { color: ACCENT }]}>
          {totalMatches}
        </ThemedText>
        <ThemedText style={styles.leftCountLabel}>
          {totalMatches === 1 ? "event" : "events"}
        </ThemedText>
      </View>
      <Feather
        name="chevron-right"
        size={13}
        color={selected ? ACCENT : "#444"}
        style={{ marginLeft: 2 }}
      />
    </Pressable>
  );
});

// ── RightPanelHeader ──────────────────────────────────────────────────────────
const RightPanelHeader = memo(function RightPanelHeader({
  group, liveOwners,
}: {
  group: SportGroup;
  liveOwners: Set<string>;
}) {
  const totalMatches = group.competitions.reduce((n, c) => n + c.matches.length, 0);
  const liveCount = group.competitions.reduce(
    (n, c) => n + c.matches.filter((m) => {
      if (!isMatchLive(m.uk_time, group.sport_key)) return false;
      if (m.uk_channels.length === 0) return true;
      return liveOwners.has(`${m.uk_time}|${m.teams}`);
    }).length, 0,
  );
  const icon = sportIcon(group.sport_key);
  const compNames = group.competitions.map((c) => c.name);
  const subtitle =
    compNames.length === 1
      ? compNames[0]
      : compNames.slice(0, 2).join(", ") + (compNames.length > 2 ? ` +${compNames.length - 2}` : "");

  return (
    <View style={styles.rightHeader}>
      <View style={styles.rightHeaderIconCircle}>
        <Feather name={icon} size={20} color="#fff" />
      </View>
      <View style={styles.rightHeaderMeta}>
        <View style={styles.rightHeaderTop}>
          <ThemedText style={styles.rightHeaderTitle}>{group.sport_label}</ThemedText>
          {liveCount > 0 ? (
            <View style={styles.rightHeaderLiveBadge}>
              <View style={styles.liveDotSm} />
              <ThemedText style={styles.rightHeaderLiveText}>{liveCount} LIVE</ThemedText>
            </View>
          ) : null}
          <View style={styles.rightHeaderEventBadge}>
            <ThemedText style={styles.rightHeaderEventText}>{totalMatches} EVENTS</ThemedText>
          </View>
        </View>
        <ThemedText style={styles.rightHeaderSub} numberOfLines={1}>{subtitle}</ThemedText>
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
      Animated.timing(pos, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [pos]);
  const translateX = pos.interpolate({ inputRange: [0, 1], outputRange: [-STRIP_W, TRACK_W] });
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
  const [selectedSportKey, setSelectedSportKey] = useState<string | null>(null);
  const [liveNowFocused, setLiveNowFocused] = useState(false);
  const [clockStr, setClockStr] = useState("");
  const inputRef = useRef<TextInput>(null);
  const rightScrollRef = useRef<ScrollView>(null);
  // Increments on each selection change — used as key to remount right panel
  // so hasTVPreferredFocus fires fresh on the first focusable element.
  const [rightPanelGen, setRightPanelGen] = useState(0);

  // TV-remote / hover focus state for header controls
  const [backFocused, setBackFocused] = useState(false);
  const [refreshFocused, setRefreshFocused] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [clearFocused, setClearFocused] = useState(false);

  // Live UK clock (HH:MM)
  useEffect(() => {
    const fmt = () =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(new Date());
    setClockStr(fmt());
    const id = setInterval(() => setClockStr(fmt()), 30_000);
    return () => clearInterval(id);
  }, []);

  const fetchListings = useCallback(async (force = false) => {
    const hasCache = _listingsCache.length > 0;

    if (hasCache && !force) {
      const ukDateFmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
      });
      const ukHourFmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London", hour: "2-digit", hour12: false,
      });
      const now = new Date();
      const cachedDate = ukDateFmt.format(new Date(_cacheAt));
      const todayDate = ukDateFmt.format(now);
      const ukHour = parseInt(ukHourFmt.format(now), 10);
      const stillValid = cachedDate === todayDate || ukHour < 4;
      if (stillValid) {
        setListings(_listingsCache);
        setLoading(false);
        return;
      }
    }

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
      if (_listingsCache.length > 0) return;
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

  const liveOwners = useMemo(() => computeLiveOwners(listings), [listings]);

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

  // Auto-select: keep selectedSportKey valid as filteredListings changes
  useEffect(() => {
    if (filteredListings.length === 0) {
      setSelectedSportKey(null);
      return;
    }
    if (!filteredListings.find((g) => g.sport_key === selectedSportKey)) {
      setSelectedSportKey(filteredListings[0].sport_key);
      setRightPanelGen((n) => n + 1);
    }
  }, [filteredListings]);

  const selectedGroup = useMemo(
    () => filteredListings.find((g) => g.sport_key === selectedSportKey) ?? null,
    [filteredListings, selectedSportKey],
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
        <View style={styles.topBarTitle}>
          <ThemedText style={styles.pageTitle}>Sports on TV</ThemedText>
          <View style={styles.todayBadge}>
            <ThemedText style={styles.todayBadgeText}>TODAY</ThemedText>
          </View>
        </View>
        {/* Live Now toggle — always visible when data is loaded */}
        {!loading && !error && listings.length > 0 ? (
          <Pressable
            onPress={() => {
              setSportFilter((f) => f === "live" ? "all" : "live");
              setQuery("");
            }}
            onFocus={() => setLiveNowFocused(true)}
            onBlur={() => setLiveNowFocused(false)}
            onHoverIn={() => setLiveNowFocused(true)}
            onHoverOut={() => setLiveNowFocused(false)}
            style={[
              styles.liveNowBtn,
              sportFilter === "live" && styles.liveNowBtnActive,
              sportFilter !== "live" && liveNowFocused && styles.liveNowBtnHover,
            ]}
          >
            <View style={[styles.liveDotSm, sportFilter !== "live" && { backgroundColor: Colors.dark.textSecondary }]} />
            <ThemedText style={[styles.liveNowText, sportFilter === "live" && styles.liveNowTextActive]}>
              Live Now
            </ThemedText>
            {hasLive ? (
              <View style={styles.liveNowCountBubble}>
                <ThemedText style={styles.liveNowCountText}>
                  {listings.reduce((n, g) => n + g.competitions.reduce((m, c) => m + c.matches.filter((match) => isEffLive(match, g.sport_key)).length, 0), 0)}
                </ThemedText>
              </View>
            ) : null}
          </Pressable>
        ) : null}
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

      {/* ── Compact info row ── */}
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
            No sports listings have been added for today yet, check back soon!
          </ThemedText>
        </View>
      ) : (
        <LiveOwnersCtx.Provider value={liveOwners}>
          <View style={styles.panels}>

            {/* ── Left panel: sport list ── */}
            <ScrollView
              style={styles.leftPanel}
              contentContainerStyle={styles.leftContent}
              showsVerticalScrollIndicator={false}
            >
              {filteredListings.length === 0 ? (
                <View style={styles.leftEmpty}>
                  <ThemedText style={styles.leftEmptyText}>No results</ThemedText>
                </View>
              ) : (
                filteredListings.map((group, idx) => (
                  <LeftSportRow
                    key={group.sport_key}
                    group={group}
                    selected={selectedSportKey === group.sport_key}
                    liveOwners={liveOwners}
                    isFirst={idx === 0}
                    onSelect={() => {
                      setSelectedSportKey(group.sport_key);
                      setRightPanelGen((n) => n + 1);
                      rightScrollRef.current?.scrollTo({ y: 0, animated: false });
                    }}
                  />
                ))
              )}
            </ScrollView>

            {/* ── Divider ── */}
            <View style={styles.panelDivider} />

            {/* ── Right panel: event detail ── */}
            <ScrollView
              ref={rightScrollRef}
              style={styles.rightPanel}
              contentContainerStyle={[styles.rightContent, { paddingBottom: pb }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {selectedGroup ? (
                // key forces remount so hasTVPreferredFocus fires on first element
                <View key={`${selectedGroup.sport_key}-${rightPanelGen}`}>
                  <RightPanelHeader group={selectedGroup} liveOwners={liveOwners} />
                  <View style={styles.rightBody}>
                    {selectedGroup.competitions.length > 1 ? (
                      selectedGroup.competitions.map((comp, ci) => (
                        <CompetitionSection
                          key={ci}
                          comp={comp}
                          sportKey={selectedGroup.sport_key}
                          streams={liveStreams}
                          onChannel={handleChannel}
                          defaultExpanded={true}
                          isFocusTarget={ci === 0}
                        />
                      ))
                    ) : (
                      selectedGroup.competitions.flatMap((comp, ci) =>
                        comp.matches.map((match, mi) => (
                          <MatchRow
                            key={`${ci}-${mi}`}
                            match={match}
                            competition={comp.name}
                            sportKey={selectedGroup.sport_key}
                            streams={liveStreams}
                            onChannel={handleChannel}
                            isFirst={ci === 0 && mi === 0}
                          />
                        ))
                      )
                    )}
                  </View>
                </View>
              ) : (
                <View style={styles.rightEmpty}>
                  <Feather name="arrow-left" size={28} color={Colors.dark.textSecondary} />
                  <ThemedText style={styles.rightEmptyText}>Select a sport from the left</ThemedText>
                </View>
              )}
            </ScrollView>
          </View>
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
  pageTitle: { fontSize: 18, fontWeight: "800", color: Colors.dark.text, letterSpacing: -0.3 },
  todayBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: BorderRadius.full, backgroundColor: ACCENT,
  },
  todayBadgeText: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },
  headerSearchWrap: { flex: 1 },
  headerSearchBar: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: BG_CARD,
    borderWidth: 1, borderColor: BORDER,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: 38,
  },
  resultCountInline: { fontSize: 11, fontWeight: "700", color: ACCENT, marginRight: 6 },
  topBarRight: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, flexShrink: 0 },
  clockText: { fontSize: 18, fontWeight: "700", color: Colors.dark.text, fontVariant: ["tabular-nums"] },
  refreshBtn: {
    width: 30, height: 30,
    borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: BORDER,
    alignItems: "center", justifyContent: "center",
    backgroundColor: BG_CARD,
  },

  // ── Live Now toggle button ────────────────────────────────────────────────────
  liveNowBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: BORDER,
    backgroundColor: BG_CARD, flexShrink: 0,
  },
  liveNowBtnActive: {
    backgroundColor: "rgba(34,197,94,0.15)",
    borderColor: "rgba(34,197,94,0.5)",
  },
  liveNowBtnHover: {
    borderColor: "rgba(34,197,94,0.4)",
    backgroundColor: "rgba(34,197,94,0.08)",
  },
  liveNowText: { fontSize: 13, fontWeight: "700", color: Colors.dark.textSecondary },
  liveNowTextActive: { color: LIVE_GREEN },
  liveNowCountBubble: {
    minWidth: 18, height: 18,
    borderRadius: 9,
    backgroundColor: LIVE_GREEN,
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 4,
  },
  liveNowCountText: { fontSize: 10, fontWeight: "800", color: "#000" },

  // ── Info row ─────────────────────────────────────────────────────────────────
  infoRow: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: BORDER,
    backgroundColor: BG_CARD, overflow: "hidden",
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

  // ── Search ────────────────────────────────────────────────────────────────────
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

  // ── Two-panel layout ──────────────────────────────────────────────────────────
  panels: {
    flex: 1,
    flexDirection: "row",
  },

  // ── Left panel ────────────────────────────────────────────────────────────────
  leftPanel: { flex: 1, backgroundColor: BG_LEFT },
  leftContent: { paddingVertical: 4 },
  leftEmpty: {
    padding: Spacing.xl,
    alignItems: "center",
  },
  leftEmptyText: { fontSize: 13, color: Colors.dark.textSecondary },

  leftRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingRight: Spacing.md,
    paddingLeft: 0,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    position: "relative",
  },
  leftRowHover: {
    backgroundColor: "#1c1c1c",
  },
  leftRowSelected: {
    backgroundColor: "#1a1a1a",
  },
  leftSelBar: {
    position: "absolute",
    left: 0, top: 0, bottom: 0,
    width: 3,
    backgroundColor: ACCENT,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  leftIconCircle: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: "#2a2a2a",
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
    marginLeft: 10,
  },
  leftIconCircleSel: { backgroundColor: ACCENT },
  leftMeta: { flex: 1, gap: 2, minWidth: 0 },
  leftMetaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  leftLabel: { fontSize: 13, fontWeight: "700", color: Colors.dark.text, flexShrink: 1 },
  leftSub: { fontSize: 10, color: Colors.dark.textSecondary, lineHeight: 13 },
  leftLiveBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(34,197,94,0.15)",
    borderWidth: 1, borderColor: "rgba(34,197,94,0.3)",
    flexShrink: 0,
  },
  leftLiveText: { fontSize: 8, fontWeight: "800", color: LIVE_GREEN },
  leftCountCol: { alignItems: "center", flexShrink: 0, minWidth: 30 },
  leftCountNum: { fontSize: 14, fontWeight: "800", color: Colors.dark.textSecondary, lineHeight: 16 },
  leftCountLabel: { fontSize: 8, color: "#444", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 },

  // ── Panel divider ─────────────────────────────────────────────────────────────
  panelDivider: { width: 1, backgroundColor: BORDER },

  // ── Right panel ───────────────────────────────────────────────────────────────
  rightPanel: { flex: 1 },
  rightContent: { flexGrow: 1 },
  rightBody: {},
  rightEmpty: {
    flex: 1, alignItems: "center", justifyContent: "center",
    gap: Spacing.md, paddingVertical: 60,
  },
  rightEmptyText: { fontSize: 14, color: Colors.dark.textSecondary },

  // ── Right panel header ────────────────────────────────────────────────────────
  rightHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    backgroundColor: "rgba(255,102,0,0.06)",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 14,
  },
  rightHeaderIconCircle: {
    width: 48, height: 48,
    borderRadius: 24,
    backgroundColor: ACCENT,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  rightHeaderMeta: { flex: 1, gap: 3, minWidth: 0 },
  rightHeaderTop: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  rightHeaderTitle: { fontSize: 20, fontWeight: "800", color: Colors.dark.text, letterSpacing: -0.3 },
  rightHeaderLiveBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(34,197,94,0.15)",
    borderWidth: 1, borderColor: "rgba(34,197,94,0.3)",
  },
  rightHeaderLiveText: { fontSize: 10, fontWeight: "700", color: LIVE_GREEN },
  rightHeaderEventBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,102,0,0.15)",
    borderWidth: 1, borderColor: "rgba(255,102,0,0.3)",
  },
  rightHeaderEventText: { fontSize: 10, fontWeight: "700", color: ACCENT },
  rightHeaderSub: { fontSize: 12, color: Colors.dark.textSecondary },

  // ── Competition sub-section ───────────────────────────────────────────────────
  compSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  compHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: 11,
    backgroundColor: "#0f0f0f",
  },
  compHeaderHover: { backgroundColor: "rgba(255,102,0,0.08)" },
  compHeaderLeft: {
    flexDirection: "row", alignItems: "center", flex: 1, gap: 10, minWidth: 0,
  },
  compAccentBar: { width: 3, height: 14, borderRadius: 2, flexShrink: 0 },
  compHeaderLabel: { fontSize: 13, fontWeight: "700", color: Colors.dark.text, flex: 1 },
  compHeaderRight: {
    flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0,
  },
  compLiveBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(34,197,94,0.15)",
    borderWidth: 1, borderColor: "rgba(34,197,94,0.3)",
  },
  compLiveText: { fontSize: 9, fontWeight: "700", color: LIVE_GREEN },
  compMatchCount: { fontSize: 11, color: Colors.dark.textSecondary, fontWeight: "500" },
  compBody: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER },

  // ── Match row ─────────────────────────────────────────────────────────────────
  matchRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
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
    borderRadius: BorderRadius.xs, backgroundColor: LIVE_GREEN,
  },
  statusBadgeSoon: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: BorderRadius.xs, backgroundColor: SOON_AMBER,
  },
  statusBadgeText: { fontSize: 8, fontWeight: "800", color: "#000" },
  nextDayBadge: {
    paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    backgroundColor: "#334155",
    borderWidth: 1, borderColor: "#475569",
  },
  nextDayBadgeText: { fontSize: 8, fontWeight: "700", color: "#94a3b8" },
  matchInfo: { flex: 1, gap: 3 },
  matchTeams: { fontSize: 14, fontWeight: "700", color: Colors.dark.text },
  matchComp: { fontSize: 11, color: Colors.dark.textSecondary },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },

  // ── Channel chips ─────────────────────────────────────────────────────────────
  chip: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: BorderRadius.full, borderWidth: 1,
  },
  chipMatched: { borderColor: ACCENT + "88", backgroundColor: "rgba(255,102,0,0.12)" },
  chipUnmatched: { borderColor: BORDER, backgroundColor: Colors.dark.backgroundTertiary },
  chipMatchedActive: { borderColor: ACCENT, backgroundColor: ACCENT },
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

  // ── Shared dot ────────────────────────────────────────────────────────────────
  liveDotSm: { width: 6, height: 6, borderRadius: 3, backgroundColor: LIVE_GREEN },

  // ── Empty / error states ──────────────────────────────────────────────────────
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
