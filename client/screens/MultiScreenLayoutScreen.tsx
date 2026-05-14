// Multi Screen — layout picker.
//
// First step in the Multi Screen flow. Shows a one-line notice that each
// open stream consumes a connection on the IPTV provider, then lets the
// user pick one of the supported layouts: 2 (horizontal / vertical),
// 3 (2-top-1-bottom / 1-top-2-bottom), 4 (2x2 grid).
//
// Each option renders a small visual preview built from real flex-box
// rectangles so what the user sees on this screen is exactly what they
// get on the next one. Picking an option pushes MultiScreen with the
// chosen layout key.

import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
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

export type MultiLayout = "2h" | "2v" | "3-2t1b" | "3-1t2b" | "4";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type Option = { key: MultiLayout; label: string; subtitle: string };

const OPTIONS: Option[] = [
  { key: "2h",     label: "2 Screens",  subtitle: "Side by side" },
  { key: "2v",     label: "2 Screens",  subtitle: "Stacked" },
  { key: "3-2t1b", label: "3 Screens",  subtitle: "2 top · 1 bottom" },
  { key: "3-1t2b", label: "3 Screens",  subtitle: "1 top · 2 bottom" },
  { key: "4",      label: "4 Screens",  subtitle: "2 × 2 grid" },
];

export default function MultiScreenLayoutScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { userInfo } = useAuth();
  // Xtream returns max_connections as a string ("5"). Coerce safely; show
  // nothing if the API didn't return it for this account.
  const maxConn = Number(userInfo?.user_info?.max_connections);
  const showMaxConn = Number.isFinite(maxConn) && maxConn > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg }]}>
      {/* Header */}
      <View style={[styles.headerRow, { paddingHorizontal: Math.max(insets.left, Spacing.xl) }]}>
        <BackBtn onPress={() => navigation.goBack()} />
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.title}>Multi Screen</ThemedText>
          <ThemedText style={styles.subtitle}>Pick a layout</ThemedText>
        </View>
      </View>

      {/* Notice */}
      <View style={[styles.noticeWrap, { marginHorizontal: Math.max(insets.left, Spacing.xl) }]}>
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

      {/* Options */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.options, { paddingHorizontal: Math.max(insets.left, Spacing.xl) }]}
      >
        {OPTIONS.map((opt, idx) => (
          <LayoutCard
            key={opt.key}
            opt={opt}
            preferFocus={idx === 0}
            onPress={() => navigation.navigate("MultiScreen", { layout: opt.key })}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Layout preview card ────────────────────────────────────────────────────
function LayoutCard({ opt, onPress, preferFocus }: { opt: Option; onPress: () => void; preferFocus?: boolean }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hot = focused || pressed || hovered;
  return (
    <Pressable
      style={[styles.card, hot && styles.cardActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      hasTVPreferredFocus={preferFocus}
    >
      <View style={styles.preview}>
        <LayoutPreview layout={opt.key} />
      </View>
      <ThemedText style={[styles.cardTitle, hot && styles.cardTitleActive]}>{opt.label}</ThemedText>
      <ThemedText style={styles.cardSubtitle}>{opt.subtitle}</ThemedText>
    </Pressable>
  );
}

// ─── Mini preview of a layout — used both here and on the actual grid ──────
export function LayoutPreview({ layout }: { layout: MultiLayout }) {
  const cell = <View style={previewStyles.cell} />;
  switch (layout) {
    case "2h":
      return (
        <View style={previewStyles.root}>
          <View style={previewStyles.row}>{cell}{cell}</View>
        </View>
      );
    case "2v":
      return (
        <View style={previewStyles.root}>
          <View style={previewStyles.col}>{cell}{cell}</View>
        </View>
      );
    case "3-2t1b":
      return (
        <View style={previewStyles.root}>
          <View style={previewStyles.col}>
            <View style={previewStyles.row}>{cell}{cell}</View>
            <View style={previewStyles.row}>{cell}</View>
          </View>
        </View>
      );
    case "3-1t2b":
      return (
        <View style={previewStyles.root}>
          <View style={previewStyles.col}>
            <View style={previewStyles.row}>{cell}</View>
            <View style={previewStyles.row}>{cell}{cell}</View>
          </View>
        </View>
      );
    case "4":
      return (
        <View style={previewStyles.root}>
          <View style={previewStyles.col}>
            <View style={previewStyles.row}>{cell}{cell}</View>
            <View style={previewStyles.row}>{cell}{cell}</View>
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

  options: { gap: Spacing.lg, paddingVertical: Spacing.sm, alignItems: "stretch" },
  card: {
    width: 220,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    gap: Spacing.sm,
    alignItems: "center",
  },
  cardActive: {
    borderColor: Colors.dark.accent,
    transform: [{ translateY: -2 }],
    shadowColor: Colors.dark.accent,
    shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  preview: {
    width: 180, height: 110,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 4,
    overflow: "hidden",
  },
  cardTitle: { color: Colors.dark.text, fontSize: 14, fontWeight: "700" },
  cardTitleActive: { color: Colors.dark.accent },
  cardSubtitle: { color: Colors.dark.textSecondary, fontSize: 11 },
});

const previewStyles = StyleSheet.create({
  root: { flex: 1 },
  row: { flex: 1, flexDirection: "row", gap: 4 },
  col: { flex: 1, flexDirection: "column", gap: 4 },
  cell: {
    flex: 1,
    backgroundColor: "rgba(255,102,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.6)",
    borderRadius: 3,
  },
});
