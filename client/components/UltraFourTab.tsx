/**
 * UltraFourTab — Football Centre tab for the Ultra Four prediction game.
 *
 * Users pick scorelines for 4 fixtures in a competition. Matching the required
 * number (usually 4, sometimes 3) wins a prize. Data lives in the lifetime
 * Supabase DB; this component communicates exclusively through the
 * /api/ultra-four/* server routes which enforce all write guards.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

// ─── Touchable — fire-TV / D-pad aware pressable ──────────────────────────────
function Touchable({
  style,
  activeStyle,
  onPress,
  children,
  disabled,
}: {
  style?: any;
  activeStyle?: any;
  onPress?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
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
      disabled={disabled}
    >
      {children}
    </Pressable>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type UF_Fixture = {
  id: number;
  date: string;
  home_team: { name: string; logo: string };
  away_team: { name: string; logo: string };
};

type UF_Competition = {
  id: number;
  name: string;
  status: string;
  closing_time: string;
  fixtures: UF_Fixture[];
  prize: string | null;
  correct_predictions_required: number | null;
  is_rollover: boolean;
  rollover_from_competition_id: number | null;
  rollover_prize_text: string | null;
};

type UF_Prediction = {
  id?: string;
  competition_id: number;
  user_username: string;
  predictions: { fixture_id: number; home_score: number; away_score: number }[];
};

type LiveMap = Record<number, {
  status: string;
  elapsed: number | null;
  home: number | null;
  away: number | null;
}>;

const FINISHED_STATUSES = ["FT", "AET", "PEN"];
const LIVE_STATUSES = ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function isClosed(closingTime: string) {
  return new Date(closingTime) < new Date();
}

// ─── Countdown ────────────────────────────────────────────────────────────────

function useCountdown(closingTime: string) {
  const calc = () => {
    const diff = Math.max(0, Math.floor((new Date(closingTime).getTime() - Date.now()) / 1000));
    return {
      total: diff,
      d: Math.floor(diff / 86400),
      h: Math.floor((diff % 86400) / 3600),
      m: Math.floor((diff % 3600) / 60),
      s: diff % 60,
    };
  };
  const [t, setT] = useState(calc);
  useEffect(() => {
    if (t.total <= 0) return;
    const id = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(id);
  });
  return t;
}

function Countdown({ closingTime }: { closingTime: string }) {
  const t = useCountdown(closingTime);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.5, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []); // eslint-disable-line

  if (t.total <= 0) {
    return <ThemedText style={styles.closedLabel}>Competition Closed</ThemedText>;
  }

  const parts: string[] = [];
  if (t.d > 0) parts.push(`${t.d}d`);
  if (t.h > 0) parts.push(`${t.h}h`);
  if (t.m > 0) parts.push(`${t.m}m`);
  parts.push(`${t.s}s`);

  return (
    <Animated.View style={{ opacity: pulseAnim }}>
      <ThemedText style={styles.countdown}>⏱ Closes in {parts.join(" ")}</ThemedText>
    </Animated.View>
  );
}

// ─── Score input ──────────────────────────────────────────────────────────────

function ScoreInput({
  value,
  onChange,
  disabled,
  correct,
  wrong,
}: {
  value: number | null;
  onChange: (v: number) => void;
  disabled: boolean;
  correct?: boolean;
  wrong?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      style={[
        styles.scoreInput,
        focused && styles.scoreInputFocused,
        correct && styles.scoreInputCorrect,
        wrong && styles.scoreInputWrong,
        disabled && styles.scoreInputDisabled,
      ]}
      keyboardType="numeric"
      maxLength={2}
      value={value !== null ? String(value) : ""}
      onChangeText={(v) => {
        const n = parseInt(v, 10);
        onChange(isNaN(n) ? 0 : Math.max(0, n));
      }}
      editable={!disabled}
      selectTextOnFocus
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

// ─── Competition card ─────────────────────────────────────────────────────────

function CompetitionCard({
  comp,
  username,
}: {
  comp: UF_Competition;
  username: string;
}) {
  const required = comp.correct_predictions_required ?? 4;
  const closed = isClosed(comp.closing_time);

  const [expanded, setExpanded] = useState(false);
  const [loadingPred, setLoadingPred] = useState(false);
  const [loadingLive, setLoadingLive] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [savedPred, setSavedPred] = useState<UF_Prediction | null>(null);
  const [scores, setScores] = useState<Record<number, { home: number; away: number }>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [liveMap, setLiveMap] = useState<LiveMap>({});
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  // Fetch live/final scores
  const fetchLive = useCallback(async () => {
    const ids = comp.fixtures.map((f) => f.id).join("-");
    setLoadingLive(true);
    try {
      const url = new URL(`/api/ultra-four/fixture-scores`, getApiUrl());
      url.searchParams.set("ids", ids);
      const res = await fetch(url.toString());
      if (res.ok) setLiveMap(await res.json());
    } catch { /* silent */ } finally {
      setLoadingLive(false);
    }
  }, [comp.fixtures]);

  // Fetch user's existing prediction
  const fetchPrediction = useCallback(async () => {
    if (!username) { setIsEditing(true); return; }
    setLoadingPred(true);
    try {
      const url = new URL("/api/ultra-four/predictions", getApiUrl());
      url.searchParams.set("competition_id", String(comp.id));
      url.searchParams.set("username", username);
      const res = await fetch(url.toString());
      if (res.ok) {
        const data: UF_Prediction | null = await res.json();
        if (data) {
          setSavedPred(data);
          const map: Record<number, { home: number; away: number }> = {};
          for (const p of data.predictions) {
            map[p.fixture_id] = { home: p.home_score, away: p.away_score };
          }
          setScores(map);
          setIsEditing(false);
        } else {
          setIsEditing(true);
        }
      }
    } catch { /* silent */ } finally {
      setLoadingPred(false);
    }
  }, [comp.id, username]);

  useEffect(() => {
    if (expanded) {
      fetchPrediction();
      fetchLive();
    }
  }, [expanded]); // eslint-disable-line

  // Poll live scores every 60s when competition is closed (games may be playing)
  useEffect(() => {
    if (!expanded || !closed) return;
    const allFinished = comp.fixtures.every((f) => {
      const d = liveMap[f.id];
      return d && FINISHED_STATUSES.includes(d.status);
    });
    if (allFinished) return;
    const id = setInterval(fetchLive, 60_000);
    return () => clearInterval(id);
  }, [expanded, closed, liveMap, comp.fixtures, fetchLive]);

  const handleSubmit = async () => {
    if (!username) { showToast("You must be logged in to submit predictions."); return; }
    if (closed) { showToast("This competition is now closed."); return; }
    setSubmitting(true);
    try {
      const payload = comp.fixtures.map((f) => ({
        fixture_id: f.id,
        home_score: scores[f.id]?.home ?? 0,
        away_score: scores[f.id]?.away ?? 0,
      }));
      const res = await fetch(new URL("/api/ultra-four/predictions", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: savedPred?.id,
          competition_id: comp.id,
          user_username: username,
          predictions: payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");
      setSavedPred(data);
      setIsEditing(false);
      showToast(savedPred ? "Predictions updated! Good luck! 🎉" : "Predictions submitted! Good luck! 🎉");
    } catch (e: any) {
      showToast(`Failed: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Count correct predictions once results are in
  const correctCount = comp.fixtures.reduce((n, f) => {
    const live = liveMap[f.id];
    if (!live || !FINISHED_STATUSES.includes(live.status)) return n;
    const pred = scores[f.id];
    if (!pred) return n;
    return pred.home === live.home && pred.away === live.away ? n + 1 : n;
  }, 0);
  const allFinished = comp.fixtures.length > 0 && comp.fixtures.every((f) => {
    const d = liveMap[f.id];
    return d && FINISHED_STATUSES.includes(d.status);
  });
  const isWinner = allFinished && correctCount >= required;

  const anyLive = comp.fixtures.some((f) => {
    const d = liveMap[f.id];
    return d && LIVE_STATUSES.includes(d.status);
  });

  return (
    <View style={styles.card}>
      {/* Header — always visible, tap to expand */}
      <Touchable style={styles.cardHeader} activeStyle={styles.cardHeaderActive} onPress={() => setExpanded((e) => !e)}>
        <View style={styles.cardHeaderInner}>
          <View style={styles.titleRow}>
            <Feather name="award" size={16} color={Colors.dark.accent} />
            <ThemedText style={styles.compName} numberOfLines={2}>
              {comp.name}
            </ThemedText>
            {anyLive && (
              <View style={styles.livePill}>
                <ThemedText style={styles.livePillText}>LIVE</ThemedText>
              </View>
            )}
          </View>
          <ThemedText style={styles.prizeText}>
            🏆 Win: {comp.prize ?? "a Lifetime Subscription"}
          </ThemedText>
          {comp.is_rollover && comp.rollover_prize_text ? (
            <View style={styles.rolloverBadge}>
              <Feather name="gift" size={11} color="#fff" />
              <ThemedText style={styles.rolloverText}>
                Rollover: {comp.rollover_prize_text}
              </ThemedText>
            </View>
          ) : null}
          <View style={{ marginTop: 4, alignItems: "center" }}>
            {closed ? (
              <ThemedText style={styles.closedLabel}>Competition Closed</ThemedText>
            ) : (
              <Countdown closingTime={comp.closing_time} />
            )}
          </View>
          <Feather
            name={expanded ? "chevron-up" : "chevron-down"}
            size={20}
            color={Colors.dark.textSecondary}
            style={{ marginTop: 6 }}
          />
        </View>
      </Touchable>

      {/* Expandable body */}
      {expanded ? (
        <View style={styles.cardBody}>
          {/* Winner banner */}
          {isWinner && (
            <View style={styles.winnerBanner}>
              <ThemedText style={styles.winnerText}>
                🎉 You got {correctCount}/{comp.fixtures.length} correct — You won!
              </ThemedText>
            </View>
          )}
          {allFinished && !isWinner && savedPred && (
            <View style={styles.resultBanner}>
              <ThemedText style={styles.resultText}>
                You got {correctCount}/{comp.fixtures.length} correct
                {required === 3 && ` — needed ${required}`}
              </ThemedText>
            </View>
          )}

          {loadingPred ? (
            <ActivityIndicator color={Colors.dark.accent} style={{ margin: Spacing.md }} />
          ) : (
            <>
              <ThemedText style={styles.subTitle}>
                Predict {required} out of {comp.fixtures.length} scores correctly to win.
              </ThemedText>

              {comp.fixtures.map((f) => {
                const live = liveMap[f.id];
                const isLive = live && LIVE_STATUSES.includes(live.status);
                const isFinished = live && FINISHED_STATUSES.includes(live.status);
                const pred = scores[f.id] ?? null;
                const correct =
                  isFinished && pred !== null &&
                  pred.home === live.home && pred.away === live.away;
                const wrong = isFinished && pred !== null && !correct;

                return (
                  <View
                    key={f.id}
                    style={[
                      styles.fixtureRow,
                      correct && styles.fixtureRowCorrect,
                      wrong && styles.fixtureRowWrong,
                    ]}
                  >
                    {/* Home team */}
                    <View style={styles.teamCol}>
                      {f.home_team.logo ? (
                        <Image
                          source={{ uri: f.home_team.logo }}
                          style={styles.teamLogo}
                          contentFit="contain"
                        />
                      ) : null}
                      <ThemedText style={styles.teamName} numberOfLines={2}>
                        {f.home_team.name}
                      </ThemedText>
                    </View>

                    {/* Centre: score inputs or VS */}
                    <View style={styles.centreCol}>
                      {isLive ? (
                        <View style={styles.liveScoreRow}>
                          <ThemedText style={styles.liveScore}>
                            {live.home ?? "–"} – {live.away ?? "–"}
                          </ThemedText>
                          <ThemedText style={styles.liveMin}>{live.elapsed}'</ThemedText>
                        </View>
                      ) : isFinished ? (
                        <View style={styles.ftRow}>
                          <ThemedText style={styles.ftScore}>
                            {live.home} – {live.away}
                          </ThemedText>
                          <ThemedText style={styles.ftLabel}>FT</ThemedText>
                        </View>
                      ) : (
                        <>
                          <ThemedText style={styles.vsText}>VS</ThemedText>
                          <ThemedText style={styles.fixtureDate}>{formatDate(f.date)}</ThemedText>
                          <ThemedText style={styles.fixtureTime}>{formatTime(f.date)}</ThemedText>
                        </>
                      )}

                      {/* Prediction inputs */}
                      <View style={styles.inputRow}>
                        <ScoreInput
                          value={pred?.home ?? null}
                          onChange={(v) => setScores((s) => ({ ...s, [f.id]: { ...s[f.id], home: v } }))}
                          disabled={!isEditing || closed}
                          correct={correct}
                          wrong={wrong}
                        />
                        <ThemedText style={styles.inputDash}>–</ThemedText>
                        <ScoreInput
                          value={pred?.away ?? null}
                          onChange={(v) => setScores((s) => ({ ...s, [f.id]: { ...s[f.id], away: v } }))}
                          disabled={!isEditing || closed}
                          correct={correct}
                          wrong={wrong}
                        />
                      </View>
                      {pred !== null && (
                        <ThemedText style={styles.predLabel}>Your pick</ThemedText>
                      )}
                    </View>

                    {/* Away team */}
                    <View style={styles.teamCol}>
                      {f.away_team.logo ? (
                        <Image
                          source={{ uri: f.away_team.logo }}
                          style={styles.teamLogo}
                          contentFit="contain"
                        />
                      ) : null}
                      <ThemedText style={styles.teamName} numberOfLines={2}>
                        {f.away_team.name}
                      </ThemedText>
                    </View>
                  </View>
                );
              })}

              {/* Submit / Edit / Closed */}
              {closed ? (
                <View style={styles.closedBox}>
                  <Feather name="lock" size={18} color={Colors.dark.textSecondary} />
                  <ThemedText style={styles.closedBoxText}>
                    Predictions are locked. Results will appear as games finish.
                  </ThemedText>
                </View>
              ) : savedPred && !isEditing ? (
                <View style={styles.savedBox}>
                  <Feather name="check-circle" size={18} color="#4ade80" />
                  <ThemedText style={styles.savedBoxText}>
                    Predictions submitted! Tap below to edit before the deadline.
                  </ThemedText>
                  <Touchable style={styles.editBtn} activeStyle={styles.editBtnActive} onPress={() => setIsEditing(true)}>
                    <Feather name="edit-2" size={13} color={Colors.dark.accent} />
                    <ThemedText style={styles.editBtnText}>Edit Predictions</ThemedText>
                  </Touchable>
                </View>
              ) : (
                <Touchable
                  style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
                  activeStyle={styles.submitBtnActive}
                  onPress={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Feather name="send" size={14} color="#fff" />
                  )}
                  <ThemedText style={styles.submitBtnText}>
                    {submitting ? "Saving…" : savedPred ? "Update Predictions" : "Submit Predictions"}
                  </ThemedText>
                </Touchable>
              )}
            </>
          )}
        </View>
      ) : null}

      {/* Toast */}
      {toast ? (
        <View style={styles.toastBar}>
          <ThemedText style={styles.toastText}>{toast}</ThemedText>
        </View>
      ) : null}
    </View>
  );
}

// ─── History view ─────────────────────────────────────────────────────────────

function HistoryView({ username, onBack }: { username: string; onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [competitions, setCompetitions] = useState<UF_Competition[]>([]);
  const [predictions, setPredictions] = useState<Record<number, UF_Prediction | null>>({});
  const [liveData, setLiveData] = useState<Record<number, LiveMap>>({});

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL("/api/ultra-four/competitions", getApiUrl());
      url.searchParams.set("status", "finished");
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load history");
      const comps: UF_Competition[] = await res.json();
      setCompetitions(comps);

      // Fetch user predictions for each competition
      if (username) {
        const predEntries = await Promise.all(
          comps.map(async (c) => {
            const u = new URL("/api/ultra-four/predictions", getApiUrl());
            u.searchParams.set("competition_id", String(c.id));
            u.searchParams.set("username", username);
            const r = await fetch(u.toString());
            return [c.id, r.ok ? await r.json() : null] as const;
          }),
        );
        setPredictions(Object.fromEntries(predEntries));
      }

      // Fetch final scores for each competition's fixtures
      const liveEntries = await Promise.all(
        comps.map(async (c) => {
          const ids = c.fixtures.map((f) => f.id).join("-");
          if (!ids) return [c.id, {}] as const;
          const u = new URL("/api/ultra-four/fixture-scores", getApiUrl());
          u.searchParams.set("ids", ids);
          const r = await fetch(u.toString());
          return [c.id, r.ok ? await r.json() : {}] as const;
        }),
      );
      setLiveData(Object.fromEntries(liveEntries));
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  if (loading) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator color={Colors.dark.accent} />
      </View>
    );
  }

  if (competitions.length === 0) {
    return (
      <View style={styles.centerBox}>
        <Feather name="clock" size={36} color={Colors.dark.textSecondary} />
        <ThemedText style={styles.emptyText}>No finished competitions yet.</ThemedText>
        <Touchable style={styles.backBtn} activeStyle={styles.backBtnActive} onPress={onBack}>
          <ThemedText style={styles.backBtnText}>← Back to Active</ThemedText>
        </Touchable>
      </View>
    );
  }

  return (
    <>
      <View style={styles.historyHeader}>
        <Touchable style={styles.backBtn} activeStyle={styles.backBtnActive} onPress={onBack}>
          <ThemedText style={styles.backBtnText}>← Active</ThemedText>
        </Touchable>
        <ThemedText style={styles.historyTitle}>Competition History</ThemedText>
      </View>

      {competitions.map((comp) => {
        const pred = predictions[comp.id];
        const live = liveData[comp.id] ?? {};
        const required = comp.correct_predictions_required ?? 4;
        const predMap = Object.fromEntries(
          (pred?.predictions ?? []).map((p) => [
            p.fixture_id,
            { home: p.home_score, away: p.away_score },
          ]),
        );
        const correct = comp.fixtures.reduce((n, f) => {
          const l = live[f.id];
          const p = predMap[f.id];
          if (!l || !FINISHED_STATUSES.includes(l.status) || !p) return n;
          return p.home === l.home && p.away === l.away ? n + 1 : n;
        }, 0);
        const won = correct >= required && pred != null;

        return (
          <View key={comp.id} style={styles.card}>
            <View style={styles.historyCardHeader}>
              <ThemedText style={styles.compName}>{comp.name}</ThemedText>
              {pred ? (
                <View style={[styles.resultPill, won && styles.resultPillWon]}>
                  <ThemedText style={styles.resultPillText}>
                    {won ? "🏆 Won" : `${correct}/${comp.fixtures.length}`}
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.resultPill}>
                  <ThemedText style={styles.resultPillText}>No entry</ThemedText>
                </View>
              )}
            </View>

            {comp.fixtures.map((f) => {
              const l = live[f.id];
              const p = predMap[f.id];
              const isCorrect = l && p && FINISHED_STATUSES.includes(l.status) &&
                p.home === l.home && p.away === l.away;
              const isWrong = l && p && FINISHED_STATUSES.includes(l.status) && !isCorrect;

              return (
                <View
                  key={f.id}
                  style={[
                    styles.historyFixture,
                    isCorrect && styles.fixtureRowCorrect,
                    isWrong && styles.fixtureRowWrong,
                  ]}
                >
                  <View style={styles.historyTeamRow}>
                    <View style={{ flex: 1 }} />
                    {f.home_team.logo ? (
                      <Image source={{ uri: f.home_team.logo }} style={styles.historyLogo} contentFit="contain" />
                    ) : null}
                    <ThemedText style={styles.historyTeamNameHome} numberOfLines={1}>
                      {f.home_team.name}
                    </ThemedText>
                    <ThemedText style={styles.historyScore}>
                      {l ? `${l.home ?? "?"} – ${l.away ?? "?"}` : "? – ?"}
                    </ThemedText>
                    <ThemedText style={styles.historyTeamNameAway} numberOfLines={1}>
                      {f.away_team.name}
                    </ThemedText>
                    {f.away_team.logo ? (
                      <Image source={{ uri: f.away_team.logo }} style={styles.historyLogo} contentFit="contain" />
                    ) : null}
                    <View style={{ flex: 1 }} />
                  </View>
                  {p ? (
                    <ThemedText style={styles.historyPred}>
                      Your pick: {p.home} – {p.away}
                      {isCorrect ? " ✓" : isWrong ? " ✗" : ""}
                    </ThemedText>
                  ) : (
                    <ThemedText style={styles.historyNoPred}>No prediction entered</ThemedText>
                  )}
                </View>
              );
            })}
          </View>
        );
      })}
    </>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default function UltraFourTab({ username }: { username?: string }) {
  const [view, setView] = useState<"active" | "history">("active");
  const [loading, setLoading] = useState(true);
  const [competitions, setCompetitions] = useState<UF_Competition[]>([]);

  const fetchActive = useCallback(async () => {
    setLoading(true);
    try {
      const url = new URL("/api/ultra-four/competitions", getApiUrl());
      url.searchParams.set("status", "active");
      const res = await fetch(url.toString());
      if (res.ok) setCompetitions(await res.json());
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (view === "active") fetchActive(); }, [view, fetchActive]);

  if (view === "history") {
    return (
      <HistoryView
        username={username ?? ""}
        onBack={() => setView("active")}
      />
    );
  }

  if (loading) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator color={Colors.dark.accent} />
      </View>
    );
  }

  if (competitions.length === 0) {
    return (
      <View style={styles.centerBox}>
        <Feather name="award" size={40} color={Colors.dark.textSecondary} />
        <ThemedText style={styles.emptyTitle}>No Active Competition</ThemedText>
        <ThemedText style={styles.emptyText}>
          There's no Ultra Four competition running right now. Check back soon!
        </ThemedText>
        <Touchable style={styles.historyLink} activeStyle={styles.historyLinkActive} onPress={() => setView("history")}>
          <Feather name="clock" size={13} color={Colors.dark.accent} />
          <ThemedText style={styles.historyLinkText}>View Past Competitions</ThemedText>
        </Touchable>
      </View>
    );
  }

  return (
    <>
      {competitions.map((comp) => (
        <CompetitionCard
          key={comp.id}
          comp={comp}
          username={username ?? ""}
        />
      ))}
      <Touchable style={styles.historyLink} activeStyle={styles.historyLinkActive} onPress={() => setView("history")}>
        <Feather name="clock" size={13} color={Colors.dark.accent} />
        <ThemedText style={styles.historyLinkText}>View Past Competitions</ThemedText>
      </Touchable>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: Colors.dark.text },
  emptyText: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center" },

  card: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
  },
  cardHeader: { padding: Spacing.md },
  cardHeaderActive: { backgroundColor: "rgba(255,255,255,0.06)" },
  cardHeaderInner: { alignItems: "center", gap: 4 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.xs, flexWrap: "wrap" },
  compName: { fontSize: 15, fontWeight: "800", color: Colors.dark.text, textAlign: "center" },
  prizeText: { fontSize: 13, fontWeight: "600", color: "#fbbf24", marginTop: 2, textAlign: "center" },
  livePill: {
    backgroundColor: "#ef4444",
    borderRadius: BorderRadius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  livePillText: { fontSize: 9, fontWeight: "900", color: "#fff", letterSpacing: 0.5 },

  rolloverBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,102,0,0.25)",
    borderRadius: BorderRadius.xs,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginTop: 4,
  },
  rolloverText: { fontSize: 11, fontWeight: "700", color: Colors.dark.accent },

  countdown: { fontSize: 12, fontWeight: "700", color: Colors.dark.accent },
  closedLabel: { fontSize: 12, fontWeight: "700", color: "#ef4444" },

  cardBody: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: Spacing.sm },
  subTitle: { fontSize: 12, color: Colors.dark.textSecondary, textAlign: "center" },

  fixtureRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  fixtureRowCorrect: { borderColor: "#4ade80", backgroundColor: "rgba(74,222,128,0.08)" },
  fixtureRowWrong: { borderColor: "#f87171", backgroundColor: "rgba(248,113,113,0.08)" },

  teamCol: { flex: 1, alignItems: "center", gap: 4 },
  teamLogo: { width: 36, height: 36 },
  teamName: { fontSize: 11, fontWeight: "600", color: Colors.dark.text, textAlign: "center" },

  centreCol: { alignItems: "center", gap: 4, minWidth: 100 },
  vsText: { fontSize: 13, fontWeight: "800", color: Colors.dark.textSecondary },
  fixtureDate: { fontSize: 10, color: Colors.dark.textSecondary },
  fixtureTime: { fontSize: 11, fontWeight: "600", color: Colors.dark.text },

  liveScoreRow: { alignItems: "center" },
  liveScore: { fontSize: 16, fontWeight: "900", color: "#4ade80" },
  liveMin: { fontSize: 10, color: "#4ade80" },

  ftRow: { alignItems: "center" },
  ftScore: { fontSize: 16, fontWeight: "900", color: Colors.dark.text },
  ftLabel: { fontSize: 10, color: Colors.dark.textSecondary },

  inputRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  inputDash: { fontSize: 14, fontWeight: "800", color: Colors.dark.textSecondary },
  predLabel: { fontSize: 9, color: Colors.dark.textSecondary },

  scoreInput: {
    width: 40,
    height: 36,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundRoot,
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  scoreInputFocused: { borderColor: Colors.dark.accent, borderWidth: 2 },
  scoreInputCorrect: { borderColor: "#4ade80", color: "#4ade80" },
  scoreInputWrong: { borderColor: "#f87171", color: "#f87171" },
  scoreInputDisabled: { opacity: 0.6 },

  winnerBanner: {
    backgroundColor: "rgba(74,222,128,0.15)",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "#4ade80",
    padding: Spacing.sm,
    alignItems: "center",
  },
  winnerText: { fontSize: 14, fontWeight: "800", color: "#4ade80", textAlign: "center" },

  resultBanner: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    alignItems: "center",
  },
  resultText: { fontSize: 13, color: Colors.dark.textSecondary },

  closedBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginTop: Spacing.xs,
  },
  closedBoxText: { fontSize: 12, color: Colors.dark.textSecondary, flex: 1 },

  savedBox: {
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(74,222,128,0.1)",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.3)",
    padding: Spacing.sm,
    marginTop: Spacing.xs,
  },
  savedBoxText: { fontSize: 12, color: "#4ade80", textAlign: "center" },

  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: Colors.dark.accent,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  editBtnActive: { backgroundColor: Colors.dark.accentDim },
  editBtnText: { fontSize: 12, fontWeight: "700", color: Colors.dark.accent },

  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.accent,
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    marginTop: Spacing.xs,
  },
  submitBtnActive: { opacity: 0.85 },
  submitBtnText: { fontSize: 14, fontWeight: "800", color: "#fff" },

  toastBar: {
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  toastText: { fontSize: 12, color: Colors.dark.text, textAlign: "center" },

  // History
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  historyTitle: { fontSize: 15, fontWeight: "800", color: Colors.dark.text },
  historyCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  historyFixture: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
    marginTop: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
    gap: 4,
  },
  historyTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  historyLogo: { width: 18, height: 18 },
  historyTeamNameHome: { fontSize: 11, color: Colors.dark.text, fontWeight: "600", textAlign: "right" },
  historyTeamNameAway: { fontSize: 11, color: Colors.dark.text, fontWeight: "600", textAlign: "left" },
  historyScore: { fontSize: 14, fontWeight: "900", color: Colors.dark.text, paddingHorizontal: 4 },
  historyPred: { fontSize: 11, color: Colors.dark.textSecondary, textAlign: "center" },
  historyNoPred: { fontSize: 11, color: Colors.dark.textSecondary, fontStyle: "italic", textAlign: "center" },

  resultPill: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  resultPillWon: {
    backgroundColor: "rgba(74,222,128,0.2)",
    borderColor: "#4ade80",
  },
  resultPillText: { fontSize: 11, fontWeight: "700", color: Colors.dark.text },

  historyLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  historyLinkActive: { backgroundColor: Colors.dark.backgroundDefault, borderColor: Colors.dark.accent },
  historyLinkText: { fontSize: 13, fontWeight: "600", color: Colors.dark.accent },

  backBtn: { padding: Spacing.sm, borderRadius: BorderRadius.sm },
  backBtnActive: { backgroundColor: "rgba(255,255,255,0.08)" },
  backBtnText: { fontSize: 13, fontWeight: "600", color: Colors.dark.accent },
});
