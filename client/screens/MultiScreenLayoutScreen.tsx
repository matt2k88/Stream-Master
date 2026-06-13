// Multi Screen — layout picker.
//
// Shows only the layouts compatible with the user's connection count.
// maxConn === 1 → "not available" message.
// maxConn === 2 → 2-screen layouts only.
// maxConn === 3 → 2 + 3-screen layouts.
// maxConn >= 4  → all layouts.
// unknown       → all layouts shown (can't confirm; provider will reject).
//
// Each preview card shows numbered slots so the user knows which panel is
// which, and new PiP / main-heavy variants are included.

import React, { useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useAuth } from "@/contexts/AuthContext";

export type MultiLayout =
  | "2h" | "2v" | "2-main"
  | "3-2t1b" | "3-1t2b" | "3-big"
  | "4" | "4-big";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type Option = { key: MultiLayout; label: string; subtitle: string; screens: number };

const ALL_OPTIONS: Option[] = [
  { key: "2h",     label: "2 Screens", subtitle: "Side by side",    screens: 2 },
  { key: "2v",     label: "2 Screens", subtitle: "Stacked",         screens: 2 },
  { key: "2-main", label: "2 Screens", subtitle: "Main + side",     screens: 2 },
  { key: "3-2t1b", label: "3 Screens", subtitle: "2 top · 1 bottom", screens: 3 },
  { key: "3-1t2b", label: "3 Screens", subtitle: "1 top · 2 bottom", screens: 3 },
  { key: "3-big",  label: "3 Screens", subtitle: "Main + 2 small",  screens: 3 },
  { key: "4",      label: "4 Screens", subtitle: "2 × 2 grid",      screens: 4 },
  { key: "4-big",  label: "4 Screens", subtitle: "Main + 3 small",  screens: 4 },
];

