import React, { useEffect, useRef, useState } from "react";
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
const SCROLL_PERIOD = 4000;
const GOAL_DURATION = 3200;

const FINISHED = ["FT", "AET", "PEN", "AWD", "WO"];

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

function ScoreRow({ score, goal }: { score: FootballScore; goal: boolean }) {
  // 0 = normal row, 1 = GOAL! flash.
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!goal) return;
    anim.setValue(0);
    Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: false }),
      Animated.delay(GOAL_DURATION - 520),
      Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: false }),
    ]).start();
  }, [goal, anim, score.home_goals, score.away_goals]);

  const rowBg = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(0,0,0,0)", "rgba(255,102,0,0.22)"],
  });
  const pulse = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.12, 1],
  });

  return (
    <Animated.View style={[styles.row, { backgroundColor: rowBg }]}>
      <ThemedText style={[styles.team, styles.teamHome]} numberOfLines={1}>
        {score.home_team ?? "?"}
      </ThemedText>
      <View style={styles.scoreBox}>
        <ThemedText style={styles.score}>
          {score.home_goals}-{score.away_goals}
        </ThemedText>
      </View>
      <ThemedText style={[styles.team, styles.teamAway]} numberOfLines={1}>
        {score.away_team ?? "?"}
      </ThemedText>
      <ThemedText style={[styles.minute, isLive(score) && styles.minuteLive]}>
        {minuteLabel(score)}
      </ThemedText>

      {goal ? (
        <Animated.View
          style={[styles.goalOverlay, { opacity: anim }]}
          pointerEvents="none"
        >
          <Animated.Text style={[styles.goalText, { transform: [{ scale: pulse }] }]}>
            GOAL!
          </Animated.Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
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

  // Track previous goal totals per fixture to detect new goals between refreshes.
  const prevGoalsRef = useRef<Map<number, number>>(new Map());
  // Fixture ids currently flashing GOAL!, with the timestamp the flash started.
  const [goalFixtures, setGoalFixtures] = useState<Set<number>>(new Set());

  useEffect(() => {
    const prev = prevGoalsRef.current;
    const firstSeen = prev.size === 0;
    const newGoals: number[] = [];

    for (const s of scores) {
      const total = (s.home_goals ?? 0) + (s.away_goals ?? 0);
      const before = prev.get(s.fixture_id);
      // Only flash if we've seen this fixture before and its total rose. Never
      // flash on the very first snapshot so initial load is silent.
      if (!firstSeen && before != null && total > before) {
        newGoals.push(s.fixture_id);
      }
      prev.set(s.fixture_id, total);
    }

    // Drop fixtures that are no longer present.
    const liveIds = new Set(scores.map((s) => s.fixture_id));
    for (const id of Array.from(prev.keys())) {
      if (!liveIds.has(id)) prev.delete(id);
    }

    if (newGoals.length === 0) return;

    setGoalFixtures((curr) => {
      const next = new Set(curr);
      newGoals.forEach((id) => next.add(id));
      return next;
    });

    const timers = newGoals.map((id) =>
      setTimeout(() => {
        setGoalFixtures((curr) => {
          if (!curr.has(id)) return curr;
          const next = new Set(curr);
          next.delete(id);
          return next;
        });
      }, GOAL_DURATION),
    );
    return () => timers.forEach(clearTimeout);
  }, [scores]);

  const containerH = Math.max(1, Math.min(scores.length, MAX_LINES)) * LINE_HEIGHT;
  const canScroll = contentH > containerH + 4;

  // Auto-scroll loop: glide to the bottom, pause, glide back to the top.
  useEffect(() => {
    if (!canScroll) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    let toBottom = true;
    const id = setInterval(() => {
      const y = toBottom ? Math.max(0, contentH - containerH) : 0;
      scrollRef.current?.scrollTo({ y, animated: true });
      toBottom = !toBottom;
    }, SCROLL_PERIOD);
    return () => clearInterval(id);
  }, [canScroll, contentH, containerH]);

  const name =
    leagueName(prefs.league_id) || scores[0]?.league_name || "Live Football";

  const emptyMessage =
    prefs.league_id == null
      ? "No league selected"
      : scoresLoading && scores.length === 0
        ? "Loading…"
        : "No live games";

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
      {scores.length === 0 ? (
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
          {scores.map((s) => (
            <ScoreRow key={s.fixture_id} score={s} goal={goalFixtures.has(s.fixture_id)} />
          ))}
        </ScrollView>
      )}
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
  goalOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,8,8,0.55)",
  },
  goalText: {
    color: Colors.dark.accent,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2,
  },
});
