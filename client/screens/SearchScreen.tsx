import React, { useState, useMemo, useRef } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { xtreamApi, LiveStream, VodStream, Series } from "@/lib/xtream-api";
import { useData } from "@/contexts/DataContext";
import { normaliseSearch } from "@/lib/search";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type AnyStream = LiveStream | VodStream | Series;

const RESULT_LIMIT = 30;

function getThumb(item: AnyStream): string | null {
  if ("stream_icon" in item && item.stream_icon) return item.stream_icon;
  if ("cover" in item && item.cover) return item.cover;
  return null;
}

// ── Card used in both mobile (horizontal) and desktop (grid) modes ────────────
function ResultCard({
  item,
  sectionType,
  cardWidth,
  onPress,
}: {
  item: AnyStream;
  sectionType: "live" | "movies" | "series";
  cardWidth: number;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  const thumb = getThumb(item);
  const ratio = sectionType === "live" ? 0.75 : 1.5;
  const imgH = Math.round(cardWidth * ratio);
  const iconName = sectionType === "live" ? "tv" : sectionType === "movies" ? "film" : "grid";

  return (
    <Pressable
      style={[styles.resultCard, { width: cardWidth }, isActive && styles.resultCardActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <View style={[styles.resultThumb, { height: imgH }]}>
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            style={StyleSheet.absoluteFill}
            contentFit={sectionType === "live" ? "contain" : "cover"}
            transition={200}
          />
        ) : (
          <View style={styles.resultThumbPlaceholder}>
            <Feather name={iconName} size={20} color={Colors.dark.border} />
          </View>
        )}
        {isActive ? <View style={styles.resultThumbOverlay} /> : null}
      </View>
      <View style={styles.resultInfo}>
        <ThemedText style={[styles.resultName, isActive && styles.resultNameActive]} numberOfLines={2}>
          {item.name}
        </ThemedText>
      </View>
      {isActive ? <View style={styles.resultActiveBar} /> : null}
    </Pressable>
  );
}

// ── Mobile: horizontal-scrolling row per section ──────────────────────────────
function MobileSectionRow({
  title,
  icon,
  items,
  type,
  cardWidth,
  onPressItem,
}: {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  items: AnyStream[];
  type: "live" | "movies" | "series";
  cardWidth: number;
  onPressItem: (item: AnyStream) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Feather name={icon} size={14} color={Colors.dark.accent} />
        <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
        <View style={styles.sectionBadge}>
          <ThemedText style={styles.sectionBadgeText}>{items.length}</ThemedText>
        </View>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) =>
          "stream_id" in item ? String(item.stream_id) : String((item as Series).series_id)
        }
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sectionRowContent}
        renderItem={({ item }) => (
          <ResultCard item={item} sectionType={type} cardWidth={cardWidth} onPress={() => onPressItem(item)} />
        )}
      />
    </View>
  );
}

