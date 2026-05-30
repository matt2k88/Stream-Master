import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, ScrollView, ViewStyle } from "react-native";
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
          {sortedScores.map((s) => (
            <View key={s.fixture_id} style={styles.row}>
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
            </View>
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
});
