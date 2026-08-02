import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SideMenuButton from "@/components/SideMenuButton";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { getApiUrl } from "@/lib/query-client";
import { useData } from "@/contexts/DataContext";
import { xtreamApi } from "@/lib/xtream-api";
import { leagueRank, FOOTBALL_LEAGUE_GROUPS } from "@/constants/football-leagues";
import { useFootball, type FootballScore } from "@/contexts/FootballContext";
import { useMatchReminder } from "@/contexts/MatchReminderContext";
import { useProfile } from "@/contexts/ProfileContext";
import UltraFourTab from "@/components/UltraFourTab";
import {
  loadHiddenLeagues,
  saveHiddenLeagues,
} from "@/lib/football-filter-storage";

// Theme the web scrollbars (orange thumb on near-black track) so the modal and
// other scroll areas match the app instead of showing the OS's generic grey bar.
// No-op on native (RN scrollbars are already minimal/overlaid).
if (
  Platform.OS === "web" &&
  typeof document !== "undefined" &&
  !document.getElementById("ultracast-scrollbar-style")
) {
  const style = document.createElement("style");
  style.id = "ultracast-scrollbar-style";
  style.textContent = `
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: ${Colors.dark.backgroundRoot}; }
    ::-webkit-scrollbar-thumb {
      background: ${Colors.dark.accent};
      border-radius: 4px;
      border: 2px solid ${Colors.dark.backgroundRoot};
    }
    ::-webkit-scrollbar-thumb:hover { background: ${Colors.dark.accentHover}; }
    ::-webkit-scrollbar-corner { background: ${Colors.dark.backgroundRoot}; }
    * { scrollbar-width: thin; scrollbar-color: ${Colors.dark.accent} ${Colors.dark.backgroundRoot}; }
  `;
  document.head.appendChild(style);
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface FootballFixture {
  fixture_id: number;
  league_id: number;
  league_name: string | null;
  league_country: string | null;
  home_team: string | null;
  away_team: string | null;
  home_logo: string | null;
  away_logo: string | null;
  kickoff: string | null;
  date_key: string;
  status_short: string | null;
}

interface FixtureChannel {
  fixture_id: number;
  channel_name: string;
  stream_id: string | null;
}

// Favourite-team fixtures come from /api/football/team-fixtures (next N games).
// They span far further ahead than the curated 7-day Upcoming window and can be
// in non-curated competitions, so channels are only shown where a mapping
// happens to exist.
interface TeamFixture {
  fixture_id: number;
  league_id: number | null;
  league_name: string | null;
  home_team: string | null;
  away_team: string | null;
  home_logo: string | null;
  away_logo: string | null;
  kickoff: string | null;
}

const SCORES_POLL_MS = 30000;
// While a game's detail popup is open, refresh its stats/lineups/events on this
// cadence. Detail is fetched on-demand only (when a user opens a game) — never
// for every game — so this is one user's open popup, not a global poll.
const DETAIL_POLL_MS = 60000;
const FINISHED = ["FT", "AET", "PEN", "AWD", "WO"];

function minuteLabel(s: FootballScore): string {
  const st = (s.status_short || "").toUpperCase();
  if (st === "HT") return "HT";
  if (FINISHED.includes(st) || s.finished_at) return "FT";
  if (s.elapsed != null) return `${s.elapsed}'`;
  if (st) return st;
  return "";
}

function isLive(s: FootballScore): boolean {
  const st = (s.status_short || "").toUpperCase();
  return (
    !s.finished_at &&
    !FINISHED.includes(st) &&
    !["NS", "PST", "CANC", "TBD", "SUSP"].includes(st)
  );
}

function kickoffTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function kickoffLabel(iso: string | null): string {
  const t = kickoffTime(iso);
  return t ? `Kick Off ${t}` : "";
}

function ChannelNotice() {
  return (
    <View style={styles.noticeBox}>
      <Feather name="info" size={15} color={Colors.dark.accent} style={styles.noticeIcon} />
      <ThemedText style={styles.noticeText}>
        Heads up: TV channels for some matches aren't confirmed until a few hours
        before kick-off, and the listings here can occasionally be wrong. Always
        check official broadcaster sources for the most accurate channel info.
      </ThemedText>
    </View>
  );
}

function dayLabel(dateKey: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (dateKey === today) return "Today";
  if (dateKey === tomorrow) return "Tomorrow";
  const d = new Date(dateKey + "T00:00:00");
  if (isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

function Touchable({
  style,
  activeStyle,
  onPress,
  children,
}: {
  style: any;
  activeStyle: any;
  onPress?: () => void;
  children: React.ReactNode | ((active: boolean) => React.ReactNode);
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const active = focused || pressed || hovered;
  return (
    <Pressable
      style={[style, active && activeStyle]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      {typeof children === "function" ? children(active) : children}
    </Pressable>
  );
}

function CollapsibleLeague({
  name,
  count,
  isPref,
  expanded,
  onToggle,
  children,
}: {
  name: string;
  count: number;
  isPref: boolean;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: Spacing.sm }}>
      <Touchable
        style={[styles.leagueHeader, isPref && styles.leagueHeaderPref]}
        activeStyle={styles.leagueHeaderActive}
        onPress={onToggle}
      >
        <Feather
          name={expanded ? "chevron-down" : "chevron-right"}
          size={16}
          color={Colors.dark.accent}
        />
        {isPref ? (
          <Feather name="star" size={12} color={Colors.dark.accent} />
        ) : null}
        <View style={styles.leagueCount}>
          <ThemedText style={styles.leagueCountText}>{count}</ThemedText>
        </View>
        <ThemedText style={styles.leagueName} numberOfLines={1}>
          {name}
        </ThemedText>
      </Touchable>
      {expanded ? children : null}
    </View>
  );
}

function ChannelBadges({
  channels,
  onPress,
}: {
  channels: FixtureChannel[];
  onPress: (ch: FixtureChannel) => void;
}) {
  if (!channels.length) return null;
  return (
    <View style={styles.channelWrap}>
      {channels.map((ch, i) => (
        <Touchable
          key={`${ch.fixture_id}-${i}`}
          style={styles.channelBadge}
          activeStyle={styles.channelBadgeActive}
          onPress={() => onPress(ch)}
        >
          {(active) => (
            <>
              <Feather
                name="tv"
                size={11}
                color={active ? Colors.dark.accent : "#3ddc84"}
              />
              <ThemedText style={styles.channelText} numberOfLines={1}>
                {ch.channel_name}
              </ThemedText>
            </>
          )}
        </Touchable>
      ))}
    </View>
  );
}

function TeamBadge({ uri }: { uri?: string | null }) {
  if (!uri) return <View style={styles.teamLogoPlaceholder} />;
  return (
    <Image
      source={{ uri }}
      style={styles.teamLogo}
      contentFit="contain"
      transition={150}
    />
  );
}

function MatchCard({
  home,
  away,
  homeLogo,
  awayLogo,
  homeScore,
  awayScore,
  statusLabel,
  live,
  upcoming,
  channels,
  onChannelPress,
  onCardPress,
  cardWidth,
  leagueLabel,
}: {
  home: string;
  away: string;
  homeLogo?: string | null;
  awayLogo?: string | null;
  homeScore?: number;
  awayScore?: number;
  statusLabel: string;
  live: boolean;
  upcoming: boolean;
  channels: FixtureChannel[];
  onChannelPress: (ch: FixtureChannel) => void;
  onCardPress?: () => void;
  cardWidth: number;
  leagueLabel?: string;
}) {
  const body = (active: boolean) => (
    <>
      {leagueLabel ? (
        <ThemedText style={styles.cardLeague} numberOfLines={1}>
          {leagueLabel}
        </ThemedText>
      ) : null}
      <View style={styles.cardTop}>
        {statusLabel ? (
          <View
            style={[
              styles.statusPill,
              live && styles.statusPillLive,
              upcoming && styles.statusPillUpcoming,
            ]}
          >
            {live ? <View style={styles.liveDot} /> : null}
            <ThemedText
              style={[
                styles.statusText,
                live && styles.statusTextLive,
                upcoming && styles.statusTextUpcoming,
              ]}
            >
              {statusLabel}
            </ThemedText>
          </View>
        ) : null}
        {onCardPress ? (
          <Feather
            name="bar-chart-2"
            size={14}
            color={active ? Colors.dark.accent : Colors.dark.textSecondary}
            style={styles.statsHint}
          />
        ) : null}
      </View>

      <View style={styles.teamLine}>
        <View style={styles.teamInfo}>
          <TeamBadge uri={homeLogo} />
          <ThemedText style={styles.teamName} numberOfLines={1}>
            {home}
          </ThemedText>
        </View>
        {!upcoming ? (
          <ThemedText style={[styles.teamScore, live && styles.teamScoreLive]}>
            {homeScore ?? 0}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.teamLine}>
        <View style={styles.teamInfo}>
          <TeamBadge uri={awayLogo} />
          <ThemedText style={styles.teamName} numberOfLines={1}>
            {away}
          </ThemedText>
        </View>
        {!upcoming ? (
          <ThemedText style={[styles.teamScore, live && styles.teamScoreLive]}>
            {awayScore ?? 0}
          </ThemedText>
        ) : null}
      </View>
    </>
  );

  return (
    <View style={[styles.gameCard, { width: cardWidth }]}>
      <Touchable
        style={styles.cardPressable}
        activeStyle={styles.cardPressableActive}
        onPress={onCardPress}
      >
        {body}
      </Touchable>

      <ChannelBadges channels={channels} onPress={onChannelPress} />
    </View>
  );
}

interface FixtureDetail {
  statistics: {
    team_name: string | null;
    team_logo: string | null;
    items: { type: string; value: string | number | null }[];
  }[];
  lineups: {
    team_name: string | null;
    team_logo: string | null;
    formation: string | null;
    coach: string | null;
    startXI: { name: string; number: number | null; pos: string | null }[];
    substitutes: { name: string; number: number | null; pos: string | null }[];
  }[];
  events: {
    minute: string;
    team_name: string | null;
    player: string | null;
    assist: string | null;
    type: string | null;
    detail: string | null;
  }[];
}

interface DetailTarget {
  fixtureId: number;
  home: string;
  away: string;
  homeLogo?: string | null;
  awayLogo?: string | null;
  homeScore?: number;
  awayScore?: number;
  statusLabel: string;
  leagueName: string;
  watchChannel: FixtureChannel | null;
}

type DetailTab = "stats" | "lineups" | "events";

function eventIcon(type: string | null, detail: string | null): React.ReactNode {
  const t = (type ?? "").toLowerCase();
  const d = (detail ?? "").toLowerCase();
  if (t === "goal") {
    return <MaterialCommunityIcons name="soccer" size={14} color={Colors.dark.success} />;
  }
  if (t === "card") {
    return (
      <View
        style={[
          styles.cardChip,
          { backgroundColor: d.includes("red") ? "#FF3B3B" : "#F5C518" },
        ]}
      />
    );
  }
  if (t === "subst") {
    return <Feather name="repeat" size={13} color={Colors.dark.accent} />;
  }
  return <Feather name="circle" size={11} color={Colors.dark.textSecondary} />;
}

function GameDetailModal({
  target,
  onClose,
  onWatchLive,
}: {
  target: DetailTarget | null;
  onClose: () => void;
  onWatchLive: (ch: FixtureChannel) => void;
}) {
  const [tab, setTab] = useState<DetailTab>("stats");
  const [detail, setDetail] = useState<FixtureDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const { width } = useWindowDimensions();
  // On a wide landscape/TV screen there's room to show both teams' lineups
  // side by side instead of one long stacked column.
  const wide = width >= 900;

  const fixtureId = target?.fixtureId ?? null;

  React.useEffect(() => {
    if (fixtureId == null) return;
    setTab("stats");
    setDetail(null);
    let active = true;
    // Refetch on open (with the spinner) and then every DETAIL_POLL_MS while the
    // popup stays open (silently, keeping the current data on screen so it never
    // flashes back to a loader). Each call hits the API fresh for this user.
    const load = async (showLoader: boolean) => {
      if (showLoader) setLoading(true);
      try {
        const url = new URL(
          `/api/football/centre/fixture/${fixtureId}`,
          getApiUrl(),
        );
        const res = await fetch(url.toString());
        const data = res.ok ? await res.json() : null;
        if (active && data) setDetail(data);
      } catch {
        // silent
      } finally {
        if (active && showLoader) setLoading(false);
      }
    };
    load(true);
    const id = setInterval(() => load(false), DETAIL_POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [fixtureId]);

  if (!target) return null;

  const home = detail?.statistics?.[0];
  const away = detail?.statistics?.[1];
  // Build a unified stat-type list preserving order from the home team's list.
  const statTypes: string[] = [];
  for (const it of home?.items ?? []) if (!statTypes.includes(it.type)) statTypes.push(it.type);
  for (const it of away?.items ?? []) if (!statTypes.includes(it.type)) statTypes.push(it.type);
  const statVal = (team: FixtureDetail["statistics"][number] | undefined, type: string) => {
    const v = team?.items.find((i) => i.type === type)?.value;
    return v == null || v === "" ? "—" : String(v);
  };

  const renderStats = () => {
    if (!statTypes.length) {
      return <ThemedText style={styles.modalEmpty}>No stats available yet.</ThemedText>;
    }
    return (
      <View>
        <View style={[styles.statRow, styles.statHeaderRow]}>
          <ThemedText style={[styles.statSide, styles.statHeaderText]} numberOfLines={1}>
            {home?.team_name ?? target.home}
          </ThemedText>
          <ThemedText style={[styles.statMid, styles.statHeaderText]}>Stat</ThemedText>
          <ThemedText
            style={[styles.statSide, styles.statHeaderText, styles.statSideRight]}
            numberOfLines={1}
          >
            {away?.team_name ?? target.away}
          </ThemedText>
        </View>
        {statTypes.map((type, i) => (
          <View key={type} style={[styles.statRow, i % 2 === 1 && styles.statRowAlt]}>
            <ThemedText style={[styles.statSide, styles.statValue]}>
              {statVal(home, type)}
            </ThemedText>
            <ThemedText style={styles.statMid} numberOfLines={1}>
              {type}
            </ThemedText>
            <ThemedText style={[styles.statSide, styles.statValue, styles.statSideRight]}>
              {statVal(away, type)}
            </ThemedText>
          </View>
        ))}
      </View>
    );
  };

  const renderTeamLineup = (l: FixtureDetail["lineups"][number], idx: number) => (
    <View key={idx} style={[{ gap: Spacing.xs }, wide && styles.lineupColumn]}>
      <View style={styles.lineupHead}>
        <TeamBadge uri={l.team_logo} />
        <ThemedText style={styles.lineupTeam} numberOfLines={1}>
          {l.team_name ?? "Team"}
        </ThemedText>
        {l.formation ? (
          <ThemedText style={styles.lineupFormation}>{l.formation}</ThemedText>
        ) : null}
      </View>
      {l.coach ? (
        <ThemedText style={styles.lineupCoach}>Coach: {l.coach}</ThemedText>
      ) : null}
      <ThemedText style={styles.lineupSection}>Starting XI</ThemedText>
      {l.startXI.map((p, i) => (
        <View key={`s${i}`} style={styles.playerRow}>
          <ThemedText style={styles.playerNum}>{p.number ?? "-"}</ThemedText>
          <ThemedText style={styles.playerName} numberOfLines={1}>
            {p.name}
          </ThemedText>
          {p.pos ? <ThemedText style={styles.playerPos}>{p.pos}</ThemedText> : null}
        </View>
      ))}
      {l.substitutes.length ? (
        <>
          <ThemedText style={styles.lineupSection}>Substitutes</ThemedText>
          {l.substitutes.map((p, i) => (
            <View key={`b${i}`} style={styles.playerRow}>
              <ThemedText style={styles.playerNum}>{p.number ?? "-"}</ThemedText>
              <ThemedText
                style={[styles.playerName, styles.playerSub]}
                numberOfLines={1}
              >
                {p.name}
              </ThemedText>
              {p.pos ? <ThemedText style={styles.playerPos}>{p.pos}</ThemedText> : null}
            </View>
          ))}
        </>
      ) : null}
    </View>
  );

  const renderLineups = () => {
    if (!detail?.lineups?.length) {
      return <ThemedText style={styles.modalEmpty}>Lineups not announced yet.</ThemedText>;
    }
    return (
      <View style={wide ? styles.lineupRow : { gap: Spacing.lg }}>
        {detail.lineups.map((l, idx) => renderTeamLineup(l, idx))}
      </View>
    );
  };

  const renderEvents = () => {
    if (!detail?.events?.length) {
      return <ThemedText style={styles.modalEmpty}>No events yet.</ThemedText>;
    }
    return (
      <View style={{ gap: 2 }}>
        {detail.events.map((e, i) => (
          <View key={i} style={styles.eventRow}>
            <ThemedText style={styles.eventMinute}>{e.minute || "·"}</ThemedText>
            <View style={styles.eventIcon}>{eventIcon(e.type, e.detail)}</View>
            <View style={styles.eventBody}>
              <ThemedText style={styles.eventPlayer} numberOfLines={1}>
                {e.player ?? e.detail ?? e.type ?? "—"}
              </ThemedText>
              <ThemedText style={styles.eventMeta} numberOfLines={1}>
                {[e.team_name, e.assist ? `assist: ${e.assist}` : null, e.detail]
                  .filter(Boolean)
                  .join(" · ")}
              </ThemedText>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const tabBtn = (key: DetailTab, label: string) => (
    <Touchable
      style={[styles.modalTab, tab === key && styles.modalTabSelected]}
      activeStyle={styles.modalTabActive}
      onPress={() => setTab(key)}
    >
      {(active) => (
        <ThemedText
          style={[
            styles.modalTabText,
            (tab === key || active) && styles.modalTabTextSelected,
          ]}
        >
          {label}
        </ThemedText>
      )}
    </Touchable>
  );

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, wide && styles.modalCardWide]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalLeague} numberOfLines={1}>
              {target.leagueName.toUpperCase()}
            </ThemedText>
            <Touchable
              style={styles.modalClose}
              activeStyle={styles.modalCloseActive}
              onPress={onClose}
            >
              {(active) => (
                <Feather
                  name="x"
                  size={20}
                  color={active ? Colors.dark.accent : Colors.dark.text}
                />
              )}
            </Touchable>
          </View>

          <View style={styles.modalScore}>
            <View style={styles.modalTeam}>
              <TeamBadge uri={target.homeLogo} />
              <ThemedText style={styles.modalTeamName} numberOfLines={1}>
                {target.home}
              </ThemedText>
            </View>
            <View style={styles.modalScoreMid}>
              <ThemedText style={styles.modalScoreText}>
                {target.homeScore ?? 0} - {target.awayScore ?? 0}
              </ThemedText>
              <ThemedText style={styles.modalStatus}>{target.statusLabel}</ThemedText>
            </View>
            <View style={[styles.modalTeam, styles.modalTeamRight]}>
              <ThemedText style={[styles.modalTeamName, styles.modalTeamNameRight]} numberOfLines={1}>
                {target.away}
              </ThemedText>
              <TeamBadge uri={target.awayLogo} />
            </View>
          </View>

          {target.watchChannel ? (
            <Touchable
              style={styles.watchBtn}
              activeStyle={styles.watchBtnActive}
              onPress={() => onWatchLive(target.watchChannel!)}
            >
              {(active) => (
                <>
                  <Feather
                    name="play"
                    size={15}
                    color={active ? Colors.dark.accent : Colors.dark.backgroundRoot}
                  />
                  <ThemedText style={[styles.watchBtnText, active && styles.watchBtnTextActive]}>
                    Watch Live · {target.watchChannel!.channel_name}
                  </ThemedText>
                </>
              )}
            </Touchable>
          ) : null}

          {/* Tabs */}
          <View style={styles.modalTabs}>
            {tabBtn("stats", "Team Stats")}
            {tabBtn("lineups", "Lineups")}
            {tabBtn("events", "Events")}
          </View>

          {/* Body */}
          {loading ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator color={Colors.dark.accent} />
            </View>
          ) : (
            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={{ paddingBottom: Spacing.lg }}
            >
              {tab === "stats"
                ? renderStats()
                : tab === "lineups"
                ? renderLineups()
                : renderEvents()}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function LeagueFilterModal({
  visible,
  hidden,
  onToggle,
  onShowAll,
  onClearAll,
  onClose,
}: {
  visible: boolean;
  hidden: Set<number>;
  onToggle: (id: number) => void;
  onShowAll: () => void;
  onClearAll: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.filterBackdrop}>
        <View style={styles.filterCard}>
          <View style={styles.filterHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <ThemedText style={styles.filterTitle}>Choose Leagues</ThemedText>
              <ThemedText style={styles.filterSubtitle}>
                Pick which competitions show in Live Now and Upcoming.
              </ThemedText>
            </View>
            <Touchable style={styles.iconBtn} activeStyle={styles.iconBtnActive} onPress={onClose}>
              {(active) => (
                <Feather name="x" size={20} color={active ? Colors.dark.accent : Colors.dark.text} />
              )}
            </Touchable>
          </View>

          <View style={styles.filterActions}>
            <Touchable
              style={styles.showAllBtn}
              activeStyle={styles.showAllBtnActive}
              onPress={onShowAll}
            >
              {(active) => (
                <>
                  <Feather
                    name="check-circle"
                    size={15}
                    color={active ? Colors.dark.accent : Colors.dark.text}
                  />
                  <ThemedText
                    style={[styles.showAllText, active && { color: Colors.dark.accent }]}
                  >
                    Show all leagues
                  </ThemedText>
                </>
              )}
            </Touchable>
            <Touchable
              style={styles.showAllBtn}
              activeStyle={styles.showAllBtnActive}
              onPress={onClearAll}
            >
              {(active) => (
                <>
                  <Feather
                    name="x-circle"
                    size={15}
                    color={active ? Colors.dark.accent : Colors.dark.text}
                  />
                  <ThemedText
                    style={[styles.showAllText, active && { color: Colors.dark.accent }]}
                  >
                    Clear all leagues
                  </ThemedText>
                </>
              )}
            </Touchable>
          </View>

          <ScrollView
            style={{ alignSelf: "stretch" }}
            contentContainerStyle={{ gap: Spacing.md, paddingBottom: Spacing.sm }}
            showsVerticalScrollIndicator
          >
            {FOOTBALL_LEAGUE_GROUPS.map((group) => (
              <View key={group.group} style={{ gap: Spacing.xs }}>
                <ThemedText style={styles.filterGroupLabel}>{group.group}</ThemedText>
                {group.leagues.map((lg) => {
                  const on = !hidden.has(lg.id);
                  return (
                    <Touchable
                      key={lg.id}
                      style={styles.filterRow}
                      activeStyle={styles.filterRowActive}
                      onPress={() => onToggle(lg.id)}
                    >
                      {(active) => (
                        <>
                          <View style={[styles.checkbox, on && styles.checkboxOn]}>
                            {on ? <Feather name="check" size={13} color="#000" /> : null}
                          </View>
                          <ThemedText
                            style={[styles.filterRowText, active && { color: Colors.dark.accent }]}
                            numberOfLines={1}
                          >
                            {lg.name}
                          </ThemedText>
                        </>
                      )}
                    </Touchable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function FootballCentreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { liveStreams } = useData();
  const { prefs } = useFootball();
  const prefLeague = prefs.league_id;
  const { favouriteTeam } = useMatchReminder();
  const { activeProfile, isGuest } = useProfile();
  const profileKey = isGuest ? "guest" : activeProfile?.id ?? null;
  const favTeamId = favouriteTeam?.id ?? null;
  const favTeamIdRef = useRef<number | null>(favTeamId);
  favTeamIdRef.current = favTeamId;

  const [tab, setTab] = useState<"live" | "upcoming" | "myteam" | "ultrafour">("live");
  const [scores, setScores] = useState<FootballScore[]>([]);
  const [fixtures, setFixtures] = useState<FootballFixture[]>([]);
  const [channels, setChannels] = useState<FixtureChannel[]>([]);
  const [teamFixtures, setTeamFixtures] = useState<TeamFixture[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [hiddenLeagues, setHiddenLeagues] = useState<Set<number>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Leagues start collapsed (empty set = nothing expanded) so a busy day isn't
  // overwhelming. Keys are unique per group: `live-<leagueId>` or
  // `up-<dateKey>-<leagueId>`.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // Pin the profile's preferred league to the very top of every group list,
  // otherwise fall back to the curated English-first ordering.
  const rank = useCallback(
    (id: number) => (prefLeague != null && id === prefLeague ? -1 : leagueRank(id)),
    [prefLeague],
  );

  const padH = Math.max(insets.left + Spacing.sm, Spacing.lg);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);

  // Responsive grid: cap at 3-4 cards per row so a single match never spans the
  // full width and ultra-wide TVs don't end up with 6+ tiny cards in a row.
  const { width: winW } = useWindowDimensions();
  const gridGap = Spacing.sm;
  const gridAvail = winW - padH * 2;
  const columns =
    gridAvail >= 1100 ? 4 : gridAvail >= 760 ? 3 : gridAvail >= 480 ? 2 : 1;
  const cardWidth = Math.floor(
    (gridAvail - gridGap * (columns - 1)) / columns,
  );

  const fetchScores = useCallback(async () => {
    try {
      const url = new URL("/api/football/centre/scores", getApiUrl());
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setScores(Array.isArray(data) ? data : []);
      }
    } catch {
      // silent
    }
  }, []);

  const fetchFixtures = useCallback(async () => {
    try {
      const url = new URL("/api/football/centre/fixtures", getApiUrl());
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setFixtures(Array.isArray(data) ? data : []);
      }
    } catch {
      // silent
    }
  }, []);

  const fetchChannels = useCallback(async () => {
    try {
      const url = new URL("/api/football/centre/channels", getApiUrl());
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setChannels(Array.isArray(data) ? data : []);
      }
    } catch {
      // silent
    }
  }, []);

  const fetchTeamFixtures = useCallback(async () => {
    // Always reset on a (re)fetch so a team switch or a failed request can never
    // leave the prior team's fixtures on screen under the new team's header.
    setTeamFixtures([]);
    if (!favTeamId) return;
    const requestedTeamId = favTeamId;
    setTeamLoading(true);
    try {
      const url = new URL("/api/football/team-fixtures", getApiUrl());
      url.searchParams.set("team_id", String(requestedTeamId));
      const res = await fetch(url.toString());
      // Guard against a stale response landing after the favourite team changed.
      if (requestedTeamId !== favTeamIdRef.current) return;
      setTeamFixtures(res.ok ? await res.json().then((d) => (Array.isArray(d) ? d : [])) : []);
    } catch {
      if (requestedTeamId === favTeamIdRef.current) setTeamFixtures([]);
    } finally {
      if (requestedTeamId === favTeamIdRef.current) setTeamLoading(false);
    }
  }, [favTeamId]);

  // Poll live scores every 30s while focused; fetch fixtures + channels once
  // on focus (fixtures are a once-a-day server cache, channels rarely change).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      Promise.all([fetchScores(), fetchFixtures(), fetchChannels()]).finally(
        () => {
          if (active) setLoading(false);
        },
      );
      fetchTeamFixtures();
      const id = setInterval(() => {
        fetchScores();
        fetchChannels();
      }, SCORES_POLL_MS);
      return () => {
        active = false;
        clearInterval(id);
      };
    }, [fetchScores, fetchFixtures, fetchChannels, fetchTeamFixtures]),
  );

  // Load the per-profile hidden-league filter once we know the profile.
  useEffect(() => {
    let active = true;
    if (!profileKey) {
      setHiddenLeagues(new Set());
      return;
    }
    loadHiddenLeagues(profileKey).then((set) => {
      if (active) setHiddenLeagues(set);
    });
    return () => {
      active = false;
    };
  }, [profileKey]);

  const toggleLeague = useCallback(
    (id: number) => {
      setHiddenLeagues((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        if (profileKey) saveHiddenLeagues(profileKey, next);
        return next;
      });
    },
    [profileKey],
  );

  const showAllLeagues = useCallback(() => {
    setHiddenLeagues(new Set());
    if (profileKey) saveHiddenLeagues(profileKey, new Set());
  }, [profileKey]);

  const clearAllLeagues = useCallback(() => {
    const all = new Set<number>();
    for (const group of FOOTBALL_LEAGUE_GROUPS) {
      for (const lg of group.leagues) all.add(lg.id);
    }
    setHiddenLeagues(all);
    if (profileKey) saveHiddenLeagues(profileKey, all);
  }, [profileKey]);

  // fixture_id -> channels[]
  const channelMap = useMemo(() => {
    const m = new Map<number, FixtureChannel[]>();
    for (const c of channels) {
      const arr = m.get(c.fixture_id) ?? [];
      arr.push(c);
      m.set(c.fixture_id, arr);
    }
    return m;
  }, [channels]);

  // Live scores grouped by league, English-first. Leagues the user has hidden
  // via the filter are excluded.
  const scoreGroups = useMemo(() => {
    const m = new Map<number, { name: string; rows: FootballScore[] }>();
    for (const s of scores) {
      if (hiddenLeagues.has(s.league_id)) continue;
      const key = s.league_id;
      const g = m.get(key) ?? { name: s.league_name ?? "Football", rows: [] };
      g.rows.push(s);
      m.set(key, g);
    }
    const groups = Array.from(m.entries()).map(([league_id, g]) => ({
      league_id,
      name: g.name,
      rows: g.rows.sort((a, b) =>
        (a.home_team ?? "").localeCompare(b.home_team ?? ""),
      ),
    }));
    return groups.sort((a, b) => rank(a.league_id) - rank(b.league_id));
  }, [scores, rank, hiddenLeagues]);

  // Any fixture currently in the live-scores cache is no longer "upcoming",
  // so exclude it from the Upcoming tab to avoid showing a game in both lists.
  const liveIds = useMemo(
    () => new Set(scores.map((s) => s.fixture_id)),
    [scores],
  );

  // Upcoming fixtures grouped by day, then league (English-first within a day).
  const fixtureDays = useMemo(() => {
    // The fixtures cache is refreshed only once a day, so a same-day game that
    // has already kicked off (and since dropped out of the live cache) would
    // otherwise linger here. Exclude anything whose kickoff is in the past, plus
    // anything already in the live cache or flagged finished. Kickoff time is
    // the reliable signal since the cached status_short is stale (fetched once).
    const now = Date.now();
    const byDay = new Map<string, FootballFixture[]>();
    for (const f of fixtures) {
      if (hiddenLeagues.has(f.league_id)) continue;
      if (liveIds.has(f.fixture_id)) continue;
      const ko = f.kickoff ? new Date(f.kickoff).getTime() : NaN;
      if (!isNaN(ko) && ko <= now) continue;
      if (FINISHED.includes((f.status_short || "").toUpperCase())) continue;
      const arr = byDay.get(f.date_key) ?? [];
      arr.push(f);
      byDay.set(f.date_key, arr);
    }
    const days = Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date_key, list]) => {
        const leagues = new Map<number, { name: string; rows: FootballFixture[] }>();
        for (const f of list) {
          const g = leagues.get(f.league_id) ?? {
            name: f.league_name ?? "Football",
            rows: [],
          };
          g.rows.push(f);
          leagues.set(f.league_id, g);
        }
        const groups = Array.from(leagues.entries())
          .map(([league_id, g]) => ({
            league_id,
            name: g.name,
            rows: g.rows.sort((a, b) =>
              (a.kickoff ?? "").localeCompare(b.kickoff ?? ""),
            ),
          }))
          .sort((a, b) => rank(a.league_id) - rank(b.league_id));
        return { date_key, groups };
      });
    return days;
  }, [fixtures, rank, liveIds, hiddenLeagues]);

  // Favourite-team fixtures grouped by day (chronological). One team means at
  // most one game per league per day, so a flat day list is clearer than the
  // league sub-grouping used for Live/Upcoming. Not affected by the league
  // filter — this tab is the user's team across every competition.
  const teamFixtureDays = useMemo(() => {
    const now = Date.now();
    const byDay = new Map<string, TeamFixture[]>();
    for (const f of teamFixtures) {
      const ko = f.kickoff ? new Date(f.kickoff).getTime() : NaN;
      if (!isNaN(ko) && ko <= now - 3 * 60 * 60 * 1000) continue;
      const dateKey = f.kickoff
        ? new Date(f.kickoff).toISOString().slice(0, 10)
        : "";
      const arr = byDay.get(dateKey) ?? [];
      arr.push(f);
      byDay.set(dateKey, arr);
    }
    return Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date_key, list]) => ({
        date_key,
        rows: list.sort((a, b) =>
          (a.kickoff ?? "").localeCompare(b.kickoff ?? ""),
        ),
      }));
  }, [teamFixtures]);

  const handleChannelPress = useCallback(
    (ch: FixtureChannel) => {
      // Resolve the linked stream against the cached live streams. If it isn't
      // there (id missing, unmapped, or not in this user's package) keep the
      // badge but show a graceful message rather than opening a dead channel.
      const sid = ch.stream_id != null ? Number(ch.stream_id) : NaN;
      const stream = Number.isFinite(sid)
        ? liveStreams.find((s) => s.stream_id === sid)
        : undefined;
      if (!stream) {
        showToast("Channel unavailable");
        return;
      }
      navigation.navigate("LivePreview", {
        streamId: stream.stream_id,
        name: stream.name ?? ch.channel_name,
        streamUrl: xtreamApi.getLiveStreamUrl(stream.stream_id),
        thumbnail: stream.stream_icon ?? undefined,
        streamIcon: stream.stream_icon ?? undefined,
        categoryId: stream.category_id,
        initialFullscreen: true,
      });
    },
    [liveStreams, navigation, showToast],
  );

  const openDetail = useCallback(
    (s: FootballScore) => {
      const chans = channelMap.get(s.fixture_id) ?? [];
      setDetailTarget({
        fixtureId: s.fixture_id,
        home: s.home_team ?? "?",
        away: s.away_team ?? "?",
        homeLogo: s.home_logo,
        awayLogo: s.away_logo,
        homeScore: s.home_goals,
        awayScore: s.away_goals,
        statusLabel: minuteLabel(s),
        leagueName: s.league_name ?? "Football",
        watchChannel: chans.length ? chans[0] : null,
      });
    },
    [channelMap],
  );

  const renderEmpty = (msg: string) => (
    <View style={styles.emptyBox}>
      <MaterialCommunityIcons
        name="soccer"
        size={40}
        color={Colors.dark.textSecondary}
      />
      <ThemedText style={styles.emptyText}>{msg}</ThemedText>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <SideMenuButton />
        <Touchable
          style={styles.iconBtn}
          activeStyle={styles.iconBtnActive}
          onPress={() => navigation.goBack()}
        >
          {(active) => (
            <Feather
              name="arrow-left"
              size={20}
              color={active ? Colors.dark.accent : Colors.dark.text}
            />
          )}
        </Touchable>
        <View style={styles.titleWrap}>
          <MaterialCommunityIcons name="soccer" size={20} color={Colors.dark.accent} />
          <ThemedText style={styles.headerTitle}>Football Centre</ThemedText>
        </View>
        {tab === "myteam" ? (
          <View style={styles.iconBtn} />
        ) : (
          <Touchable
            style={styles.iconBtn}
            activeStyle={styles.iconBtnActive}
            onPress={() => setFilterOpen(true)}
          >
            {(active) => (
              <>
                <Feather
                  name="sliders"
                  size={20}
                  color={
                    hiddenLeagues.size > 0
                      ? Colors.dark.accent
                      : active
                        ? Colors.dark.accent
                        : Colors.dark.text
                  }
                />
                {hiddenLeagues.size > 0 ? <View style={styles.filterDot} /> : null}
              </>
            )}
          </Touchable>
        )}
      </View>

      {/* Tab switch */}
      <View style={[styles.tabRow, { marginHorizontal: padH }]}>
        <Touchable
          style={[styles.tab, tab === "live" && styles.tabSelected]}
          activeStyle={styles.tabActive}
          onPress={() => setTab("live")}
        >
          {(active) => (
            <>
              <View style={styles.liveDot} />
              <ThemedText
                style={[
                  styles.tabText,
                  (tab === "live" || active) && styles.tabTextSelected,
                ]}
              >
                Live Now
              </ThemedText>
            </>
          )}
        </Touchable>
        <Touchable
          style={[styles.tab, tab === "upcoming" && styles.tabSelected]}
          activeStyle={styles.tabActive}
          onPress={() => setTab("upcoming")}
        >
          {(active) => (
            <ThemedText
              style={[
                styles.tabText,
                (tab === "upcoming" || active) && styles.tabTextSelected,
              ]}
            >
              Upcoming
            </ThemedText>
          )}
        </Touchable>
        <Touchable
          style={[styles.tab, tab === "myteam" && styles.tabSelected]}
          activeStyle={styles.tabActive}
          onPress={() => setTab("myteam")}
        >
          {(active) => (
            <ThemedText
              style={[
                styles.tabText,
                (tab === "myteam" || active) && styles.tabTextSelected,
              ]}
              numberOfLines={1}
            >
              My Team
            </ThemedText>
          )}
        </Touchable>
        <Touchable
          style={[styles.tab, tab === "ultrafour" && styles.tabSelected]}
          activeStyle={styles.tabActive}
          onPress={() => setTab("ultrafour")}
        >
          {(active) => (
            <ThemedText
              style={[
                styles.tabText,
                (tab === "ultrafour" || active) && styles.tabTextSelected,
              ]}
              numberOfLines={1}
            >
              Ultra 4
            </ThemedText>
          )}
        </Touchable>
      </View>

      {tab === "ultrafour" ? (
        // Ultra Four has its own loading/scrolling — bypass the main football loading guard
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: padH,
            paddingTop: Spacing.md,
            paddingBottom: insets.bottom + Spacing.xl,
            gap: Spacing.lg,
          }}
          scrollIndicatorInsets={{ bottom: insets.bottom }}
        >
          <UltraFourTab username={activeProfile?.account_username} />
        </ScrollView>
      ) : loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={Colors.dark.accent} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: padH,
            paddingTop: Spacing.md,
            paddingBottom: insets.bottom + Spacing.xl,
            gap: Spacing.lg,
          }}
          scrollIndicatorInsets={{ bottom: insets.bottom }}
        >
          {tab === "live"
            ? scoreGroups.length === 0
              ? renderEmpty("No live games right now")
              : scoreGroups.map((g) => {
                  const key = `live-${g.league_id}`;
                  return (
                    <CollapsibleLeague
                      key={g.league_id}
                      name={g.name}
                      count={g.rows.length}
                      isPref={g.league_id === prefLeague}
                      expanded={expandedGroups.has(key)}
                      onToggle={() => toggleGroup(key)}
                    >
                      <View style={styles.cardGrid}>
                        {g.rows.map((s) => (
                          <MatchCard
                            key={s.fixture_id}
                            home={s.home_team ?? "?"}
                            away={s.away_team ?? "?"}
                            homeLogo={s.home_logo}
                            awayLogo={s.away_logo}
                            homeScore={s.home_goals}
                            awayScore={s.away_goals}
                            statusLabel={minuteLabel(s)}
                            live={isLive(s)}
                            upcoming={false}
                            channels={channelMap.get(s.fixture_id) ?? []}
                            onChannelPress={handleChannelPress}
                            onCardPress={() => openDetail(s)}
                            cardWidth={cardWidth}
                          />
                        ))}
                      </View>
                    </CollapsibleLeague>
                  );
                })
            : tab === "upcoming" ? (
              <>
                <ChannelNotice />
                {fixtureDays.length === 0
                  ? renderEmpty("No upcoming fixtures")
                  : fixtureDays.map((day) => (
                  <View key={day.date_key} style={{ gap: Spacing.sm }}>
                    <ThemedText style={styles.dayHeader}>
                      {dayLabel(day.date_key)}
                    </ThemedText>
                    {day.groups.map((g) => {
                      const key = `up-${day.date_key}-${g.league_id}`;
                      return (
                        <CollapsibleLeague
                          key={g.league_id}
                          name={g.name}
                          count={g.rows.length}
                          isPref={g.league_id === prefLeague}
                          expanded={expandedGroups.has(key)}
                          onToggle={() => toggleGroup(key)}
                        >
                          <View style={styles.cardGrid}>
                            {g.rows.map((f) => (
                              <MatchCard
                                key={f.fixture_id}
                                home={f.home_team ?? "?"}
                                away={f.away_team ?? "?"}
                                homeLogo={f.home_logo}
                                awayLogo={f.away_logo}
                                statusLabel={kickoffLabel(f.kickoff)}
                                live={false}
                                upcoming
                                channels={channelMap.get(f.fixture_id) ?? []}
                                onChannelPress={handleChannelPress}
                                cardWidth={cardWidth}
                              />
                            ))}
                          </View>
                        </CollapsibleLeague>
                      );
                    })}
                  </View>
                ))}
              </>
            ) : !favTeamId ? (
              <View style={styles.emptyBox}>
                <MaterialCommunityIcons
                  name="account-star-outline"
                  size={40}
                  color={Colors.dark.textSecondary}
                />
                <ThemedText style={styles.emptyText}>
                  No favourite team set yet
                </ThemedText>
                <Touchable
                  style={styles.emptyCta}
                  activeStyle={styles.emptyCtaActive}
                  onPress={() => navigation.navigate("FootballSettings")}
                >
                  {(active) => (
                    <ThemedText
                      style={[
                        styles.emptyCtaText,
                        active && { color: Colors.dark.accent },
                      ]}
                    >
                      Choose a team in Football settings
                    </ThemedText>
                  )}
                </Touchable>
              </View>
            ) : teamLoading && teamFixtureDays.length === 0 ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={Colors.dark.accent} />
              </View>
            ) : teamFixtureDays.length === 0 ? (
              renderEmpty(
                `No upcoming fixtures for ${favouriteTeam?.name ?? "your team"}`,
              )
            ) : (
              <>
                {favouriteTeam ? (
                  <View style={styles.teamHeader}>
                    {favouriteTeam.logo ? (
                      <Image
                        source={{ uri: favouriteTeam.logo }}
                        style={styles.teamHeaderLogo}
                        contentFit="contain"
                      />
                    ) : null}
                    <ThemedText style={styles.teamHeaderName} numberOfLines={1}>
                      {favouriteTeam.name}
                    </ThemedText>
                  </View>
                ) : null}
                <ChannelNotice />
                {teamFixtureDays.map((day) => (
                  <View key={day.date_key} style={{ gap: Spacing.sm }}>
                    <ThemedText style={styles.dayHeader}>
                      {dayLabel(day.date_key)}
                    </ThemedText>
                    <View style={styles.cardGrid}>
                      {day.rows.map((f) => (
                        <MatchCard
                          key={f.fixture_id}
                          home={f.home_team ?? "?"}
                          away={f.away_team ?? "?"}
                          homeLogo={f.home_logo}
                          awayLogo={f.away_logo}
                          statusLabel={kickoffLabel(f.kickoff)}
                          live={false}
                          upcoming
                          leagueLabel={f.league_name ?? undefined}
                          channels={channelMap.get(f.fixture_id) ?? []}
                          onChannelPress={handleChannelPress}
                          cardWidth={cardWidth}
                        />
                      ))}
                    </View>
                  </View>
                ))}
              </>
            )}
        </ScrollView>
      )}

      <LeagueFilterModal
        visible={filterOpen}
        hidden={hiddenLeagues}
        onToggle={toggleLeague}
        onShowAll={showAllLeagues}
        onClearAll={clearAllLeagues}
        onClose={() => setFilterOpen(false)}
      />

      <GameDetailModal
        target={detailTarget}
        onClose={() => setDetailTarget(null)}
        onWatchLive={(ch) => {
          setDetailTarget(null);
          handleChannelPress(ch);
        }}
      />

      {toast ? (
        <View pointerEvents="none" style={[styles.toast, { bottom: insets.bottom + Spacing.lg }]}>
          <Feather name="alert-circle" size={14} color={Colors.dark.text} />
          <ThemedText style={styles.toastText}>{toast}</ThemedText>
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  titleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  iconBtnActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accentDim,
  },
  tabRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    flex: 1,
    height: 44,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  tabSelected: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accentDim,
  },
  tabActive: {
    borderColor: Colors.dark.accent,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
  },
  tabTextSelected: {
    color: Colors.dark.accent,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#3ddc84",
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["4xl"],
    gap: Spacing.md,
  },
  emptyText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  emptyCta: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  emptyCtaActive: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderColor: Colors.dark.accent,
  },
  emptyCtaText: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: "700",
  },
  teamHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  teamHeaderLogo: {
    width: 28,
    height: 28,
  },
  teamHeaderName: {
    flex: 1,
    minWidth: 0,
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: "800",
  },
  cardLeague: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  filterDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.accent,
  },
  filterBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  filterCard: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "86%",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "#242424",
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  filterHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  filterTitle: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: "800",
  },
  filterSubtitle: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  filterActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  showAllBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderWidth: 1,
    borderColor: "#242424",
  },
  showAllBtnActive: {
    borderColor: Colors.dark.accent,
  },
  showAllText: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: "700",
  },
  filterGroupLabel: {
    color: Colors.dark.accent,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: Spacing.xs,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  filterRowActive: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderColor: Colors.dark.accent,
  },
  filterRowText: {
    flex: 1,
    minWidth: 0,
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: "600",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.dark.textSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  leagueHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  leagueHeaderActive: {
    backgroundColor: "rgba(255, 102, 0, 0.32)",
    borderColor: Colors.dark.accentHover,
  },
  leagueHeaderPref: {
    backgroundColor: Colors.dark.accentDim,
    borderColor: Colors.dark.accent,
  },
  leagueCount: {
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
  },
  leagueCountText: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  toast: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.lg,
    backgroundColor: "rgba(0,0,0,0.92)",
    borderWidth: 1,
    borderColor: Colors.dark.accent,
  },
  toastText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  leagueName: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "800",
    color: Colors.dark.accent,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  dayHeader: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.dark.text,
    marginBottom: 2,
  },
  cardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  gameCard: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    gap: 2,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    minHeight: 22,
    marginBottom: 2,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  statusPillLive: {
    backgroundColor: "rgba(61,220,132,0.12)",
    borderWidth: 1,
    borderColor: "rgba(61,220,132,0.5)",
  },
  statusPillUpcoming: {
    backgroundColor: Colors.dark.accentDim,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.dark.textSecondary,
    letterSpacing: 0.3,
  },
  statusTextLive: {
    color: "#3ddc84",
  },
  statusTextUpcoming: {
    color: Colors.dark.accent,
  },
  teamLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    paddingVertical: 5,
  },
  noticeBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255,102,0,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.35)",
  },
  noticeIcon: {
    marginTop: 1,
  },
  noticeText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: Colors.dark.textSecondary ?? Colors.dark.text,
  },
  teamInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  teamLogo: {
    width: 22,
    height: 22,
  },
  teamLogoPlaceholder: {
    width: 22,
    height: 22,
  },
  teamName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  teamScore: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.dark.text,
    minWidth: 26,
    textAlign: "right",
  },
  teamScoreLive: {
    color: Colors.dark.accent,
  },
  channelWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingTop: Spacing.sm,
  },
  channelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(61,220,132,0.4)",
    backgroundColor: "rgba(61,220,132,0.1)",
    maxWidth: 220,
  },
  channelBadgeActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accentDim,
  },
  channelText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  cardPressable: {
    gap: 2,
    borderRadius: BorderRadius.sm,
  },
  cardPressableActive: {
    backgroundColor: Colors.dark.accentDim,
    marginHorizontal: -Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  statsHint: {
    marginLeft: 6,
  },
  // ── Game detail modal ─────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "92%",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  modalCardWide: {
    maxWidth: 900,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalLeague: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: Colors.dark.accent,
  },
  modalClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundRoot,
  },
  modalCloseActive: {
    backgroundColor: Colors.dark.accentDim,
  },
  modalScore: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  modalTeam: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  modalTeamRight: {
    justifyContent: "flex-end",
  },
  modalTeamName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  modalTeamNameRight: {
    textAlign: "right",
  },
  modalScoreMid: {
    alignItems: "center",
    minWidth: 84,
  },
  modalScoreText: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.accent,
  },
  modalStatus: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
  },
  watchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.accent,
    borderWidth: 1,
    borderColor: Colors.dark.accent,
  },
  watchBtnActive: {
    backgroundColor: Colors.dark.accentDim,
  },
  watchBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.dark.backgroundRoot,
  },
  watchBtnTextActive: {
    color: Colors.dark.accent,
  },
  modalTabs: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  modalTab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1,
    borderColor: "transparent",
  },
  modalTabSelected: {
    borderColor: Colors.dark.accent,
  },
  modalTabActive: {
    borderColor: Colors.dark.accentHover,
    backgroundColor: Colors.dark.accentDim,
  },
  modalTabText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
  },
  modalTabTextSelected: {
    color: Colors.dark.accent,
  },
  modalBody: {
    flexGrow: 0,
  },
  modalLoading: {
    paddingVertical: Spacing.xl,
    alignItems: "center",
  },
  modalEmpty: {
    paddingVertical: Spacing.lg,
    textAlign: "center",
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  statRowAlt: {
    backgroundColor: Colors.dark.backgroundRoot,
  },
  statHeaderRow: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  statHeaderText: {
    fontSize: 12,
    fontWeight: "800",
    color: Colors.dark.textSecondary,
  },
  statSide: {
    flex: 1,
  },
  statSideRight: {
    textAlign: "right",
  },
  statValue: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  statMid: {
    flex: 1.4,
    textAlign: "center",
    fontSize: 12.5,
    color: Colors.dark.textSecondary,
  },
  lineupRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.xl,
  },
  lineupColumn: {
    flex: 1,
    minWidth: 0,
  },
  lineupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  lineupTeam: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  lineupFormation: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.accent,
  },
  lineupCoach: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  lineupSection: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: Colors.dark.accent,
    marginTop: Spacing.xs,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 3,
  },
  playerNum: {
    width: 24,
    fontSize: 12,
    fontWeight: "800",
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  playerName: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  playerSub: {
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  playerPos: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 6,
  },
  eventMinute: {
    width: 34,
    fontSize: 12,
    fontWeight: "800",
    color: Colors.dark.accent,
  },
  eventIcon: {
    width: 18,
    alignItems: "center",
  },
  cardChip: {
    width: 10,
    height: 13,
    borderRadius: 2,
  },
  eventBody: {
    flex: 1,
  },
  eventPlayer: {
    fontSize: 13.5,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  eventMeta: {
    fontSize: 11.5,
    color: Colors.dark.textSecondary,
  },
});
