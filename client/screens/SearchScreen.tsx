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
import { LinearGradient } from "expo-linear-gradient";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type AnyStream = LiveStream | VodStream | Series;

const RESULT_LIMIT = 30;

function getThumb(item: AnyStream): string | null {
  if ("stream_icon" in item && item.stream_icon) return item.stream_icon;
  if ("cover" in item && item.cover) return item.cover;
  return null;
}

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

function SectionRow({
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
        contentContainerStyle={styles.sectionRow}
        renderItem={({ item }) => (
          <ResultCard
            item={item}
            sectionType={type}
            cardWidth={cardWidth}
            onPress={() => onPressItem(item)}
          />
        )}
      />
    </View>
  );
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { liveStreams, vodStreams, seriesList } = useData();
  const { width, height } = useWindowDimensions();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");

  const padH = Math.max(insets.left + Spacing.xs, Spacing.md);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.md);

  const isLandscape = width > height;
  const cardW = isLandscape
    ? Math.floor((width - padH * 2) / 8)
    : Math.floor((width - padH * 2) / 4);

  const trimmed = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!trimmed) return { live: [], movies: [], series: [] };
    return {
      live: liveStreams.filter((s) => s.name.toLowerCase().includes(trimmed)).slice(0, RESULT_LIMIT),
      movies: vodStreams.filter((s) => s.name.toLowerCase().includes(trimmed)).slice(0, RESULT_LIMIT),
      series: seriesList.filter((s) => s.name.toLowerCase().includes(trimmed)).slice(0, RESULT_LIMIT),
    };
  }, [trimmed, liveStreams, vodStreams, seriesList]);

  const hasResults = results.live.length + results.movies.length + results.series.length > 0;

  const handlePress = (item: AnyStream, type: "live" | "movies" | "series") => {
    if (type === "live") {
      const s = item as LiveStream;
      navigation.navigate("Player", { streamUrl: xtreamApi.getLiveStreamUrl(s.stream_id), title: s.name, type: "live" });
    } else if (type === "movies") {
      const s = item as VodStream;
      navigation.navigate("Player", { streamUrl: xtreamApi.getVodStreamUrl(s.stream_id, s.container_extension), title: s.name, type: "vod" });
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
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnActive]}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={20} color={Colors.dark.text} />
        </Pressable>

        <View style={styles.searchInputWrap}>
          <Feather name="search" size={16} color={query ? Colors.dark.accent : Colors.dark.textSecondary} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search channels, movies, series..."
            placeholderTextColor={Colors.dark.textSecondary}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Feather name="x-circle" size={16} color={Colors.dark.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      {/* Results */}
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
      ) : (
        <ScrollView
          style={styles.results}
          contentContainerStyle={[styles.resultsContent, { paddingBottom: padB }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <SectionRow
            title="Live TV"
            icon="tv"
            items={results.live}
            type="live"
            cardWidth={cardW}
            onPressItem={(item) => handlePress(item, "live")}
          />
          <SectionRow
            title="Movies"
            icon="film"
            items={results.movies}
            type="movies"
            cardWidth={cardW}
            onPressItem={(item) => handlePress(item, "movies")}
          />
          <SectionRow
            title="Series"
            icon="grid"
            items={results.series}
            type="series"
            cardWidth={cardW}
            onPressItem={(item) => handlePress(item, "series")}
          />
        </ScrollView>
      )}
    </ThemedView>
  );
}

const CARD_GAP = Spacing.sm;

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
  sectionRow: { paddingHorizontal: Spacing.md, gap: CARD_GAP },

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
