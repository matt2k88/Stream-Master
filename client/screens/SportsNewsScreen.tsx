import React, { useState, useCallback, useRef } from "react";
import {
  View, StyleSheet, Pressable, FlatList, Modal, ScrollView,
  ActivityIndicator, useWindowDimensions, Platform,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { useAccent, withAlpha } from "@/contexts/ThemeContext";
import SideMenuButton from "@/components/SideMenuButton";

// ── TV Back button (inline, mirrors UltraTubeScreen pattern) ─────────────
function TVBackButton({ onPress }: { onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const active = focused || pressed || hovered;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.backBtn, active && styles.backBtnActive]}
    >
      <Feather name="arrow-left" size={16} color={active ? Colors.dark.text : Colors.dark.textSecondary} />
      <ThemedText style={[styles.backText, active && styles.backTextActive]}>Back</ThemedText>
    </Pressable>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────
interface NewsItem {
  id: string;
  title: string;
  summary: string;
  imageUrl: string;
  link: string;
  publishedAt: string;
}

// ── Sport tabs ────────────────────────────────────────────────────────────
const SPORTS = [
  { key: "all",       label: "All Sports",  mciIcon: "newspaper-variant-outline" },
  { key: "football",  label: "Football",    mciIcon: "soccer"                   },
  { key: "f1",        label: "Formula 1",   mciIcon: "car-sports"               },
  { key: "cricket",   label: "Cricket",     mciIcon: "cricket"                  },
  { key: "tennis",    label: "Tennis",      mciIcon: "tennis"                   },
  { key: "rugby",     label: "Rugby",       mciIcon: "rugby"                    },
  { key: "boxing",    label: "Boxing",      mciIcon: "boxing-glove"             },
  { key: "golf",      label: "Golf",        mciIcon: "golf"                     },
  { key: "athletics", label: "Athletics",   mciIcon: "run"                      },
] as const;

type SportKey = (typeof SPORTS)[number]["key"];

// ── Helpers ───────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch { return ""; }
}

// ── Sport tab ─────────────────────────────────────────────────────────────
function SportTab({
  sport, active, onPress, preferFocus,
}: {
  sport: (typeof SPORTS)[number];
  active: boolean;
  onPress: () => void;
  preferFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const accent = useAccent();
  const highlight = active || focused || hovered;
  const tint = highlight ? accent.accent : Colors.dark.textSecondary;

  return (
    <Pressable
      hasTVPreferredFocus={preferFocus}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.sportTab,
        highlight && {
          backgroundColor: withAlpha(accent.accent, active ? 0.14 : 0.07),
          borderColor: withAlpha(accent.accent, active ? 0.5 : 0.3),
        },
      ]}
    >
      {active ? <View style={[styles.tabActiveBar, { backgroundColor: accent.accent }]} /> : null}
      <MaterialCommunityIcons name={sport.mciIcon as any} size={18} color={tint} />
      <ThemedText style={[styles.tabLabel, highlight && { color: accent.accent }]} numberOfLines={1}>
        {sport.label}
      </ThemedText>
    </Pressable>
  );
}

// ── Article card ──────────────────────────────────────────────────────────
function ArticleCard({
  item, onPress, preferFocus,
}: {
  item: NewsItem;
  onPress: () => void;
  preferFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const accent = useAccent();
  const highlight = focused || hovered || pressed;
  const ago = timeAgo(item.publishedAt);

  return (
    <Pressable
      hasTVPreferredFocus={preferFocus}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.card, highlight && { borderColor: withAlpha(accent.accent, 0.55), shadowColor: accent.accent, shadowOpacity: 0.25, shadowRadius: 10 }]}
    >
      {/* Hero image */}
      <View style={styles.cardImageWrap}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.cardImage} contentFit="cover" />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <MaterialCommunityIcons name="newspaper-variant-outline" size={32} color={Colors.dark.textSecondary} />
          </View>
        )}
        <LinearGradient
          colors={["transparent", "rgba(8,8,8,0.85)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 0, y: 1 }}
        />
        {ago ? (
          <View style={[styles.timeBadge, { backgroundColor: withAlpha(accent.accent, 0.9) }]}>
            <ThemedText style={styles.timeBadgeText}>{ago}</ThemedText>
          </View>
        ) : null}
      </View>

      {/* Text content */}
      <View style={styles.cardBody}>
        <ThemedText style={styles.cardTitle} numberOfLines={3}>{item.title}</ThemedText>
        {item.summary ? (
          <ThemedText style={styles.cardSummary} numberOfLines={2}>{item.summary}</ThemedText>
        ) : null}
      </View>

      {highlight ? (
        <View style={[styles.cardFocusBar, { backgroundColor: accent.accent }]} />
      ) : null}
    </Pressable>
  );
}

