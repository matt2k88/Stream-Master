import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useFootball, FootballCorner } from "@/contexts/FootballContext";
import { FOOTBALL_LEAGUE_GROUPS } from "@/constants/football-leagues";

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

function SectionHeading({ label }: { label: string }) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionHeadingLine} />
      <ThemedText style={styles.sectionHeadingText}>{label}</ThemedText>
      <View style={styles.sectionHeadingLine} />
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
        <ThemedText style={styles.headerTitle}>Football Scores</ThemedText>
        <View style={styles.iconBtn} />
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: padH, paddingBottom: insets.bottom + Spacing.xl, paddingTop: Spacing.md, gap: Spacing.md }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
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
      </ScrollView>
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