// ── Desktop: grid section (wrapping rows, scrolls vertically) ─────────────────
function DesktopSectionGrid({
  title,
  icon,
  items,
  type,
  cardWidth,
  numCols,
  gap,
  padH,
  onPressItem,
}: {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  items: AnyStream[];
  type: "live" | "movies" | "series";
  cardWidth: number;
  numCols: number;
  gap: number;
  padH: number;
  onPressItem: (item: AnyStream) => void;
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={[styles.sectionHeader, { paddingHorizontal: padH }]}>
        <Feather name={icon} size={14} color={Colors.dark.accent} />
        <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
        <View style={styles.sectionBadge}>
          <ThemedText style={styles.sectionBadgeText}>{items.length}</ThemedText>
        </View>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) =>
          "stream_id" in item ? String(item.stream_id) : String((item as Series).series_id)
        }
        numColumns={numCols}
        key={`grid-${type}-${numCols}`}
        scrollEnabled={false}
        contentContainerStyle={{ paddingHorizontal: padH, gap }}
        columnWrapperStyle={numCols > 1 ? { gap } : undefined}
        renderItem={({ item }) => (
          <ResultCard item={item} sectionType={type} cardWidth={cardWidth} onPress={() => onPressItem(item)} />
        )}
      />
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { liveStreams, vodStreams, seriesList } = useData();
  const { width, height } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [backFocused, setBackFocused] = useState(false);
  const [backPressed, setBackPressed] = useState(false);
  const backActive = backFocused || backPressed;

  const padH = Math.max(insets.left + Spacing.xs, Spacing.md);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.md);

  // Desktop = landscape or wide screen
  const isDesktop = width > height || width >= 600;

  // Column counts and card widths
  const gap = Spacing.sm;

  // Mobile: horizontal scroll — card width based on ~4 visible cards
  const mobileCardW = Math.floor((width - padH * 2) / 4.5);

  // Desktop: grid — show same density as ContentListScreen
  const desktopMovieCols = Math.max(4, Math.floor(width / 130));
  const desktopLiveCols = Math.max(4, Math.floor(width / 150));
  const desktopMovieCardW = Math.floor((width - padH * 2 - gap * (desktopMovieCols - 1)) / desktopMovieCols);
  const desktopLiveCardW = Math.floor((width - padH * 2 - gap * (desktopLiveCols - 1)) / desktopLiveCols);

  const trimmed = normaliseSearch(submittedQuery);

  // Pre-normalise once per stream list — avoids re-running NFD/regex on
  // thousands of titles for every keystroke.
  const normLive = useMemo(
    () => liveStreams.map((s) => ({ s, n: normaliseSearch(s.name) })),
    [liveStreams],
  );
  const normMovies = useMemo(
    () => vodStreams.map((s) => ({ s, n: normaliseSearch(s.name) })),
    [vodStreams],
  );
  const normSeries = useMemo(
    () => seriesList.map((s) => ({ s, n: normaliseSearch(s.name) })),
    [seriesList],
  );

  const results = useMemo(() => {
    if (!trimmed) return { live: [], movies: [], series: [] };
    const pick = <T,>(arr: { s: T; n: string }[]) => {
      const out: T[] = [];
      for (const { s, n } of arr) {
        if (n.includes(trimmed)) {
          out.push(s);
          if (out.length >= RESULT_LIMIT) break;
        }
      }
      return out;
    };
    return {
      live: pick(normLive),
      movies: pick(normMovies),
      series: pick(normSeries),
    };
  }, [trimmed, normLive, normMovies, normSeries]);

  const hasResults = results.live.length + results.movies.length + results.series.length > 0;

  const handlePress = (item: AnyStream, type: "live" | "movies" | "series") => {
    if (type === "live") {
      const s = item as LiveStream;
      navigation.navigate("LivePreview", { streamId: s.stream_id, name: s.name, streamUrl: xtreamApi.getLiveStreamUrl(s.stream_id), thumbnail: s.stream_icon ?? undefined, streamIcon: s.stream_icon ?? undefined, initialFullscreen: true });
    } else if (type === "movies") {
      const s = item as VodStream;
      navigation.navigate("MovieInfo", {
        streamId: s.stream_id,
        name: s.name,
        streamIcon: s.stream_icon ?? undefined,
        containerExtension: s.container_extension,
        categoryId: s.category_id,
      });
    } else {
      const s = item as Series;
      navigation.navigate("SeriesDetail", { seriesId: s.series_id, seriesName: s.name, cover: s.cover });
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <Pressable
          style={[styles.backBtn, backActive && styles.backBtnActive]}
          onPress={() => navigation.goBack()}
          onFocus={() => setBackFocused(true)}
          onBlur={() => setBackFocused(false)}
          onPressIn={() => setBackPressed(true)}
          onPressOut={() => setBackPressed(false)}
        >
          {backActive ? <View style={StyleSheet.absoluteFill as any} /> : null}
          <Feather name="arrow-left" size={20} color={backActive ? Colors.dark.accent : Colors.dark.text} />
        </Pressable>
        <View style={[styles.searchInputWrap, (trimmed.length > 0) && styles.searchInputWrapActive]}>
          <Feather name="search" size={16} color={trimmed ? Colors.dark.accent : Colors.dark.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Type then press Enter to search..."
            placeholderTextColor={Colors.dark.textSecondary}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            submitBehavior="blurAndSubmit"
            onSubmitEditing={() => setSubmittedQuery(query)}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => { setQuery(""); setSubmittedQuery(""); }} hitSlop={8}>
              <Feather name="x-circle" size={16} color={Colors.dark.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      {/* Empty state */}
      {!trimmed ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconRing}>
            <Feather name="search" size={32} color={Colors.dark.accent} />
          </View>
          <ThemedText style={styles.emptyTitle}>Search All Content</ThemedText>
          <ThemedText style={styles.emptySubtitle}>
            Find channels, movies and series across your entire library
          </ThemedText>
        </View>
      ) : !hasResults ? (
        <View style={styles.emptyState}>
          <Feather name="inbox" size={44} color={Colors.dark.border} />
          <ThemedText style={styles.emptyTitle}>No Results</ThemedText>
          <ThemedText style={styles.emptySubtitle}>Nothing matched "{query}"</ThemedText>
        </View>
      ) : isDesktop ? (
        // ── Desktop: vertical-scrolling grid ────────────────────────────────
        <ScrollView
          style={styles.results}
          contentContainerStyle={[styles.resultsContent, { paddingBottom: padB }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <DesktopSectionGrid
            title="Live TV" icon="tv"
            items={results.live} type="live"
            cardWidth={desktopLiveCardW} numCols={desktopLiveCols}
            gap={gap} padH={padH}
            onPressItem={(item) => handlePress(item, "live")}
          />
          <DesktopSectionGrid
            title="Movies" icon="film"
            items={results.movies} type="movies"
            cardWidth={desktopMovieCardW} numCols={desktopMovieCols}
            gap={gap} padH={padH}
            onPressItem={(item) => handlePress(item, "movies")}
          />
          <DesktopSectionGrid
            title="Series" icon="grid"
            items={results.series} type="series"
            cardWidth={desktopMovieCardW} numCols={desktopMovieCols}
            gap={gap} padH={padH}
            onPressItem={(item) => handlePress(item, "series")}
          />
        </ScrollView>
      ) : (
        // ── Mobile: horizontal-scrolling rows ───────────────────────────────
        <ScrollView
          style={styles.results}
          contentContainerStyle={[styles.resultsContent, { paddingBottom: padB }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <MobileSectionRow
            title="Live TV" icon="tv"
            items={results.live} type="live"
            cardWidth={mobileCardW}
            onPressItem={(item) => handlePress(item, "live")}
          />
          <MobileSectionRow
            title="Movies" icon="film"
            items={results.movies} type="movies"
            cardWidth={mobileCardW}
            onPressItem={(item) => handlePress(item, "movies")}
          />
          <MobileSectionRow
            title="Series" icon="grid"
            items={results.series} type="series"
            cardWidth={mobileCardW}
            onPressItem={(item) => handlePress(item, "series")}
          />
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  backBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },

  searchInputWrap: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1.5, borderColor: Colors.dark.border,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md, height: 42,
  },
  searchInputWrapActive: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 4,
  },
  searchInput: {
    flex: 1, color: Colors.dark.text, fontSize: 14,
    height: 42, padding: 0,
  },

  divider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.md },

  emptyState: {
    flex: 1, justifyContent: "center", alignItems: "center",
    gap: Spacing.md, paddingHorizontal: Spacing["3xl"],
  },
  emptyIconRing: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.dark.accentDim,
    borderWidth: 1.5, borderColor: Colors.dark.accent,
    justifyContent: "center", alignItems: "center",
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: Colors.dark.text },
  emptySubtitle: {
    color: Colors.dark.textSecondary, fontSize: 13,
    textAlign: "center", lineHeight: 18,
  },

  results: { flex: 1 },
  resultsContent: { gap: Spacing.xl },

  section: { gap: Spacing.sm },
  sectionHeader: {
    flexDirection: "row", alignItems: "center",
    gap: Spacing.sm, paddingHorizontal: Spacing.md,
  },
  sectionTitle: { flex: 1, fontSize: 14, fontWeight: "700", color: Colors.dark.text },
  sectionBadge: {
    backgroundColor: Colors.dark.accentDim,
    borderWidth: 1, borderColor: "rgba(255,102,0,0.3)",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
  },
  sectionBadgeText: { color: Colors.dark.accent, fontSize: 11, fontWeight: "700" },
  sectionRowContent: { paddingHorizontal: Spacing.md, gap: Spacing.sm },

  resultCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm, overflow: "hidden",
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  resultCardActive: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 12, elevation: 8,
  },
  resultThumb: {
    backgroundColor: Colors.dark.backgroundSecondary,
    overflow: "hidden",
  },
  resultThumbPlaceholder: {
    flex: 1, justifyContent: "center", alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  resultThumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,102,0,0.08)",
  },
  resultInfo: { padding: Spacing.xs },
  resultName: {
    color: Colors.dark.textSecondary, fontSize: 10,
    fontWeight: "500", lineHeight: 13,
  },
  resultNameActive: { color: Colors.dark.text },
  resultActiveBar: {
    height: 2, backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 4,
  },
});