export default function MultiScreenLayoutScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { userInfo } = useAuth();
  const { width: winW, height: winH } = useWindowDimensions();

  const maxConn = Number(userInfo?.user_info?.max_connections);
  const showMaxConn = Number.isFinite(maxConn) && maxConn > 0;

  // Filter layouts to only those the user's connection count supports
  const visibleOptions = useMemo<Option[]>(() => {
    if (!showMaxConn || maxConn >= 5) return ALL_OPTIONS;
    if (maxConn <= 1) return [];
    return ALL_OPTIONS.filter((o) => o.screens <= maxConn);
  }, [showMaxConn, maxConn]);

  const noMultiScreen = showMaxConn && maxConn <= 1;

  // Responsive grid: 4 cols when we have 7+ options, 3 cols otherwise
  const sidePad = Math.max(insets.left, Spacing.xl);
  const cols = visibleOptions.length >= 7 ? 4 : 3;
  const colGap = Spacing.lg;
  const cardW = Math.max(
    120,
    Math.floor((winW - sidePad * 2 - colGap * (cols - 1)) / cols),
  );
  const reserved = 60 + 60 + Spacing.xl * 2 + insets.top + insets.bottom + Spacing.lg;
  const rows = Math.ceil(visibleOptions.length / cols);
  const rowGap = Spacing.md;
  const cardH = Math.max(
    120,
    Math.floor((winH - reserved - rowGap * (rows - 1)) / rows),
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg }]}>
      {/* Header */}
      <View style={[styles.headerRow, { paddingHorizontal: sidePad }]}>
        <BackBtn onPress={() => navigation.goBack()} />
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.title}>Multi Screen</ThemedText>
          <ThemedText style={styles.subtitle}>Pick a layout</ThemedText>
        </View>
      </View>

      {/* Notice */}
      <View style={[styles.noticeWrap, { marginHorizontal: sidePad }]}>
        <LinearGradient
          colors={["rgba(255,102,0,0.18)", "rgba(255,102,0,0.06)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <Feather name="info" size={16} color={Colors.dark.accent} />
        <ThemedText style={styles.noticeText}>
          Multi Screen requires more than one connection — each individual screen uses one connection on your Ultra Cast account.
        </ThemedText>
        {showMaxConn ? (
          <View style={styles.connBadge}>
            <Feather name="users" size={13} color={Colors.dark.accent} />
            <View>
              <ThemedText style={styles.connBadgeLabel}>Account Connections</ThemedText>
              <ThemedText style={styles.connBadgeValue}>{maxConn}</ThemedText>
            </View>
          </View>
        ) : null}
      </View>

      {/* Body */}
      {noMultiScreen ? (
        <View style={styles.noMultiWrap}>
          <View style={styles.noMultiIcon}>
            <Feather name="monitor" size={38} color="rgba(255,102,0,0.4)" />
          </View>
          <ThemedText style={styles.noMultiTitle}>Multi Screen Unavailable</ThemedText>
          <ThemedText style={styles.noMultiText}>
            Multi Screen requires more than one connection. As your account is a single connection, there are no multi screen layouts available.
          </ThemedText>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.optionsGrid, { paddingHorizontal: sidePad, gap: rowGap }]}
          showsVerticalScrollIndicator={false}
        >
          {visibleOptions.map((opt, idx) => (
            <LayoutCard
              key={opt.key}
              opt={opt}
              width={cardW}
              height={cardH}
              preferFocus={idx === 0}
              onPress={() => navigation.navigate("MultiScreen", { layout: opt.key })}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Layout preview card ────────────────────────────────────────────────────
function LayoutCard({
  opt, onPress, preferFocus, width, height,
}: {
  opt: Option; onPress: () => void; preferFocus?: boolean; width: number; height: number;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hot = focused || pressed || hovered;
  const previewH = Math.max(60, Math.min(height - 80, 180));
  const previewW = Math.min(width - Spacing.md * 2, previewH * 1.6);
  return (
    <Pressable
      style={[styles.card, { width, height }, hot && styles.cardActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      hasTVPreferredFocus={preferFocus}
    >
      <View style={[styles.preview, { width: previewW, height: previewH }]}>
        <LayoutPreview layout={opt.key} />
      </View>
      <ThemedText style={[styles.cardTitle, hot && styles.cardTitleActive]}>{opt.label}</ThemedText>
      <ThemedText style={styles.cardSubtitle}>{opt.subtitle}</ThemedText>
    </Pressable>
  );
}

// ─── Numbered cell inside a preview ────────────────────────────────────────
function NC({ n, main }: { n: number; main?: boolean }) {
  return (
    <View style={[previewStyles.cell, main ? previewStyles.cellMain : null]}>
      <ThemedText style={[previewStyles.cellNum, main ? previewStyles.cellNumMain : null]}>
        {n}
      </ThemedText>
    </View>
  );
}

// ─── Mini preview of a layout — used both here and on the actual grid ──────
export function LayoutPreview({ layout }: { layout: MultiLayout }) {
  switch (layout) {
    // ── 2-screen ─────────────────────────────────────────────────────────
    case "2h":
      return (
        <View style={previewStyles.root}>
          <View style={previewStyles.row}><NC n={1} /><NC n={2} /></View>
        </View>
      );
    case "2v":
      return (
        <View style={previewStyles.root}>
          <View style={previewStyles.col}><NC n={1} /><NC n={2} /></View>
        </View>
      );
    case "2-main":
      return (
        <View style={previewStyles.root}>
          <View style={previewStyles.row}>
            <NC n={1} main />
            <NC n={2} />
          </View>
        </View>
      );

    // ── 3-screen ─────────────────────────────────────────────────────────
    case "3-2t1b":
      return (
        <View style={previewStyles.root}>
          <View style={previewStyles.col}>
            <View style={previewStyles.row}><NC n={1} /><NC n={2} /></View>
            <View style={previewStyles.row}><NC n={3} /></View>
          </View>
        </View>
      );
    case "3-1t2b":
      return (
        <View style={previewStyles.root}>
          <View style={previewStyles.col}>
            <View style={previewStyles.row}><NC n={1} /></View>
            <View style={previewStyles.row}><NC n={2} /><NC n={3} /></View>
          </View>
        </View>
      );
    case "3-big":
      return (
        <View style={previewStyles.root}>
          <View style={previewStyles.row}>
            <NC n={1} main />
            <View style={previewStyles.colSmall}>
              <NC n={2} />
              <NC n={3} />
            </View>
          </View>
        </View>
      );

    // ── 4-screen ─────────────────────────────────────────────────────────
    case "4":
      return (
        <View style={previewStyles.root}>
          <View style={previewStyles.col}>
            <View style={previewStyles.row}><NC n={1} /><NC n={2} /></View>
            <View style={previewStyles.row}><NC n={3} /><NC n={4} /></View>
          </View>
        </View>
      );
    case "4-big":
      return (
        <View style={previewStyles.root}>
          <View style={previewStyles.row}>
            <NC n={1} main />
            <View style={previewStyles.colSmall}>
              <NC n={2} />
              <NC n={3} />
              <NC n={4} />
            </View>
          </View>
        </View>
      );
  }
}

// ─── Header back button ────────────────────────────────────────────────────
function BackBtn({ onPress }: { onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hot = focused || pressed || hovered;
  return (
    <Pressable
      style={[styles.backBtn, hot && styles.backBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <Feather name="arrow-left" size={18} color={hot ? Colors.dark.accent : Colors.dark.text} />
    </Pressable>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  headerRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md, marginBottom: Spacing.lg },
  title: { fontSize: 22, fontWeight: "800", color: Colors.dark.text },
  subtitle: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: 2 },

  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center", overflow: "hidden",
  },
  backBtnActive: { borderColor: Colors.dark.accent },

  noticeWrap: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: "rgba(255,102,0,0.35)",
    overflow: "hidden",
    marginBottom: Spacing.xl,
  },
  noticeText: { flex: 1, color: Colors.dark.text, fontSize: 12, lineHeight: 16 },

  connBadge: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(255,102,0,0.18)",
    borderWidth: 1, borderColor: "rgba(255,102,0,0.55)",
    marginLeft: Spacing.sm,
  },
  connBadgeLabel: { color: Colors.dark.textSecondary, fontSize: 9, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  connBadgeValue: { color: Colors.dark.accent, fontSize: 16, fontWeight: "800", lineHeight: 18 },

  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignContent: "flex-start",
    columnGap: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingBottom: Spacing.xl,
  },

  card: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    gap: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  cardActive: {
    borderColor: Colors.dark.accent,
    transform: [{ translateY: -2 }],
    shadowColor: Colors.dark.accent,
    shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  preview: {
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 4,
    overflow: "hidden",
  },
  cardTitle: { color: Colors.dark.text, fontSize: 14, fontWeight: "700" },
  cardTitleActive: { color: Colors.dark.accent },
  cardSubtitle: { color: Colors.dark.textSecondary, fontSize: 11 },

  noMultiWrap: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: Spacing["3xl"], gap: Spacing.lg,
  },
  noMultiIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "rgba(255,102,0,0.08)",
    borderWidth: 1, borderColor: "rgba(255,102,0,0.25)",
    alignItems: "center", justifyContent: "center",
  },
  noMultiTitle: { color: Colors.dark.text, fontSize: 18, fontWeight: "800", textAlign: "center" },
  noMultiText: {
    color: Colors.dark.textSecondary, fontSize: 13, lineHeight: 20,
    textAlign: "center", maxWidth: 480,
  },
});

const previewStyles = StyleSheet.create({
  root: { flex: 1 },
  row: { flex: 1, flexDirection: "row", gap: 4 },
  col: { flex: 1, flexDirection: "column", gap: 4 },
  colSmall: { flex: 1, flexDirection: "column", gap: 4 },

  cell: {
    flex: 1,
    backgroundColor: "rgba(255,102,0,0.32)",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.58)",
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  cellMain: {
    flex: 1.8,
    backgroundColor: "rgba(255,102,0,0.50)",
    borderColor: "rgba(255,102,0,0.85)",
  },

  cellNum: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 9,
    fontWeight: "800",
    lineHeight: 11,
  },
  cellNumMain: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 11,
  },
});
