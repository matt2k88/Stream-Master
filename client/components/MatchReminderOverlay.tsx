import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useMatchReminder } from "@/contexts/MatchReminderContext";

function Badge({ logo, size = 34 }: { logo: string | null; size?: number }) {
  if (!logo) {
    return (
      <View style={[styles.badgeFallback, { width: size, height: size, borderRadius: size / 2 }]}>
        <MaterialCommunityIcons name="shield-outline" size={size * 0.55} color={Colors.dark.textSecondary} />
      </View>
    );
  }
  return (
    <Image source={{ uri: logo }} style={{ width: size, height: size }} contentFit="contain" transition={120} />
  );
}

function FocusablePressable({
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

function kickoffLabel(kickoff: string, kind: "prematch" | "kickoff"): string {
  const k = Date.parse(kickoff);
  if (!Number.isFinite(k)) return kind === "kickoff" ? "Kicking off now" : "Kicking off soon";
  const mins = Math.round((k - Date.now()) / 60000);
  if (mins <= 0) return "Kicking off now";
  if (mins === 1) return "Kicks off in 1 minute";
  return `Kicks off in ${mins} minutes`;
}

export default function MatchReminderOverlay() {
  const {
    activeReminder,
    canWatchActive,
    dismissReminder,
    watchReminder,
    remindAtKickoff,
  } = useMatchReminder();

  const insets = useSafeAreaInsets();
  // Re-render every 30s so the countdown text stays roughly current.
  const [, force] = useState(0);
  useEffect(() => {
    if (!activeReminder) return;
    const id = setInterval(() => force((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, [activeReminder]);

  if (!activeReminder) return null;

  const r = activeReminder;
  const width = Dimensions.get("window").width;
  const cardWidth = Math.min(460, width - Spacing.lg * 2);
  const showRemindAtKickoff = r.kind === "prematch";

  return (
    <View pointerEvents="box-none" style={[styles.root, { paddingTop: insets.top + Spacing.sm }]}>
      <View style={[styles.card, { width: cardWidth }]}>
        <View style={styles.headerRow}>
          <View style={styles.tag}>
            <Feather name="bell" size={12} color={Colors.dark.accent} />
            <ThemedText style={styles.tagText}>
              {r.kind === "kickoff" ? "KICK OFF" : "MATCH REMINDER"}
            </ThemedText>
          </View>
          <FocusablePressable style={styles.closeBtn} activeStyle={styles.closeBtnActive} onPress={dismissReminder}>
            {(active) => <Feather name="x" size={18} color={active ? Colors.dark.accent : Colors.dark.textSecondary} />}
          </FocusablePressable>
        </View>

        <View style={styles.matchRow}>
          <View style={styles.teamCol}>
            <Badge logo={r.homeLogo} />
            <ThemedText style={styles.teamName} numberOfLines={1}>
              {r.home}
            </ThemedText>
          </View>
          <ThemedText style={styles.vs}>v</ThemedText>
          <View style={styles.teamCol}>
            <Badge logo={r.awayLogo} />
            <ThemedText style={styles.teamName} numberOfLines={1}>
              {r.away}
            </ThemedText>
          </View>
        </View>

        <ThemedText style={styles.kickoff}>{kickoffLabel(r.kickoff, r.kind)}</ThemedText>
        {r.league ? (
          <ThemedText style={styles.league} numberOfLines={1}>
            {r.league}
          </ThemedText>
        ) : null}

        <View style={styles.actions}>
          {canWatchActive ? (
            <FocusablePressable
              style={[styles.btn, styles.btnPrimary]}
              activeStyle={styles.btnPrimaryActive}
              onPress={watchReminder}
            >
              <Feather name="play" size={15} color="#0a0a0a" />
              <ThemedText style={styles.btnPrimaryText}>Watch Now</ThemedText>
            </FocusablePressable>
          ) : null}

          {showRemindAtKickoff ? (
            <FocusablePressable
              style={[styles.btn, styles.btnSecondary]}
              activeStyle={styles.btnSecondaryActive}
              onPress={remindAtKickoff}
            >
              {(active) => (
                <>
                  <Feather name="clock" size={15} color={active ? Colors.dark.accent : Colors.dark.text} />
                  <ThemedText style={[styles.btnSecondaryText, active && { color: Colors.dark.accent }]}>
                    Remind at kick off
                  </ThemedText>
                </>
              )}
            </FocusablePressable>
          ) : null}

          <FocusablePressable
            style={[styles.btn, styles.btnGhost]}
            activeStyle={styles.btnGhostActive}
            onPress={dismissReminder}
          >
            {(active) => (
              <ThemedText style={[styles.btnGhostText, active && { color: Colors.dark.accent }]}>
                Dismiss
              </ThemedText>
            )}
          </FocusablePressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
    elevation: 9999,
  },
  card: {
    backgroundColor: "#101010",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.55)",
    padding: Spacing.md,
    gap: Spacing.sm,
    shadowColor: Colors.dark.accent,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tagText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: Colors.dark.accent,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  closeBtnActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accent + "1A",
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    marginTop: 2,
  },
  teamCol: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    minWidth: 0,
  },
  teamName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  vs: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
  },
  kickoff: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.accent,
    textAlign: "center",
    marginTop: 2,
  },
  league: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    textAlign: "center",
  },
  badgeFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 42,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: Colors.dark.accent,
  },
  btnPrimaryActive: {
    backgroundColor: "#ff8533",
  },
  btnPrimaryText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0a0a0a",
  },
  btnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  btnSecondaryActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accent + "1A",
  },
  btnSecondaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  btnGhost: {
    paddingHorizontal: Spacing.md,
  },
  btnGhostActive: {
    backgroundColor: Colors.dark.accent + "14",
  },
  btnGhostText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.dark.textSecondary,
  },
});
