import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, ViewStyle, Animated } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import {
  useFootball,
  FootballScore,
  FootballCorner,
} from "@/contexts/FootballContext";
import { leagueName } from "@/constants/football-leagues";

const LINE_HEIGHT = 30;
const MAX_LINES = 5;
// Continuous auto-scroll: slow glide speed (px/sec) with a pause at each end.
const SCROLL_SPEED = 14;
const SCROLL_PAUSE = 2200;
// How long a scoring row keeps flashing, and how long the announcement line
// below the ticker lingers — kept long so users who scrolled away still see it.
const FLASH_MS = 15000;
const ANNOUNCE_MS = 22000;
const MAX_ANNOUNCEMENTS = 3;

const FINISHED = ["FT", "AET", "PEN", "AWD", "WO"];

interface GoalAnnouncement {
  id: string;
  fixtureId: number;
  home: string | null;
  away: string | null;
  homeGoals: number;
  awayGoals: number;
  scorer: string | null;
  minute: number | null;
  expiresAt: number;
}

function minuteLabel(s: FootballScore): string {
  const st = (s.status_short || "").toUpperCase();
  if (st === "HT") return "HT";
  if (FINISHED.includes(st)) return "FT";
  if (s.finished_at) return "FT";
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

function announcementText(a: GoalAnnouncement): string {
  const score = `${a.homeGoals}-${a.awayGoals}`;
  const game = `${a.home ?? "?"} ${score} ${a.away ?? "?"}`;
  if (a.scorer) {
    const min = a.minute != null ? ` ${a.minute}'` : "";
    return `GOAL! ${a.scorer}${min} — ${game}`;
  }
  return `GOAL! ${game}`;
}

function cornerStyle(
  corner: FootballCorner,
  top: number,
  bottom: number,
  side: number,
): ViewStyle {
  const isLeft = corner.endsWith("left");
  const horiz: ViewStyle = isLeft
    ? { left: side + Spacing.md }
    : { right: side + Spacing.md };
  if (corner.startsWith("top")) {
    return { position: "absolute", top: top + Spacing.md, ...horiz };
  }
  if (corner.startsWith("bottom")) {
    return { position: "absolute", bottom: bottom + Spacing.md, ...horiz };
  }
  return { position: "absolute", top: "38%", ...horiz };
}

export function FootballScoreTracker({
  topInset = 0,
  bottomInset = 0,
  sideInset = 0,
}: {
  topInset?: number;
  bottomInset?: number;
  sideInset?: number;
}) {
  const { prefs, scores, scoresLoading } = useFootball();
  const corner = prefs.corner as FootballCorner;
  const scrollRef = useRef<ScrollView>(null);
  const [contentH, setContentH] = useState(0);

  // Always list games alphabetically by home team (stable, not by minute).
  const sortedScores = useMemo(
    () =>
      [...scores].sort((a, b) =>
        (a.home_team ?? "").localeCompare(b.home_team ?? "", undefined, {
          sensitivity: "base",
        }),
      ),
    [scores],
  );

  // ── Goal detection ────────────────────────────────────────────────────────
  // Compare each poll's totals against the previous poll. A fixture whose total
  // goals went up = a fresh goal → flash its row + add an announcement line.
  const prevTotalsRef = useRef<Map<number, number>>(new Map());
  // fixture_id -> timestamp the flash should stop. A re-score just pushes the
  // deadline out, so the row keeps flashing the full FLASH_MS from the last goal.
  const flashUntilRef = useRef<Map<number, number>>(new Map());
  const [flashIds, setFlashIds] = useState<Set<number>>(new Set());
  const [announcements, setAnnouncements] = useState<GoalAnnouncement[]>([]);
  const flash = useRef(new Animated.Value(0)).current;

  // Reset goal state when the tracked league changes (avoids false positives).
  useEffect(() => {
    prevTotalsRef.current = new Map();
    flashUntilRef.current = new Map();
    setFlashIds(new Set());
    setAnnouncements([]);
  }, [prefs.league_id]);

  useEffect(() => {
    const prev = prevTotalsRef.current;
    const next = new Map<number, number>();
    const goals: FootballScore[] = [];
    for (const s of scores) {
      const total = (s.home_goals ?? 0) + (s.away_goals ?? 0);
      next.set(s.fixture_id, total);
      const before = prev.get(s.fixture_id);
      if (before != null && total > before) goals.push(s);
    }
    prevTotalsRef.current = next;

    if (goals.length) {
      const now = Date.now();
      goals.forEach((s) => flashUntilRef.current.set(s.fixture_id, now + FLASH_MS));
      setFlashIds(new Set(flashUntilRef.current.keys()));
      setAnnouncements((cur) => [
        ...cur,
        ...goals.map((s) => ({
          id: `${s.fixture_id}-${now}-${s.home_goals}-${s.away_goals}`,
          fixtureId: s.fixture_id,
          home: s.home_team,
          away: s.away_team,
          homeGoals: s.home_goals,
          awayGoals: s.away_goals,
          scorer: s.last_goal_player ?? null,
          minute: s.last_goal_minute ?? null,
          expiresAt: now + ANNOUNCE_MS,
        })),
      ]);
    }

    // Enrich any pending announcement with the scorer once the server provides
    // it (it can land a cycle after the score itself).
    setAnnouncements((cur) => {
      if (cur.length === 0) return cur;
      let changed = false;
      const upd = cur.map((a) => {
        if (a.scorer) return a;
        const row = scores.find((s) => s.fixture_id === a.fixtureId);
        if (row?.last_goal_player) {
          changed = true;
          return {
            ...a,
            scorer: row.last_goal_player,
            minute: row.last_goal_minute ?? a.minute,
          };
        }
        return a;
      });
      return changed ? upd : cur;
    });
  }, [scores]);

  // Expire announcements over time.
  useEffect(() => {
    if (announcements.length === 0) return;
    const id = setInterval(() => {
      setAnnouncements((cur) => {
        const now = Date.now();
        const kept = cur.filter((a) => a.expiresAt > now);
        return kept.length === cur.length ? cur : kept;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [announcements.length]);

  // Drop flashing rows once their deadline passes (re-scores push the deadline
  // out via flashUntilRef, so this never clears a still-active flash early).
  useEffect(() => {
    if (flashIds.size === 0) return;
    const id = setInterval(() => {
      const now = Date.now();
      const m = flashUntilRef.current;
      let changed = false;
      for (const [fid, until] of m) {
        if (until <= now) {
          m.delete(fid);
          changed = true;
        }
      }
      if (changed) setFlashIds(new Set(m.keys()));
    }, 500);
    return () => clearInterval(id);
  }, [flashIds.size]);

  // Pulse the flash highlight while any row is flashing.
  useEffect(() => {
    if (flashIds.size === 0) {
      flash.stopAnimation();
      flash.setValue(0);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(flash, {
          toValue: 1,
          duration: 480,
          useNativeDriver: false,
        }),
        Animated.timing(flash, {
          toValue: 0,
          duration: 480,
          useNativeDriver: false,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [flashIds.size, flash]);

  const flashBg = flash.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(61,220,132,0.0)", "rgba(61,220,132,0.5)"],
  });

  const containerH =
    Math.max(1, Math.min(sortedScores.length, MAX_LINES)) * LINE_HEIGHT;
  const canScroll = sortedScores.length > 0 && contentH > containerH + 4;

  // When the list empties, drop the stale measured height so the scroll loop
  // tears down instead of running forever in the empty/loading state.
  useEffect(() => {
    if (sortedScores.length === 0) setContentH(0);
  }, [sortedScores.length]);

  // Auto-scroll loop: a slow, continuous glide to the bottom, pause, then glide
  // back to the top (frame-by-frame so it's smooth rather than jumpy).
  useEffect(() => {
    if (!canScroll) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    const maxY = Math.max(0, contentH - containerH);
    let y = 0;
    let dir = 1;
    let last = Date.now();
    let pausedUntil = last + SCROLL_PAUSE;
    let raf = 0;

    const tick = () => {
      const now = Date.now();
      const dt = now - last;
      last = now;
      if (now >= pausedUntil) {
        y += dir * SCROLL_SPEED * (dt / 1000);
        if (y >= maxY) {
          y = maxY;
          dir = -1;
          pausedUntil = now + SCROLL_PAUSE;
        } else if (y <= 0) {
          y = 0;
          dir = 1;
          pausedUntil = now + SCROLL_PAUSE;
        }
        scrollRef.current?.scrollTo({ y, animated: false });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [canScroll, contentH, containerH]);

  const name =
    leagueName(prefs.league_id) || scores[0]?.league_name || "Live Football";

  const emptyMessage =
    prefs.league_id == null
      ? "No league selected"
      : scoresLoading && scores.length === 0
        ? "Loading…"
        : "No live games";

  const visibleAnnouncements = announcements.slice(-MAX_ANNOUNCEMENTS);

  return (
    <View
      style={[styles.wrap, cornerStyle(corner, topInset, bottomInset, sideInset)]}
      pointerEvents="none"
    >
      <View style={styles.header}>
        <MaterialCommunityIcons name="soccer" size={13} color={Colors.dark.accent} />
        <ThemedText style={styles.headerText} numberOfLines={1}>
          {name}
        </ThemedText>
      </View>
      {sortedScores.length === 0 ? (
        <View style={styles.emptyRow}>
          <ThemedText style={styles.emptyText}>{emptyMessage}</ThemedText>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={{ height: containerH }}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={(_w, h) => setContentH(h)}
        >
          {sortedScores.map((s) => {
            const flashing = flashIds.has(s.fixture_id);
            return (
              <Animated.View
                key={s.fixture_id}
                style={[
                  styles.row,
                  flashing ? { backgroundColor: flashBg } : null,
                ]}
              >
                <ThemedText style={[styles.team, styles.teamHome]} numberOfLines={1}>
                  {s.home_team ?? "?"}
                </ThemedText>
                <View style={styles.scoreBox}>
                  <ThemedText style={styles.score}>
                    {s.home_goals}-{s.away_goals}
                  </ThemedText>
                </View>
                <ThemedText style={[styles.team, styles.teamAway]} numberOfLines={1}>
                  {s.away_team ?? "?"}
                </ThemedText>
                <ThemedText style={[styles.minute, isLive(s) && styles.minuteLive]}>
                  {minuteLabel(s)}
                </ThemedText>
              </Animated.View>
            );
          })}
        </ScrollView>
      )}
      {visibleAnnouncements.length > 0 ? (
        <View style={styles.announceWrap}>
          {visibleAnnouncements.map((a) => (
            <View key={a.id} style={styles.announceRow}>
              <MaterialCommunityIcons name="soccer" size={11} color="#3ddc84" />
              <ThemedText style={styles.announceText} numberOfLines={1}>
                {announcementText(a)}
              </ThemedText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 300,
    backgroundColor: "rgba(8,8,8,0.62)",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.45)",
    overflow: "hidden",
    zIndex: 65,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    backgroundColor: "rgba(255,102,0,0.18)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,102,0,0.3)",
  },
  headerText: {
    flex: 1,
    color: Colors.dark.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  emptyRow: {
    height: LINE_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  row: {
    height: LINE_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
  },
  team: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: "600",
  },
  teamHome: {
    textAlign: "right",
  },
  teamAway: {
    textAlign: "left",
  },
  scoreBox: {
    minWidth: 38,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  score: {
    color: Colors.dark.accent,
    fontSize: 13,
    fontWeight: "800",
  },
  minute: {
    width: 32,
    textAlign: "right",
    color: Colors.dark.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  minuteLive: {
    color: "#3ddc84",
  },
  announceWrap: {
    borderTopWidth: 1,
    borderTopColor: "rgba(61,220,132,0.4)",
    backgroundColor: "rgba(61,220,132,0.1)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    gap: 2,
  },
  announceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  announceText: {
    flex: 1,
    color: "#eafff2",
    fontSize: 11,
    fontWeight: "700",
  },
});
