import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { getApiUrl } from "@/lib/query-client";
import { useData } from "@/contexts/DataContext";
import { xtreamApi } from "@/lib/xtream-api";
import { leagueRank } from "@/constants/football-leagues";
import { useFootball, type FootballScore } from "@/contexts/FootballContext";

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

const SCORES_POLL_MS = 30000;
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
  onPress: () => void;
  children: React.ReactNode | ((active: boolean) => React.ReactNode);
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const active = focused || pressed;
  return (
    <Pressable
      style={[style, active && activeStyle]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      {typeof children === "function" ? children(active) : children}
    </Pressable>
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

function MatchCard({
  home,
  away,
  homeScore,
  awayScore,
  statusLabel,
  live,
  upcoming,
  channels,
  onChannelPress,
  cardWidth,
}: {
  home: string;
  away: string;
  homeScore?: number;
  awayScore?: number;
  statusLabel: string;
  live: boolean;
  upcoming: boolean;
  channels: FixtureChannel[];
  onChannelPress: (ch: FixtureChannel) => void;
  cardWidth: number;
}) {
  return (
    <View style={[styles.gameCard, { width: cardWidth }]}>
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
      </View>

      <View style={styles.teamLine}>
        <ThemedText style={styles.teamName} numberOfLines={1}>
          {home}
        </ThemedText>
        {!upcoming ? (
          <ThemedText style={[styles.teamScore, live && styles.teamScoreLive]}>
            {homeScore ?? 0}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.teamLine}>
        <ThemedText style={styles.teamName} numberOfLines={1}>
          {away}
        </ThemedText>
        {!upcoming ? (
          <ThemedText style={[styles.teamScore, live && styles.teamScoreLive]}>
            {awayScore ?? 0}
          </ThemedText>
        ) : null}
      </View>

      <ChannelBadges channels={channels} onPress={onChannelPress} />
    </View>
  );
}

export default function FootballCentreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { liveStreams } = useData();
  const { prefs } = useFootball();
  const prefLeague = prefs.league_id;

  const [tab, setTab] = useState<"live" | "upcoming">("live");
  const [scores, setScores] = useState<FootballScore[]>([]);
  const [fixtures, setFixtures] = useState<FootballFixture[]>([]);
  const [channels, setChannels] = useState<FixtureChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const id = setInterval(() => {
        fetchScores();
        fetchChannels();
      }, SCORES_POLL_MS);
      return () => {
        active = false;
        clearInterval(id);
      };
    }, [fetchScores, fetchFixtures, fetchChannels]),
  );

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

  // Live scores grouped by league, English-first.
  const scoreGroups = useMemo(() => {
    const m = new Map<number, { name: string; rows: FootballScore[] }>();
    for (const s of scores) {
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
  }, [scores, rank]);

  // Any fixture currently in the live-scores cache is no longer "upcoming",
  // so exclude it from the Upcoming tab to avoid showing a game in both lists.
  const liveIds = useMemo(
    () => new Set(scores.map((s) => s.fixture_id)),
    [scores],
  );

  // Upcoming fixtures grouped by day, then league (English-first within a day).
  const fixtureDays = useMemo(() => {
    const byDay = new Map<string, FootballFixture[]>();
    for (const f of fixtures) {
      if (liveIds.has(f.fixture_id)) continue;
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
  }, [fixtures, rank, liveIds]);

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
        <View style={styles.iconBtn} />
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
      </View>

      {loading ? (
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
              : scoreGroups.map((g) => (
                  <View key={g.league_id} style={{ gap: Spacing.sm }}>
                    <View
                      style={[
                        styles.leagueHeader,
                        g.league_id === prefLeague && styles.leagueHeaderPref,
                      ]}
                    >
                      {g.league_id === prefLeague ? (
                        <Feather name="star" size={12} color={Colors.dark.accent} />
                      ) : null}
                      <ThemedText style={styles.leagueName} numberOfLines={1}>
                        {g.name}
                      </ThemedText>
                    </View>
                    <View style={styles.cardGrid}>
                      {g.rows.map((s) => (
                        <MatchCard
                          key={s.fixture_id}
                          home={s.home_team ?? "?"}
                          away={s.away_team ?? "?"}
                          homeScore={s.home_goals}
                          awayScore={s.away_goals}
                          statusLabel={minuteLabel(s)}
                          live={isLive(s)}
                          upcoming={false}
                          channels={channelMap.get(s.fixture_id) ?? []}
                          onChannelPress={handleChannelPress}
                          cardWidth={cardWidth}
                        />
                      ))}
                    </View>
                  </View>
                ))
            : fixtureDays.length === 0
              ? renderEmpty("No upcoming fixtures")
              : fixtureDays.map((day) => (
                  <View key={day.date_key} style={{ gap: Spacing.sm }}>
                    <ThemedText style={styles.dayHeader}>
                      {dayLabel(day.date_key)}
                    </ThemedText>
                    {day.groups.map((g) => (
                      <View key={g.league_id} style={{ gap: Spacing.sm }}>
                        <View
                          style={[
                            styles.leagueHeader,
                            g.league_id === prefLeague && styles.leagueHeaderPref,
                          ]}
                        >
                          {g.league_id === prefLeague ? (
                            <Feather name="star" size={12} color={Colors.dark.accent} />
                          ) : null}
                          <ThemedText style={styles.leagueName} numberOfLines={1}>
                            {g.name}
                          </ThemedText>
                        </View>
                        <View style={styles.cardGrid}>
                          {g.rows.map((f) => (
                            <MatchCard
                              key={f.fixture_id}
                              home={f.home_team ?? "?"}
                              away={f.away_team ?? "?"}
                              statusLabel={kickoffTime(f.kickoff)}
                              live={false}
                              upcoming
                              channels={channelMap.get(f.fixture_id) ?? []}
                              onChannelPress={handleChannelPress}
                              cardWidth={cardWidth}
                            />
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
        </ScrollView>
      )}

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
  leagueHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingLeft: 2,
  },
  leagueHeaderPref: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.accentDim,
    borderWidth: 1,
    borderColor: Colors.dark.accent,
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
});