// ── Article reader modal ──────────────────────────────────────────────────
function ArticleModal({
  item, onClose,
}: {
  item: NewsItem | null;
  onClose: () => void;
}) {
  const [closeFocused, setCloseFocused] = useState(false);
  const [readFocused, setReadFocused] = useState(false);
  const [readHovered, setReadHovered] = useState(false);
  const accent = useAccent();
  const insets = useSafeAreaInsets();

  const openFull = useCallback(async () => {
    if (!item?.link) return;
    try {
      await WebBrowser.openBrowserAsync(item.link, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN });
    } catch {
      // fallback: ignore
    }
  }, [item]);

  if (!item) return null;

  const readActive = readFocused || readHovered;

  return (
    <Modal
      visible
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.modalRoot, { backgroundColor: "#0a0a0a" }]}>
        {/* Hero image */}
        <View style={styles.modalHero}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111" }]} />
          )}
          <LinearGradient
            colors={["rgba(0,0,0,0.35)", "transparent", "rgba(10,10,10,0.95)"]}
            style={StyleSheet.absoluteFill}
            locations={[0, 0.4, 1]}
          />
          {/* Close button */}
          <Pressable
            hasTVPreferredFocus
            onPress={onClose}
            onFocus={() => setCloseFocused(true)}
            onBlur={() => setCloseFocused(false)}
            style={[styles.modalClose, { top: insets.top + Spacing.sm }, closeFocused && { backgroundColor: withAlpha(accent.accent, 0.3), borderColor: accent.accent }]}
          >
            <Feather name="x" size={20} color={Colors.dark.text} />
          </Pressable>

          {/* BBC badge */}
          <View style={[styles.bbcBadge, { bottom: Spacing.lg, left: Spacing.lg }]}>
            <ThemedText style={styles.bbcBadgeText}>BBC SPORT</ThemedText>
          </View>
        </View>

        {/* Article content */}
        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={[styles.modalContent, { paddingBottom: insets.bottom + Spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Time */}
          {item.publishedAt ? (
            <ThemedText style={styles.modalDate}>
              {timeAgo(item.publishedAt)}
              {item.publishedAt ? ` · ${new Date(item.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : ""}
            </ThemedText>
          ) : null}

          {/* Headline */}
          <ThemedText style={styles.modalTitle}>{item.title}</ThemedText>

          {/* Divider */}
          <View style={[styles.modalDivider, { backgroundColor: withAlpha(accent.accent, 0.35) }]} />

          {/* Summary */}
          {item.summary ? (
            <ThemedText style={styles.modalSummary}>{item.summary}</ThemedText>
          ) : null}

          {/* Read full article */}
          <Pressable
            onPress={openFull}
            onFocus={() => setReadFocused(true)}
            onBlur={() => setReadFocused(false)}
            onHoverIn={() => setReadHovered(true)}
            onHoverOut={() => setReadHovered(false)}
            style={[
              styles.readBtn,
              { backgroundColor: accent.accent, borderColor: accent.accent },
              readActive && { opacity: 0.85, shadowColor: accent.accent, shadowOpacity: 0.7, shadowRadius: 16 },
            ]}
          >
            <Feather name="external-link" size={16} color="#fff" />
            <ThemedText style={styles.readBtnText}>Read Full Article on BBC Sport</ThemedText>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────
export default function SportsNewsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const accent = useAccent();

  const [activeSport, setActiveSport] = useState<SportKey>("all");
  const [articles, setArticles] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);
  const listRef = useRef<FlatList>(null);

  const fetchNews = useCallback(async (sport: SportKey) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`/api/sports-news?sport=${sport}`, getApiUrl()).toString();
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setArticles(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError("Could not load news. Check your connection.");
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    fetchNews(activeSport);
  }, [activeSport, fetchNews]));

  const handleSportChange = (key: SportKey) => {
    setActiveSport(key);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    fetchNews(key);
  };

  // Responsive columns — TV gets 3, narrower gets 2
  const numCols = width >= 1100 ? 3 : 2;

  const renderItem = ({ item, index }: { item: NewsItem; index: number }) => (
    <ArticleCard
      item={item}
      onPress={() => setSelectedArticle(item)}
      preferFocus={index === 0}
    />
  );

  return (
    <View style={[styles.root, { paddingLeft: insets.left, paddingRight: insets.right }]}>
      <LinearGradient
        colors={["#080808", "#0d0d0d", "#080808"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Top nav */}
      <View style={[styles.topNav, { paddingTop: insets.top + Spacing.xs }]}>
        <SideMenuButton />
        <View style={styles.navCenter}>
          <MaterialCommunityIcons name="newspaper-variant-outline" size={20} color={accent.accent} />
          <ThemedText style={styles.navTitle}>Sports News</ThemedText>
        </View>
        <TVBackButton onPress={() => navigation.goBack()} />
      </View>

      {/* Body: sidebar + articles */}
      <View style={styles.body}>
        {/* Left sport sidebar */}
        <ScrollView
          style={styles.sidebar}
          contentContainerStyle={[styles.sidebarContent, { paddingBottom: insets.bottom + Spacing.lg }]}
          showsVerticalScrollIndicator={false}
        >
          <ThemedText style={styles.sidebarHeading}>CATEGORY</ThemedText>
          {SPORTS.map((s, i) => (
            <SportTab
              key={s.key}
              sport={s}
              active={activeSport === s.key}
              onPress={() => handleSportChange(s.key)}
              preferFocus={i === 0}
            />
          ))}
          {/* BBC attribution */}
          <View style={styles.attribution}>
            <Feather name="rss" size={11} color={Colors.dark.textSecondary} />
            <ThemedText style={styles.attributionText}>BBC Sport RSS</ThemedText>
          </View>
        </ScrollView>

        {/* Right article grid */}
        <View style={styles.main}>
          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="large" color={accent.accent} />
              <ThemedText style={styles.stateText}>Loading latest news…</ThemedText>
            </View>
          ) : error ? (
            <View style={styles.centerState}>
              <Feather name="wifi-off" size={36} color={Colors.dark.textSecondary} />
              <ThemedText style={styles.stateText}>{error}</ThemedText>
              <Pressable onPress={() => fetchNews(activeSport)} style={[styles.retryBtn, { borderColor: accent.accent }]}>
                <ThemedText style={[styles.retryBtnText, { color: accent.accent }]}>Try Again</ThemedText>
              </Pressable>
            </View>
          ) : articles.length === 0 ? (
            <View style={styles.centerState}>
              <MaterialCommunityIcons name="newspaper-variant-outline" size={40} color={Colors.dark.textSecondary} />
              <ThemedText style={styles.stateText}>No articles found</ThemedText>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={articles}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              numColumns={numCols}
              key={numCols}
              contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + Spacing.lg }]}
              columnWrapperStyle={numCols > 1 ? styles.gridRow : undefined}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews
            />
          )}
        </View>
      </View>

      {/* Article reader modal */}
      {selectedArticle ? (
        <ArticleModal item={selectedArticle} onClose={() => setSelectedArticle(null)} />
      ) : null}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const SIDEBAR_W = 172;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#080808" },

  // Top nav
  topNav: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
    gap: Spacing.sm,
  },
  navCenter: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm },
  navTitle: { fontSize: 16, fontWeight: "700", color: Colors.dark.text },

  // Body
  body: { flex: 1, flexDirection: "row" },

  // Sidebar
  sidebar: { width: SIDEBAR_W, borderRightWidth: 1, borderRightColor: Colors.dark.border },
  sidebarContent: { paddingTop: Spacing.sm, paddingHorizontal: Spacing.xs, gap: 2 },
  sidebarHeading: {
    fontSize: 10, fontWeight: "700", color: Colors.dark.textMuted,
    letterSpacing: 1.2, paddingHorizontal: Spacing.sm, paddingBottom: Spacing.xs, paddingTop: Spacing.xs,
  },
  sportTab: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    paddingVertical: 5, paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: "transparent",
    overflow: "hidden",
  },
  tabActiveBar: { position: "absolute", left: 0, top: 6, bottom: 6, width: 3, borderRadius: 2 },
  tabLabel: { flex: 1, fontSize: 13, fontWeight: "600", color: Colors.dark.text },
  attribution: { flexDirection: "row", alignItems: "center", gap: 4, padding: Spacing.sm, marginTop: Spacing.md },
  attributionText: { fontSize: 10, color: Colors.dark.textMuted },

  // Main grid
  main: { flex: 1 },
  grid: { padding: Spacing.sm },
  gridRow: { gap: Spacing.sm },

  // Article card
  card: {
    flex: 1, margin: Spacing.xs,
    backgroundColor: "#111",
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.dark.border,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 2 },
  },
  cardImageWrap: { width: "100%", aspectRatio: 16 / 9, overflow: "hidden" },
  cardImage: { width: "100%", height: "100%" },
  cardImagePlaceholder: { backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" },
  timeBadge: {
    position: "absolute", bottom: Spacing.xs, right: Spacing.xs,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: BorderRadius.full ?? 99,
  },
  timeBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  cardBody: { padding: Spacing.sm, gap: 4 },
  cardTitle: { fontSize: 14, fontWeight: "700", color: Colors.dark.text, lineHeight: 19 },
  cardSummary: { fontSize: 12, color: Colors.dark.textSecondary, lineHeight: 17 },
  cardFocusBar: { position: "absolute", bottom: 0, left: 0, right: 0, height: 2 },

  // Center states
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.md },
  stateText: { fontSize: 14, color: Colors.dark.textSecondary, textAlign: "center" },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1 },
  retryBtnText: { fontSize: 14, fontWeight: "600" },

  // Modal
  modalRoot: { flex: 1 },
  modalHero: { width: "100%", aspectRatio: 16 / 7 },
  modalClose: {
    position: "absolute", right: Spacing.lg,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  bbcBadge: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  bbcBadgeText: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 1.5 },
  modalScroll: { flex: 1 },
  modalContent: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, maxWidth: 800, alignSelf: "center", width: "100%" },
  modalDate: { fontSize: 12, color: Colors.dark.textMuted, marginBottom: Spacing.xs },
  modalTitle: { fontSize: 24, fontWeight: "800", color: Colors.dark.text, lineHeight: 32, marginBottom: Spacing.md },
  modalDivider: { height: 2, borderRadius: 1, marginBottom: Spacing.md },
  modalSummary: { fontSize: 16, color: Colors.dark.textSecondary, lineHeight: 26, marginBottom: Spacing.xl },
  readBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: Spacing.sm, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg, borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
  },
  readBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },

  // Back button
  backBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: "transparent",
  },
  backBtnActive: { borderColor: Colors.dark.border, backgroundColor: "rgba(255,255,255,0.06)" },
  backText: { fontSize: 14, color: Colors.dark.textSecondary },
  backTextActive: { color: Colors.dark.text },
});
