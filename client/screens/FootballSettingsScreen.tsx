import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useFootball, FootballCorner } from "@/contexts/FootballContext";
import { useProfile } from "@/contexts/ProfileContext";
import { useMatchReminder, type FavTeam } from "@/contexts/MatchReminderContext";
import { FOOTBALL_LEAGUE_GROUPS } from "@/constants/football-leagues";
import { getApiUrl } from "@/lib/query-client";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const CORNERS: { key: FootballCorner; label: string }[] = [
  { key: "top-left", label: "Top Left" },
  { key: "top-right", label: "Top Right" },
  { key: "middle-left", label: "Middle Left" },
  { key: "middle-right", label: "Middle Right" },
  { key: "bottom-left", label: "Bottom Left" },
  { key: "bottom-right", label: "Bottom Right" },
];

interface FixtureRow {
  fixture_id: number;
  league_name: string | null;
  home_team: string | null;
  away_team: string | null;
  home_logo: string | null;
  away_logo: string | null;
  kickoff: string | null;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Format an ISO kickoff into the device's local date + time (manual, so it
// doesn't depend on Intl being present on Fire OS / Hermes).
function formatKickoff(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "Date TBC", time: "" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: "Date TBC", time: "" };
  const date = `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { date, time };
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

/** A grouped settings surface. Controls sit on a slightly lighter tier inside. */
function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function CardHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.cardHeader}>
      <View style={styles.cardIcon}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <ThemedText style={styles.cardTitle}>{title}</ThemedText>
        <ThemedText style={styles.cardSubtitle}>{subtitle}</ThemedText>
      </View>
    </View>
  );
}

function SubLabel({ label }: { label: string }) {
  return <ThemedText style={styles.subLabel}>{label}</ThemedText>;
}

function TeamBadge({ logo, size = 40 }: { logo: string | null; size?: number }) {
  if (!logo) {
    return (
      <View style={[styles.badgeFallback, { width: size, height: size, borderRadius: size / 2 }]}>
        <MaterialCommunityIcons name="shield-outline" size={size * 0.55} color={Colors.dark.textSecondary} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: logo }}
      style={{ width: size, height: size }}
      contentFit="contain"
      transition={120}
    />
  );
}

function TeamFixturesModal({
  visible,
  team,
  onClose,
}: {
  visible: boolean;
  team: FavTeam | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<FixtureRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teamId = team?.id ?? null;
  const teamName = team?.name ?? "";

  useEffect(() => {
    if (!visible || teamId == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRows([]);
    (async () => {
      try {
        const url = new URL("/api/football/team-fixtures", getApiUrl());
        url.searchParams.set("team_id", String(teamId));
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setError("Couldn't load fixtures. Check your connection and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, teamId]);

  const favName = (team?.name ?? "").trim().toLowerCase();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <ThemedText style={styles.modalTitle}>Upcoming Fixtures</ThemedText>
              {teamName ? (
                <ThemedText style={styles.modalSubtitle} numberOfLines={1}>
                  {teamName}
                </ThemedText>
              ) : null}
            </View>
            <Touchable style={styles.modalClose} activeStyle={styles.modalCloseActive} onPress={onClose}>
              {(active) => (
                <Feather name="x" size={20} color={active ? Colors.dark.accent : Colors.dark.text} />
              )}
            </Touchable>
          </View>

          {loading ? (
            <View style={styles.modalState}>
              <ActivityIndicator color={Colors.dark.accent} />
            </View>
          ) : error ? (
            <View style={styles.modalState}>
              <Feather name="wifi-off" size={22} color={Colors.dark.textSecondary} />
              <ThemedText style={styles.modalStateText}>{error}</ThemedText>
            </View>
          ) : rows.length === 0 ? (
            <View style={styles.modalState}>
              <Feather name="calendar" size={22} color={Colors.dark.textSecondary} />
              <ThemedText style={styles.modalStateText}>
                No upcoming fixtures scheduled right now.
              </ThemedText>
            </View>
          ) : (
            <ScrollView
              style={{ alignSelf: "stretch" }}
              contentContainerStyle={{ gap: Spacing.sm, paddingBottom: Spacing.xs }}
              showsVerticalScrollIndicator
            >
              {rows.map((f) => {
                const { date, time } = formatKickoff(f.kickoff);
                const homeFav = (f.home_team ?? "").trim().toLowerCase() === favName;
                const awayFav = (f.away_team ?? "").trim().toLowerCase() === favName;
                return (
                  <View key={f.fixture_id} style={styles.fxRow}>
                    <View style={styles.fxWhen}>
                      <ThemedText style={styles.fxDate}>{date}</ThemedText>
                      {time ? <ThemedText style={styles.fxTime}>{time}</ThemedText> : null}
                    </View>
                    <View style={styles.fxMatch}>
                      <View style={styles.fxTeam}>
                        <TeamBadge logo={f.home_logo} size={22} />
                        <ThemedText
                          style={[styles.fxTeamName, homeFav && styles.fxTeamNameFav]}
                          numberOfLines={1}
                        >
                          {f.home_team ?? "?"}
                        </ThemedText>
                      </View>
                      <ThemedText style={styles.fxVs}>v</ThemedText>
                      <View style={[styles.fxTeam, { justifyContent: "flex-end" }]}>
                        <ThemedText
                          style={[styles.fxTeamName, styles.fxTeamNameRight, awayFav && styles.fxTeamNameFav]}
                          numberOfLines={1}
                        >
                          {f.away_team ?? "?"}
                        </ThemedText>
                        <TeamBadge logo={f.away_logo} size={22} />
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function FavouriteTeamSection() {
  const { activeProfile } = useProfile();
  const {
    favouriteTeam: favTeam,
    favLoading,
    favSaving,
    saveFavouriteTeam,
    remindersEnabled,
    remindersReady,
    setRemindersEnabled,
    globalEnabled,
  } = useMatchReminder();

  const [searchOpen, setSearchOpen] = useState(false);
  const [fixturesOpen, setFixturesOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FavTeam[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Reset the inline search whenever the active profile (and so the favourite)
  // changes. The favourite itself is loaded by MatchReminderContext.
  useEffect(() => {
    setSearchOpen(false);
    setFixturesOpen(false);
    setQuery("");
    setResults([]);
  }, [activeProfile?.id]);

  // Debounced team search (min 3 chars).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    const handle = setTimeout(async () => {
      try {
        const url = new URL("/api/football/teams", getApiUrl());
        url.searchParams.set("search", q);
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setResults(Array.isArray(data?.teams) ? data.teams : []);
      } catch {
        if (!cancelled) {
          setResults([]);
          setSearchError("Couldn't search teams. Check your connection and try again.");
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  const selectTeam = async (t: FavTeam) => {
    setSearchOpen(false);
    setQuery("");
    setResults([]);
    await saveFavouriteTeam(t);
  };

  const showSearch = searchOpen || !favTeam;
  const notifyOn = remindersEnabled && !!favTeam;

  return (
    <Card>
      <CardHeader
        icon={<Feather name="star" size={18} color={Colors.dark.accent} />}
        title="Favourite Team"
        subtitle={
          activeProfile
            ? `Set the team for ${activeProfile.name}. Each profile has its own.`
            : "Each profile has its own favourite team."
        }
      />

      {favLoading ? (
        <View style={styles.favLoading}>
          <ActivityIndicator color={Colors.dark.accent} />
        </View>
      ) : (
        <>
          {favTeam ? (
            <View style={styles.favCard}>
              <TeamBadge logo={favTeam.logo} size={44} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <ThemedText style={styles.favName} numberOfLines={1}>
                  {favTeam.name}
                </ThemedText>
                {favTeam.country ? (
                  <ThemedText style={styles.favSub} numberOfLines={1}>
                    {favTeam.country}
                  </ThemedText>
                ) : null}
              </View>
              {favSaving ? (
                <ActivityIndicator color={Colors.dark.accent} />
              ) : (
                <Touchable
                  style={styles.changeBtn}
                  activeStyle={styles.changeBtnActive}
                  onPress={() => {
                    setSearchOpen((v) => !v);
                    setQuery("");
                    setResults([]);
                  }}
                >
                  {(active) => (
                    <ThemedText
                      style={[styles.changeBtnText, active && { color: Colors.dark.accent }]}
                    >
                      {searchOpen ? "Cancel" : "Change"}
                    </ThemedText>
                  )}
                </Touchable>
              )}
            </View>
          ) : null}

          {showSearch ? (
            <View style={{ gap: Spacing.sm }}>
              <View style={styles.searchRow}>
                <Feather name="search" size={16} color={Colors.dark.textSecondary} />
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search teams (type at least 3 letters)"
                  placeholderTextColor={Colors.dark.textSecondary}
                  autoCorrect={false}
                  autoCapitalize="words"
                  returnKeyType="search"
                />
                {searching ? (
                  <ActivityIndicator size="small" color={Colors.dark.accent} />
                ) : query.length > 0 ? (
                  <Touchable style={styles.clearBtn} activeStyle={{}} onPress={() => setQuery("")}>
                    <Feather name="x" size={16} color={Colors.dark.textSecondary} />
                  </Touchable>
                ) : null}
              </View>

              {searchError ? (
                <ThemedText style={styles.searchError}>{searchError}</ThemedText>
              ) : null}

              {query.trim().length > 0 && query.trim().length < 3 ? (
                <ThemedText style={styles.searchHint}>
                  Type at least 3 letters to search.
                </ThemedText>
              ) : null}

              {!searching && !searchError && query.trim().length >= 3 && results.length === 0 ? (
                <ThemedText style={styles.searchHint}>No teams found for “{query.trim()}”.</ThemedText>
              ) : null}

              {results.map((t) => (
                <Touchable
                  key={t.id}
                  style={styles.resultRow}
                  activeStyle={styles.resultRowActive}
                  onPress={() => selectTeam(t)}
                >
                  {(active) => (
                    <>
                      <TeamBadge logo={t.logo} size={32} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <ThemedText
                          style={[styles.resultName, active && { color: Colors.dark.accent }]}
                          numberOfLines={1}
                        >
                          {t.name}
                        </ThemedText>
                        {t.country ? (
                          <ThemedText style={styles.resultSub} numberOfLines={1}>
                            {t.country}
                          </ThemedText>
                        ) : null}
                      </View>
                      {favTeam?.id === t.id ? (
                        <Feather name="check" size={16} color={Colors.dark.accent} />
                      ) : null}
                    </>
                  )}
                </Touchable>
              ))}
            </View>
          ) : null}

          {favTeam && !showSearch ? (
            <Touchable
              style={styles.fixturesBtn}
              activeStyle={styles.fixturesBtnActive}
              onPress={() => setFixturesOpen(true)}
            >
              {(active) => (
                <>
                  <Feather
                    name="calendar"
                    size={16}
                    color={active ? Colors.dark.accent : Colors.dark.text}
                  />
                  <ThemedText
                    style={[styles.fixturesBtnText, active && { color: Colors.dark.accent }]}
                  >
                    Upcoming Fixtures
                  </ThemedText>
                </>
              )}
            </Touchable>
          ) : null}

          {globalEnabled ? (
            <>
              <View style={styles.cardDivider} />

              <Touchable
                style={[styles.toggleRow, !favTeam && styles.toggleRowDisabled]}
                activeStyle={favTeam ? styles.toggleRowActive : {}}
                onPress={() => {
                  if (!favTeam || !remindersReady) return;
                  setRemindersEnabled(!remindersEnabled);
                }}
              >
                {(active) => (
                  <>
                    <Feather name="bell" size={18} color={Colors.dark.accent} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <ThemedText
                        style={[styles.toggleTitle, active && favTeam && { color: Colors.dark.accent }]}
                      >
                        Match Reminders
                      </ThemedText>
                      <ThemedText style={styles.toggleSub}>
                        {!favTeam
                          ? "Pick a team above to switch this on"
                          : remindersEnabled
                            ? "On — you'll be reminded before kick off"
                            : "Off — no match reminders"}
                      </ThemedText>
                    </View>
                    <View
                      style={[
                        styles.switch,
                        notifyOn && styles.switchOn,
                        !favTeam && styles.switchDisabled,
                      ]}
                    >
                      <View style={[styles.knob, notifyOn && styles.knobOn]} />
                    </View>
                  </>
                )}
              </Touchable>

              {notifyOn ? (
                <View style={styles.notice}>
                  <Feather name="info" size={15} color={Colors.dark.accent} style={{ marginTop: 1 }} />
                  <ThemedText style={styles.noticeText}>
                    A reminder appears about 15 minutes before kick off, wherever you are in the app.
                    Tap <ThemedText style={styles.noticeStrong}>Watch Now</ThemedText> to jump to the
                    channel, or <ThemedText style={styles.noticeStrong}>Remind at kick off</ThemedText>{" "}
                    for a nudge when the game starts.
                  </ThemedText>
                </View>
              ) : null}
            </>
          ) : null}
        </>
      )}

      <TeamFixturesModal
        visible={fixturesOpen}
        team={favTeam}
        onClose={() => setFixturesOpen(false)}
      />
    </Card>
  );
}

function LiveScoresSection() {
  const { prefs, savePrefs } = useFootball();

  const selectLeague = (id: number | null) => {
    void savePrefs({ league_id: id });
  };

  return (
    <Card>
      <CardHeader
        icon={<MaterialCommunityIcons name="soccer" size={20} color={Colors.dark.accent} />}
        title="Live Scores Tracker"
        subtitle="Show a floating live-scores panel on the TV player."
      />

      <Touchable
        style={styles.toggleRow}
        activeStyle={styles.toggleRowActive}
        onPress={() => savePrefs({ enabled: !prefs.enabled })}
      >
        {(active) => (
          <>
            <MaterialCommunityIcons name="soccer" size={18} color={Colors.dark.accent} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <ThemedText style={[styles.toggleTitle, active && { color: Colors.dark.accent }]}>
                Live Scores Tracker
              </ThemedText>
              <ThemedText style={styles.toggleSub}>
                {prefs.enabled ? "On — shows in the player" : "Off — hidden"}
              </ThemedText>
            </View>
            <View style={[styles.switch, prefs.enabled && styles.switchOn]}>
              <View style={[styles.knob, prefs.enabled && styles.knobOn]} />
            </View>
          </>
        )}
      </Touchable>

      {prefs.enabled ? (
        <>
          <View style={styles.notice}>
            <Feather name="alert-triangle" size={15} color={Colors.dark.accent} style={{ marginTop: 1 }} />
            <ThemedText style={styles.noticeText}>
              Scores update in real time and can run slightly ahead of your stream, so a goal may show
              here before you see it. Leave this off during a match if that would spoil it.
            </ThemedText>
          </View>

          <View style={styles.cardDivider} />

          {/* Corner picker */}
          <SubLabel label="Screen Corner" />
          <View style={styles.cornerGrid}>
            {CORNERS.map((c) => {
              const selected = prefs.corner === c.key;
              return (
                <View key={c.key} style={styles.cornerCell}>
                  <Touchable
                    style={[styles.cornerBtn, selected && styles.cornerBtnSelected]}
                    activeStyle={styles.cornerBtnActive}
                    onPress={() => savePrefs({ corner: c.key })}
                  >
                    {(active) => (
                      <ThemedText
                        style={[
                          styles.cornerLabel,
                          (selected || active) && { color: Colors.dark.accent, fontWeight: "800" },
                        ]}
                      >
                        {c.label}
                      </ThemedText>
                    )}
                  </Touchable>
                </View>
              );
            })}
          </View>

          {/* Lines shown picker */}
          <SubLabel label="Scorelines Shown" />
          <ThemedText style={styles.linesHint}>
            How many games show at once before the tracker scrolls through the rest.
          </ThemedText>
          <View style={styles.linesRow}>
            {[1, 2, 3, 4, 5, 6].map((n) => {
              const selected = (prefs.visibleLines ?? 5) === n;
              return (
                <View key={n} style={styles.linesCell}>
                  <Touchable
                    style={[styles.linesBtn, selected && styles.linesBtnSelected]}
                    activeStyle={styles.linesBtnActive}
                    onPress={() => savePrefs({ visibleLines: n })}
                  >
                    {(active) => (
                      <ThemedText
                        style={[
                          styles.linesLabel,
                          (selected || active) && { color: Colors.dark.accent, fontWeight: "800" },
                        ]}
                      >
                        {n}
                      </ThemedText>
                    )}
                  </Touchable>
                </View>
              );
            })}
          </View>

          {/* League picker */}
          <SubLabel label="Competition" />
          <Touchable
            style={[styles.leagueRow, prefs.league_id == null && styles.leagueRowSelected]}
            activeStyle={styles.leagueRowActive}
            onPress={() => selectLeague(null)}
          >
            {(active) => (
              <>
                <ThemedText style={[styles.leagueName, (prefs.league_id == null || active) && { color: Colors.dark.accent }]}>
                  None (off)
                </ThemedText>
                {prefs.league_id == null ? (
                  <Feather name="check" size={16} color={Colors.dark.accent} />
                ) : null}
              </>
            )}
          </Touchable>

          {FOOTBALL_LEAGUE_GROUPS.map((g) => (
            <View key={g.group} style={{ gap: 6 }}>
              <ThemedText style={styles.groupLabel}>{g.group}</ThemedText>
              {g.leagues.map((l) => {
                const selected = prefs.league_id === l.id;
                return (
                  <Touchable
                    key={l.id}
                    style={[styles.leagueRow, selected && styles.leagueRowSelected]}
                    activeStyle={styles.leagueRowActive}
                    onPress={() => selectLeague(l.id)}
                  >
                    {(active) => (
                      <>
                        <ThemedText
                          style={[styles.leagueName, (selected || active) && { color: Colors.dark.accent }]}
                          numberOfLines={1}
                        >
                          {l.name}
                        </ThemedText>
                        {selected ? <Feather name="check" size={16} color={Colors.dark.accent} /> : null}
                      </>
                    )}
                  </Touchable>
                );
              })}
            </View>
          ))}
        </>
      ) : null}
    </Card>
  );
}

export default function FootballSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();

  const padH = Math.max(insets.left + Spacing.sm, Spacing.lg);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <Touchable style={styles.iconBtn} activeStyle={styles.iconBtnActive} onPress={() => navigation.goBack()}>
          {(active) => <Feather name="arrow-left" size={20} color={active ? Colors.dark.accent : Colors.dark.text} />}
        </Touchable>
        <ThemedText style={styles.headerTitle}>Football</ThemedText>
        <View style={styles.iconBtn} />
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: padH,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingTop: Spacing.lg,
          gap: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <FavouriteTeamSection />
        <LiveScoresSection />
      </KeyboardAwareScrollViewCompat>
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
  headerTitle: {
    flex: 1,
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
    backgroundColor: Colors.dark.accent + "1A",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.dark.border,
  },

  // Grouped card
  card: {
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.accentDim,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.35)",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  cardSubtitle: {
    fontSize: 12.5,
    lineHeight: 17,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  cardDivider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: Spacing.xs,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
    marginTop: Spacing.xs,
  },

  // Favourite team
  favLoading: {
    paddingVertical: Spacing.lg,
    alignItems: "center",
  },
  favCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.40)",
    backgroundColor: Colors.dark.accent + "12",
  },
  favName: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  favSub: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  badgeFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  changeBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  changeBtnActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accent + "1A",
  },
  changeBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  fixturesBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  fixturesBtnActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accent + "1A",
  },
  fixturesBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },

  // Upcoming fixtures modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "85%",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  modalSubtitle: {
    fontSize: 13,
    color: Colors.dark.accent,
    fontWeight: "700",
    marginTop: 2,
  },
  modalClose: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  modalCloseActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accent + "1A",
  },
  modalState: {
    paddingVertical: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
  },
  modalStateText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  fxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  fxWhen: {
    width: 72,
  },
  fxDate: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  fxTime: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.dark.accent,
    marginTop: 2,
  },
  fxMatch: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    minWidth: 0,
  },
  fxTeam: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    minWidth: 0,
  },
  fxTeamName: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  fxTeamNameRight: {
    textAlign: "right",
  },
  fxTeamNameFav: {
    fontWeight: "800",
    color: Colors.dark.accent,
  },
  fxVs: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    height: 48,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.text,
    paddingVertical: 0,
  },
  clearBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  searchError: {
    fontSize: 12,
    color: Colors.dark.error,
    lineHeight: 16,
  },
  searchHint: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    lineHeight: 16,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  resultRowActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accent + "14",
  },
  resultName: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  resultSub: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginTop: 1,
  },

  // Notice / explanation
  notice: {
    flexDirection: "row",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.accent + "0F",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.25)",
  },
  noticeText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: Colors.dark.text,
  },
  noticeStrong: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "800",
    color: Colors.dark.accent,
  },

  // Toggle row
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  toggleRowActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accent + "14",
  },
  toggleRowDisabled: {
    opacity: 0.6,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  toggleSub: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  switch: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.dark.border,
    padding: 3,
    justifyContent: "center",
  },
  switchOn: {
    backgroundColor: Colors.dark.accent,
  },
  switchDisabled: {
    backgroundColor: Colors.dark.border,
  },
  knob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignSelf: "flex-start",
  },
  knobOn: {
    alignSelf: "flex-end",
  },

  // Live scores pickers
  linesHint: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    lineHeight: 16,
    marginTop: -2,
  },
  linesRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  linesCell: {
    flex: 1,
  },
  linesBtn: {
    height: 44,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  linesBtnSelected: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accent + "1A",
  },
  linesBtnActive: {
    borderColor: Colors.dark.accent,
  },
  linesLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  cornerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -Spacing.xs / 2,
  },
  cornerCell: {
    width: "33.333%",
    padding: Spacing.xs / 2,
  },
  cornerBtn: {
    height: 56,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  cornerBtnSelected: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accent + "1A",
  },
  cornerBtnActive: {
    borderColor: Colors.dark.accent,
  },
  cornerLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.text,
    textAlign: "center",
  },
  groupLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.accent,
    marginTop: Spacing.xs,
  },
  leagueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  leagueRowSelected: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accent + "14",
  },
  leagueRowActive: {
    borderColor: Colors.dark.accent,
  },
  leagueName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.text,
  },
});
