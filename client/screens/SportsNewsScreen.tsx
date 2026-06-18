import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View, StyleSheet, Pressable, FlatList, ScrollView,
  ActivityIndicator, useWindowDimensions, BackHandler, Animated,
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
  { key: "all",       label: "All Sports", mciIcon: "newspaper-variant-outline" },
  { key: "football",  label: "Football",   mciIcon: "soccer"                   },
  { key: "f1",        label: "Formula 1",  mciIcon: "car-sports"               },
  { key: "cricket",   label: "Cricket",    mciIcon: "cricket"                  },
  { key: "tennis",    label: "Tennis",     mciIcon: "tennis"                   },
  { key: "rugby",     label: "Rugby",      mciIcon: "rugby"                    },
  { key: "boxing",    label: "Boxing",     mciIcon: "boxing-glove"             },
  { key: "golf",      label: "Golf",       mciIcon: "golf"                     },
  { key: "athletics", label: "Athletics",  mciIcon: "run"                      },
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

// ── TV back button ────────────────────────────────────────────────────────
function TVBackButton({ onPress }: { onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const active = focused || hovered;
  return (
    <Pressable
      onPress={onPress}
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
      <MaterialCommunityIcons name={sport.mciIcon as any} size={14} color={tint} />
      <ThemedText style={[styles.tabLabel, highlight && { color: accent.accent }]} numberOfLines={1}>
        {sport.label}
      </ThemedText>
    </Pressable>
  );
}

// ── Article tile ──────────────────────────────────────────────────────────
function ArticleTile({
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
      style={[
        styles.tile,
        highlight && {
          borderColor: withAlpha(accent.accent, 0.55),
          shadowColor: accent.accent, shadowOpacity: 0.2, shadowRadius: 8,
        },
      ]}
    >
      <View style={styles.tileImageWrap}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.tilePlaceholder]}>
            <MaterialCommunityIcons name="newspaper-variant-outline" size={28} color={Colors.dark.textSecondary} />
          </View>
        )}
        <LinearGradient
          colors={["transparent", "rgba(8,8,8,0.9)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0.45 }}
          end={{ x: 0, y: 1 }}
        />
        {ago ? (
          <View style={[styles.timeBadge, { backgroundColor: withAlpha(accent.accent, 0.9) }]}>
            <ThemedText style={styles.timeBadgeText}>{ago}</ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.tileBody}>
        <ThemedText style={styles.tileTitle} numberOfLines={3}>{item.title}</ThemedText>
        {item.summary ? (
          <ThemedText style={styles.tileSummary} numberOfLines={2}>{item.summary}</ThemedText>
        ) : null}
      </View>
      {highlight ? <View style={[styles.tileFocusBar, { backgroundColor: accent.accent }]} /> : null}
    </Pressable>
  );
}

// ── Inline article detail (replaces grid when article selected) ───────────
function ArticleDetail({
  item, onClose,
}: {
  item: NewsItem;
  onClose: () => void;
}) {
  const accent = useAccent();
  const { width } = useWindowDimensions();
  const [readFocused, setReadFocused] = useState(false);
  const [readHovered, setReadHovered] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const mainW = width - SIDEBAR_W;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, []);

  // TV hardware back button
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  const openFull = useCallback(async () => {
    if (!item.link) return;
    try {
      await WebBrowser.openBrowserAsync(item.link, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch {}
  }, [item.link]);

  const readActive = readFocused || readHovered;
  const ago = timeAgo(item.publishedAt);

  // Image panel: 42% of main area (not full screen width)
  const imageW = Math.floor(mainW * 0.42);

  return (
    <Animated.View style={[styles.detail, { opacity: fadeAnim }]}>
      {/* Back row */}
      <View style={styles.detailTopBar}>
        <Pressable
          hasTVPreferredFocus
          onPress={onClose}
          onFocus={() => {}}
          style={styles.detailBackBtn}
        >
          <Feather name="chevron-left" size={18} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.detailBackText}>Back to News</ThemedText>
        </Pressable>
        <View style={styles.bbcPill}>
          <ThemedText style={styles.bbcPillText}>BBC SPORT</ThemedText>
        </View>
      </View>

      {/* Content row: image + text */}
      <View style={styles.detailBody}>
        {/* Left: image */}
        <View style={[styles.detailImageWrap, { width: imageW }]}>
          {item.imageUrl ? (
            <Image
              source={{ uri: item.imageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }]}>
              <MaterialCommunityIcons name="newspaper-variant-outline" size={48} color={Colors.dark.textSecondary} />
            </View>
          )}
          <LinearGradient
            colors={["transparent", "rgba(10,10,10,0.7)"]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.5, y: 0.5 }}
            end={{ x: 0.5, y: 1 }}
          />
        </View>

        {/* Right: text content */}
        <ScrollView
          style={styles.detailText}
          contentContainerStyle={styles.detailTextContent}
          showsVerticalScrollIndicator={false}
        >
          {ago ? (
            <ThemedText style={styles.detailDate}>{ago}</ThemedText>
          ) : null}

          <ThemedText style={styles.detailTitle}>{item.title}</ThemedText>

          <View style={[styles.detailDivider, { backgroundColor: withAlpha(accent.accent, 0.4) }]} />

          {item.summary ? (
            <ThemedText style={styles.detailSummary}>{item.summary}</ThemedText>
          ) : null}

          <Pressable
            onPress={openFull}
            onFocus={() => setReadFocused(true)}
            onBlur={() => setReadFocused(false)}
            onHoverIn={() => setReadHovered(true)}
            onHoverOut={() => setReadHovered(false)}
            style={[
              styles.readBtn,
              { backgroundColor: accent.accent },
              readActive && { opacity: 0.85, shadowColor: accent.accent, shadowOpacity: 0.6, shadowRadius: 14 },
            ]}
          >
            <Feather name="external-link" size={15} color="#fff" />
            <ThemedText style={styles.readBtnText}>Read Full Article on BBC Sport</ThemedText>
          </Pressable>
        </ScrollView>
      </View>
    </Animated.View>
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

  // Animate grid ↔ detail
  const gridOpacity = useRef(new Animated.Value(1)).current;

  const showDetail = useCallback((item: NewsItem) => {
    Animated.timing(gridOpacity, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setSelectedArticle(item);
    });
  }, [gridOpacity]);

  const hideDetail = useCallback(() => {
    setSelectedArticle(null);
    Animated.timing(gridOpacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
  }, [gridOpacity]);

  const fetchNews = useCallback(async (sport: SportKey) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`/api/sports-news?sport=${sport}`, getApiUrl()).toString();
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setArticles(Array.isArray(data) ? data : []);
    } catch {
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
    setSelectedArticle(null);
    gridOpacity.setValue(1);
    setActiveSport(key);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    fetchNews(key);
  };

  const numCols = width >= 1100 ? 3 : 2;

  const renderItem = ({ item, index }: { item: NewsItem; index: number }) => (
    <ArticleTile
      item={item}
      onPress={() => showDetail(item)}
      preferFocus={index === 0}
    />
  );

  return (
    <View style={[styles.root, { paddingLeft: insets.left, paddingRight: insets.right }]}>
      <LinearGradient colors={["#080808", "#0d0d0d", "#080808"]} style={StyleSheet.absoluteFill} />

      {/* Top nav */}
      <View style={[styles.topNav, { paddingTop: insets.top + Spacing.xs }]}>
        <SideMenuButton />
        <View style={styles.navCenter}>
          <MaterialCommunityIcons name="newspaper-variant-outline" size={18} color={accent.accent} />
          <ThemedText style={styles.navTitle}>Sports News</ThemedText>
        </View>
        <TVBackButton onPress={() => navigation.goBack()} />
      </View>

      {/* Body */}
      <View style={styles.body}>
        {/* Left sport sidebar — outer View constrains width (ScrollView alone doesn't on RN Web) */}
        <View style={styles.sidebar}>
          <ScrollView
            contentContainerStyle={[styles.sidebarContent, { paddingBottom: insets.bottom + Spacing.lg }]}
            showsVerticalScrollIndicator={false}
          >
            <ThemedText style={styles.sidebarHeading}>SPORT</ThemedText>
            {SPORTS.map((s, i) => (
              <SportTab
                key={s.key}
                sport={s}
                active={activeSport === s.key}
                onPress={() => handleSportChange(s.key)}
                preferFocus={i === 0}
              />
            ))}
            <View style={styles.attribution}>
              <Feather name="rss" size={10} color={Colors.dark.textSecondary} />
              <ThemedText style={styles.attributionText}>BBC Sport</ThemedText>
            </View>
          </ScrollView>
        </View>

        {/* Right: grid or detail */}
        <View style={styles.main}>
          {selectedArticle ? (
            <ArticleDetail item={selectedArticle} onClose={hideDetail} />
          ) : (
            <Animated.View style={[styles.gridWrap, { opacity: gridOpacity }]}>
              {loading ? (
                <View style={styles.centerState}>
                  <ActivityIndicator size="large" color={accent.accent} />
                  <ThemedText style={styles.stateText}>Loading latest news…</ThemedText>
                </View>
              ) : error ? (
                <View style={styles.centerState}>
                  <Feather name="wifi-off" size={32} color={Colors.dark.textSecondary} />
                  <ThemedText style={styles.stateText}>{error}</ThemedText>
                  <Pressable onPress={() => fetchNews(activeSport)} style={[styles.retryBtn, { borderColor: accent.accent }]}>
                    <ThemedText style={[styles.retryBtnText, { color: accent.accent }]}>Try Again</ThemedText>
                  </Pressable>
                </View>
              ) : articles.length === 0 ? (
                <View style={styles.centerState}>
                  <MaterialCommunityIcons name="newspaper-variant-outline" size={38} color={Colors.dark.textSecondary} />
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
            </Animated.View>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const SIDEBAR_W = 110;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#080808" },

  // Top nav
  topNav: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border, gap: Spacing.sm,
  },
  navCenter: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm },
  navTitle: { fontSize: 15, fontWeight: "700", color: Colors.dark.text },

  // Back button
  backBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: "transparent",
  },
  backBtnActive: { borderColor: Colors.dark.border, backgroundColor: "rgba(255,255,255,0.06)" },
  backText: { fontSize: 13, color: Colors.dark.textSecondary },
  backTextActive: { color: Colors.dark.text },

  // Body
  body: { flex: 1, flexDirection: "row" },

  // Sidebar — fixed width, same pattern as ContentListScreen
  sidebar: { width: SIDEBAR_W, borderRightWidth: 1, borderRightColor: Colors.dark.border },
  sidebarContent: { paddingTop: Spacing.xs, paddingHorizontal: 4, gap: 1 },
  sidebarHeading: {
    fontSize: 9, fontWeight: "700", color: Colors.dark.textSecondary,
    letterSpacing: 1.1, paddingHorizontal: Spacing.sm, paddingBottom: 4, paddingTop: 6,
  },
  sportTab: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 5, paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: "transparent", overflow: "hidden",
  },
  tabActiveBar: { position: "absolute", left: 0, top: 5, bottom: 5, width: 3, borderRadius: 2 },
  tabLabel: { flex: 1, fontSize: 12, fontWeight: "600", color: Colors.dark.text },
  attribution: { flexDirection: "row", alignItems: "center", gap: 4, padding: Spacing.sm, marginTop: Spacing.sm },
  attributionText: { fontSize: 10, color: Colors.dark.textSecondary },

  // Main area
  main: { flex: 1 },
  gridWrap: { flex: 1 },

  // Article grid
  grid: { padding: Spacing.sm },
  gridRow: { gap: Spacing.sm },

  // Article tile
  tile: {
    flex: 1, margin: Spacing.xs,
    backgroundColor: "#111",
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.dark.border,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 2 },
  },
  tileImageWrap: { width: "100%", aspectRatio: 16 / 9, overflow: "hidden" },
  tilePlaceholder: { backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" },
  timeBadge: {
    position: "absolute", bottom: Spacing.xs, right: Spacing.xs,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99,
  },
  timeBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  tileBody: { padding: Spacing.sm, gap: 4 },
  tileTitle: { fontSize: 13, fontWeight: "700", color: Colors.dark.text, lineHeight: 18 },
  tileSummary: { fontSize: 11, color: Colors.dark.textSecondary, lineHeight: 16 },
  tileFocusBar: { position: "absolute", bottom: 0, left: 0, right: 0, height: 2 },

  // Center states
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.md },
  stateText: { fontSize: 14, color: Colors.dark.textSecondary, textAlign: "center" },
  retryBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1 },
  retryBtnText: { fontSize: 14, fontWeight: "600" },

  // Inline article detail
  detail: { flex: 1, flexDirection: "column" },
  detailTopBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
  },
  detailBackBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: BorderRadius.md,
  },
  detailBackText: { fontSize: 13, color: Colors.dark.textSecondary },
  bbcPill: {
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: "#bb1919", borderRadius: 4,
  },
  bbcPillText: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 1.4 },

  detailBody: { flex: 1, flexDirection: "row" },

  detailImageWrap: {
    alignSelf: "stretch",
    backgroundColor: "#111",
    overflow: "hidden",
  },

  detailText: { flex: 1 },
  detailTextContent: {
    padding: Spacing.lg, gap: Spacing.sm,
    maxWidth: 640,
  },
  detailDate: { fontSize: 12, color: Colors.dark.textSecondary },
  detailTitle: { fontSize: 22, fontWeight: "800", color: Colors.dark.text, lineHeight: 30 },
  detailDivider: { height: 2, borderRadius: 1, marginVertical: Spacing.xs },
  detailSummary: { fontSize: 15, color: Colors.dark.textSecondary, lineHeight: 24 },

  readBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: Spacing.sm, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg, marginTop: Spacing.md,
    shadowOffset: { width: 0, height: 3 },
  },
  readBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
