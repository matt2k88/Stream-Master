import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
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

function SectionTitle({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      {icon}
      <ThemedText style={styles.sectionTitleText}>{label}</ThemedText>
    </View>
  );
}

function SectionHeading({ label }: { label: string }) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionHeadingLine} />
      <ThemedText style={styles.sectionHeadingText}>{label}</ThemedText>
      <View style={styles.sectionHeadingLine} />
    </View>
  );
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
    testCountdown,
    triggerTestReminder,
  } = useMatchReminder();

  const [searchOpen, setSearchOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FavTeam[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Reset the inline search whenever the active profile (and so the favourite)
  // changes. The favourite itself is loaded by MatchReminderContext.
  useEffect(() => {
    setSearchOpen(false);
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

  return (
    <View style={{ gap: Spacing.md }}>
      <SectionTitle
        icon={<Feather name="star" size={16} color={Colors.dark.accent} />}
        label="Favourite Team"
      />
      <ThemedText style={styles.intro}>
        Pick the team you support{activeProfile ? ` for ${activeProfile.name}` : ""}. Each profile has its own favourite.
      </ThemedText>

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

          {globalEnabled ? (
            <View style={styles.notifyBlock}>
              <SectionHeading label="Match Notifications" />

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
                        Match Notifications
                      </ThemedText>
                      <ThemedText style={styles.toggleSub}>
                        {!favTeam
                          ? "Pick a favourite team above to switch this on"
                          : remindersEnabled
                            ? "On — you'll be reminded before kick off"
                            : "Off — no match reminders"}
                      </ThemedText>
                    </View>
                    <View
                      style={[
                        styles.switch,
                        remindersEnabled && favTeam && styles.switchOn,
                        !favTeam && styles.switchDisabled,
                      ]}
                    >
                      <View style={[styles.knob, remindersEnabled && favTeam && styles.knobOn]} />
                    </View>
                  </>
                )}
              </Touchable>

              <View style={styles.notice}>
                <Feather name="info" size={16} color={Colors.dark.accent} style={{ marginTop: 1 }} />
                <ThemedText style={styles.noticeText}>
                  When this is on, a reminder pops up about 15 minutes before your favourite team kicks
                  off — wherever you are in the app, even while you're watching something else. If the
                  match is on a TV channel you have, tap{" "}
                  <ThemedText style={styles.noticeStrong}>Watch Now</ThemedText> to jump straight to it.
                  Not ready yet? Choose{" "}
                  <ThemedText style={styles.noticeStrong}>Remind at kick off</ThemedText> and we'll nudge
                  you again when the game starts. Reminders only cover games in our football fixtures
                  list and appear while the app is open.
                </ThemedText>
              </View>

              <View style={styles.testBlock}>
                <Touchable
                  style={[styles.testBtn, testCountdown != null && styles.testBtnActive]}
                  activeStyle={styles.testBtnFocused}
                  onPress={() => {
                    if (testCountdown == null) triggerTestReminder();
                  }}
                >
                  {(active) => (
                    <>
                      <Feather
                        name={testCountdown != null ? "clock" : "play-circle"}
                        size={16}
                        color={Colors.dark.accent}
                      />
                      <ThemedText
                        style={[styles.testBtnText, active && { color: Colors.dark.accent }]}
                      >
                        {testCountdown != null
                          ? `Opening in ${testCountdown}s — go to a channel`
                          : "Send test reminder (Man Utd)"}
                      </ThemedText>
                    </>
                  )}
                </Touchable>
                <ThemedText style={styles.testHint}>
                  Fires a sample reminder after a short countdown so you can open a channel and check
                  the popup appears over the player.
                </ThemedText>
              </View>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

export default function FootballSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { prefs, savePrefs } = useFootball();

  const padH = Math.max(insets.left + Spacing.sm, Spacing.lg);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);

  const selectLeague = (id: number | null) => {
    void savePrefs({ league_id: id });
  };

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
        contentContainerStyle={{ paddingHorizontal: padH, paddingBottom: insets.bottom + Spacing.xl, paddingTop: Spacing.md, gap: Spacing.lg }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        {/* ── Favourite Team section ── */}
        <FavouriteTeamSection />

        {/* ── Live Scores Tracker section ── */}
        <View style={{ gap: Spacing.md }}>
          <SectionTitle
            icon={<MaterialCommunityIcons name="soccer" size={18} color={Colors.dark.accent} />}
            label="Live Scores Tracker"
          />

          <ThemedText style={styles.intro}>
            Show a floating live football tracker on the live TV player. Pick a competition and where it appears on screen.
          </ThemedText>

          {/* Broadcast-delay notice */}
          <View style={styles.notice}>
            <Feather name="alert-triangle" size={16} color={Colors.dark.accent} style={{ marginTop: 1 }} />
            <ThemedText style={styles.noticeText}>
              Scores update in real time and can be a little ahead of your TV stream, which is usually slightly delayed. This may reveal a goal before you see it on screen — leave the tracker off during a match if that would spoil it for you.
            </ThemedText>
          </View>

          {/* Enable toggle */}
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
                    {prefs.enabled ? "On — football button shows in the player" : "Off — button hidden"}
                  </ThemedText>
                </View>
                <View style={[styles.switch, prefs.enabled && styles.switchOn]}>
                  <View style={[styles.knob, prefs.enabled && styles.knobOn]} />
                </View>
              </>
            )}
          </Touchable>

          {/* Corner picker */}
          <SectionHeading label="Screen Corner" />
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
          <SectionHeading label="Scorelines Shown" />
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
          <SectionHeading label="Competition" />
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
        </View>
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
  intro: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },

  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sectionTitleText: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.dark.accent,
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
    borderColor: "rgba(255,102,0,0.45)",
    backgroundColor: "rgba(255,102,0,0.08)",
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
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  changeBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
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
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    height: 48,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
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
    color: "#ff6b6b",
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
    backgroundColor: Colors.dark.backgroundSecondary,
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

  notice: {
    flexDirection: "row",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.45)",
    backgroundColor: "rgba(255,102,0,0.10)",
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
  notifyBlock: {
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  testBlock: {
    gap: Spacing.xs,
  },
  testBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    height: 44,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.45)",
    backgroundColor: "rgba(255,102,0,0.08)",
  },
  testBtnActive: {
    opacity: 0.7,
  },
  testBtnFocused: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accent + "1A",
  },
  testBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  testHint: {
    fontSize: 11,
    lineHeight: 15,
    color: Colors.dark.textSecondary,
  },
  toggleRowDisabled: {
    opacity: 0.6,
  },
  switchDisabled: {
    backgroundColor: Colors.dark.border,
  },
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
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  toggleRowActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accent + "14",
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
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  sectionHeadingLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.dark.border,
  },
  sectionHeadingText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: Colors.dark.textSecondary,
    textTransform: "uppercase",
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
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
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
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
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
