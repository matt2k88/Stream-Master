import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  TextInput,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Category, xtreamApi, LiveStream, VodStream, Series } from "@/lib/xtream-api";
import { useData } from "@/contexts/DataContext";
import { useFavourites } from "@/contexts/FavouritesContext";
import { useWatchHistory } from "@/contexts/WatchHistoryContext";
import { useCategoryOrder } from "@/contexts/CategoryOrderContext";
import { useUISettings } from "@/contexts/UISettingsContext";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type CategoryRouteProp = RouteProp<RootStackParamList, "Category">;
type AnyStream = LiveStream | VodStream | Series;

const SEARCH_LIMIT = 100;

function RefreshBtn({ onPress, refreshing }: { onPress: () => void; refreshing: boolean }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isActive = focused || pressed || hovered;
  return (
    <Pressable
      style={[styles.backBtn, (isActive || refreshing) && styles.backBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      disabled={refreshing}
    >
      {(isActive || refreshing) ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.18)", "rgba(255,102,0,0.06)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}
      <Feather name="refresh-cw" size={18} color={(isActive || refreshing) ? Colors.dark.accent : Colors.dark.text} />
    </Pressable>
  );
}

function RequestsBtn({ onPress }: { onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isActive = focused || pressed || hovered;
  return (
    <Pressable
      style={[styles.backBtn, isActive && styles.backBtnActive, { flexDirection: "row", paddingHorizontal: Spacing.sm, gap: 6, width: undefined }]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      {isActive ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.18)", "rgba(255,102,0,0.06)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}
      <Feather name="inbox" size={16} color={isActive ? Colors.dark.accent : Colors.dark.text} />
      <ThemedText style={{ color: isActive ? Colors.dark.accent : Colors.dark.text, fontWeight: "700", fontSize: 12 }}>
        Requests
      </ThemedText>
    </Pressable>
  );
}

function BackBtn({ onPress }: { onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isActive = focused || pressed || hovered;
  return (
    <Pressable
      style={[styles.backBtn, isActive && styles.backBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      {isActive ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.18)", "rgba(255,102,0,0.06)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}
      <Feather name="arrow-left" size={20} color={isActive ? Colors.dark.accent : Colors.dark.text} />
    </Pressable>
  );
}

function PillButton({
  icon,
  label,
  count,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  count: number;
  onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const isActive = pressed || focused;

  return (
    <Pressable
      style={[styles.pillButton, isActive && styles.pillButtonActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {isActive ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.18)", "rgba(255,102,0,0.06)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      ) : null}
      <View style={styles.pillLeft}>
        <View style={[styles.pillIconWrap, isActive && styles.pillIconWrapActive]}>
          <Feather name={icon} size={16} color={Colors.dark.accent} />
        </View>
        <ThemedText style={[styles.pillTitle, isActive && styles.pillTitleActive]} numberOfLines={1}>
          {label}
        </ThemedText>
      </View>
      <View style={styles.pillRight}>
        {count > 0 ? (
          <View style={styles.pillCountBadge}>
            <ThemedText style={styles.pillCountText}>{count}</ThemedText>
          </View>
        ) : null}
        <Feather name="chevron-right" size={16} color={isActive ? "#FFD700" : Colors.dark.accent} />
      </View>
      {isActive ? <View style={styles.pillBottomBar} /> : null}
    </Pressable>
  );
}

function FavRecentRow({
  type,
  favCount,
  recentCount,
  onPressFav,
  onPressRecent,
}: {
  type: "live" | "movies" | "series";
  favCount: number;
  recentCount: number;
  onPressFav: () => void;
  onPressRecent: () => void;
}) {
  return (
    <View style={styles.favRecentRow}>
      <View style={styles.favRecentCell}>
        <PillButton icon="clock" label="Recently Watched" count={recentCount} onPress={onPressRecent} />
      </View>
      <View style={styles.favRecentCell}>
        <PillButton icon="star" label="Favourites" count={favCount} onPress={onPressFav} />
      </View>
    </View>
  );
}

function CategoryCard({
  item,
  icon,
  onPress,
  width: cardWidth,
  height: cardHeight,
}: {
  item: Category;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  width: number;
  height: number;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  const { scaleFont } = useUISettings();

  return (
    <Pressable
      style={[styles.card, { width: cardWidth, height: cardHeight }, isActive && styles.cardActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {isActive ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.14)", "rgba(255,102,0,0.04)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}
      <Feather name={icon} size={20} color={isActive ? Colors.dark.accent : Colors.dark.textSecondary} />
      <ThemedText
        style={[styles.cardText, { fontSize: scaleFont(13) }, isActive && styles.cardTextActive]}
        numberOfLines={2}
      >
        {item.category_name}
      </ThemedText>
      {isActive ? <View style={styles.cardGlow} /> : null}
    </Pressable>
  );
}

function StreamCard({
  item,
  type,
  cardWidth,
  onPress,
}: {
  item: AnyStream;
  type: "live" | "movies" | "series";
  cardWidth: number;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  const { scaleFont } = useUISettings();

  const thumb = "stream_icon" in item ? item.stream_icon : "cover" in item ? item.cover : null;
  const iconName = type === "live" ? "tv" : type === "movies" ? "film" : "grid";
  const ratio = type === "live" ? 0.75 : 1.5;
  const imgH = Math.round(cardWidth * ratio);

  return (
    <Pressable
      style={[styles.streamCard, { width: cardWidth }, isActive && styles.streamCardActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <View style={[styles.streamThumb, { height: imgH }]}>
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            style={StyleSheet.absoluteFill}
            contentFit={type === "live" ? "contain" : "cover"}
            transition={200}
          />
        ) : (
          <View style={styles.streamPlaceholder}>
            <Feather name={iconName} size={22} color={Colors.dark.border} />
          </View>
        )}
        {isActive ? <View style={styles.streamOverlay} /> : null}
      </View>
      <View style={styles.streamInfo}>
        <ThemedText
          style={[styles.streamName, { fontSize: scaleFont(11) }, isActive && styles.streamNameActive]}
          numberOfLines={2}
        >
          {item.name}
        </ThemedText>
      </View>
      {isActive ? <View style={styles.streamActiveBar} /> : null}
    </Pressable>
  );
}

export default function CategoryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<CategoryRouteProp>();
  const { type, title } = route.params;
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const { liveCategories, vodCategories, seriesCategories, liveStreams, vodStreams, seriesList, isSyncing, refresh } = useData();
  const handleRefresh = useCallback(() => {
    if (isSyncing) return;
    refresh();
  }, [refresh, isSyncing]);
  const { applyOrder } = useCategoryOrder();
  const { getFavouritesByType } = useFavourites();
  const { entries: watchEntries } = useWatchHistory();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");

  const padH = Math.max(insets.left + Spacing.xs, Spacing.md);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.sm);
  const gap = Spacing.sm;

  // Category grid sizing
  const numCatCols = isLandscape ? 2 : Math.max(2, Math.floor(width / 170));
  const catCardWidth = Math.floor((width - padH * 2 - gap * (numCatCols - 1)) / numCatCols);
  const catCardHeight = Math.max(72, Math.min(catCardWidth * 0.42, 100));

  // Search results grid sizing
  const numSearchCols = type === "live"
    ? Math.max(3, Math.floor(width / 150))
    : Math.max(3, Math.floor(width / 130));
  const searchCardWidth = Math.floor((width - padH * 2 - gap * (numSearchCols - 1)) / numSearchCols);

  const rawCategories: Category[] =
    type === "live" ? liveCategories :
    type === "movies" ? vodCategories :
    seriesCategories;
  const categories: Category[] = useMemo(
    () => applyOrder(type, rawCategories),
    [applyOrder, type, rawCategories],
  );

  const getIcon = (): keyof typeof Feather.glyphMap => {
    switch (type) {
      case "live": return "tv";
      case "movies": return "film";
      case "series": return "grid";
      default: return "folder";
    }
  };

  const favCount = getFavouritesByType(type).length;
  const recentCount = useMemo(() => {
    if (type === "live") {
      const seen = new Set<string>();
      for (const e of watchEntries) {
        if (e.content_type === "live" && e.stream_id) seen.add(String(e.stream_id));
      }
      return seen.size;
    }
    const wantType = type === "movies" ? "movie" : "series";
    if (wantType === "movie") {
      const seen = new Set<string>();
      for (const e of watchEntries) {
        if (e.content_type === "movie" && e.stream_id) seen.add(String(e.stream_id));
      }
      return seen.size;
    }
    const seen = new Set<string>();
    for (const e of watchEntries) {
      if (e.content_type === "series" && e.series_id) seen.add(String(e.series_id));
    }
    return seen.size;
  }, [type, watchEntries]);
  const trimmedQuery = submittedQuery.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  const allStreams: AnyStream[] = useMemo(() => {
    switch (type) {
      case "live": return liveStreams;
      case "movies": return vodStreams;
      case "series": return seriesList;
      default: return [];
    }
  }, [type, liveStreams, vodStreams, seriesList]);

  const searchResults: AnyStream[] = useMemo(() => {
    if (!trimmedQuery) return [];
    return allStreams
      .filter((s) => s.name.toLowerCase().includes(trimmedQuery))
      .slice(0, SEARCH_LIMIT);
  }, [trimmedQuery, allStreams]);

  const handleStreamPress = (item: AnyStream) => {
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

  const getStreamKey = (item: AnyStream) => {
    if ("stream_id" in item) return String((item as LiveStream | VodStream).stream_id);
    return String((item as Series).series_id);
  };

  const placeholder =
    type === "live" ? "Search live channels..." :
    type === "movies" ? "Search movies..." :
    "Search series...";

  const ListHeader = (
    <View style={styles.listHeader}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <Feather
          name="search"
          size={15}
          color={isSearching ? Colors.dark.accent : Colors.dark.textSecondary}
        />
        <TextInput
          style={styles.searchInput}
          placeholder={placeholder}
          placeholderTextColor={Colors.dark.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          blurOnSubmit={false}
          onSubmitEditing={() => setSubmittedQuery(query)}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => { setQuery(""); setSubmittedQuery(""); }} hitSlop={8}>
            <Feather name="x-circle" size={15} color={Colors.dark.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {/* Favourites + Recently row — hidden while searching */}
      {!isSearching ? (
        <FavRecentRow
          type={type}
          favCount={favCount}
          recentCount={recentCount}
          onPressFav={() =>
            navigation.navigate("ContentList", {
              type,
              categoryId: "favourites",
              categoryName: "Favourites",
            })
          }
          onPressRecent={() =>
            navigation.navigate("ContentList", {
              type,
              categoryId: "recently",
              categoryName: "Recently Watched",
            })
          }
        />
      ) : (
        // Results count when searching
        <View style={styles.searchResultsHeader}>
          <Feather name={getIcon()} size={13} color={Colors.dark.accent} />
          <ThemedText style={styles.searchResultsText}>
            {searchResults.length === 0
              ? `No results for "${submittedQuery}"`
              : `${searchResults.length} results`}
          </ThemedText>
          {searchResults.length === SEARCH_LIMIT ? (
            <ThemedText style={styles.searchResultsLimit}>
              (showing first {SEARCH_LIMIT})
            </ThemedText>
          ) : null}
        </View>
      )}
    </View>
  );

  const showRecentlyAdded = !isSearching && (type === "movies" || type === "series");

  if (isSyncing && categories.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={styles.loadingText}>Loading...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <BackBtn onPress={() => navigation.goBack()} />
        <ThemedText style={styles.headerTitle}>{title}</ThemedText>
        {(type === "movies" || type === "series") ? (
          <RequestsBtn onPress={() => navigation.navigate("ContentRequests")} />
        ) : null}
        <RefreshBtn onPress={handleRefresh} refreshing={isSyncing} />
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      {/* Search bar — always rendered here so it never remounts when results appear */}
      <View style={[styles.listHeader, { paddingHorizontal: padH }]}>
        <View style={[styles.searchBar, isSearching && styles.searchBarActive]}>
          <Feather
            name="search"
            size={15}
            color={isSearching ? Colors.dark.accent : Colors.dark.textSecondary}
          />
          <TextInput
            style={styles.searchInput}
            placeholder={placeholder}
            placeholderTextColor={Colors.dark.textSecondary}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            blurOnSubmit={false}
            onSubmitEditing={() => setSubmittedQuery(query)}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => { setQuery(""); setSubmittedQuery(""); }} hitSlop={8}>
              <Feather name="x-circle" size={15} color={Colors.dark.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        {!isSearching ? (
          <>
            <FavRecentRow
              type={type}
              favCount={favCount}
              recentCount={recentCount}
              onPressFav={() =>
                navigation.navigate("ContentList", {
                  type,
                  categoryId: "favourites",
                  categoryName: "Favourites",
                })
              }
              onPressRecent={() =>
                navigation.navigate("ContentList", {
                  type,
                  categoryId: "recently",
                  categoryName: "Recently Watched",
                })
              }
            />
            {showRecentlyAdded ? (
              <PillButton
                icon="zap"
                label="Recently Added"
                count={30}
                onPress={() =>
                  navigation.navigate("ContentList", {
                    type,
                    categoryId: "recent",
                    categoryName: "Recently Added",
                  })
                }
              />
            ) : null}
          </>
        ) : (
          <View style={styles.searchResultsHeader}>
            <Feather name={getIcon()} size={13} color={Colors.dark.accent} />
            <ThemedText style={styles.searchResultsText}>
              {searchResults.length === 0
                ? `No results for "${submittedQuery}"`
                : `${searchResults.length} results`}
            </ThemedText>
            {searchResults.length === SEARCH_LIMIT ? (
              <ThemedText style={styles.searchResultsLimit}>
                (showing first {SEARCH_LIMIT})
              </ThemedText>
            ) : null}
          </View>
        )}
      </View>

      {isSearching ? (
        // ── Search results grid ──────────────────────────────────────────────
        <FlatList
          key={`search-${numSearchCols}`}
          data={searchResults}
          keyExtractor={getStreamKey}
          numColumns={numSearchCols}
          contentContainerStyle={{
            paddingHorizontal: padH,
            paddingTop: Spacing.xs,
            paddingBottom: padB,
            gap,
          }}
          columnWrapperStyle={numSearchCols > 1 ? { gap } : undefined}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => (
            <StreamCard
              item={item}
              type={type}
              cardWidth={searchCardWidth}
              onPress={() => handleStreamPress(item)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="inbox" size={40} color={Colors.dark.border} />
              <ThemedText style={styles.emptyText}>Nothing matched your search</ThemedText>
            </View>
          }
        />
      ) : (
        // ── Category grid ────────────────────────────────────────────────────
        <FlatList
          key={`cat-${numCatCols}`}
          data={categories}
          keyExtractor={(item) => item.category_id}
          numColumns={numCatCols}
          contentContainerStyle={{
            paddingHorizontal: padH,
            paddingTop: Spacing.sm,
            paddingBottom: padB,
            gap,
          }}
          columnWrapperStyle={numCatCols > 1 ? { gap } : undefined}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={10}
          renderItem={({ item }) => (
            <CategoryCard
              item={item}
              icon={getIcon()}
              onPress={() =>
                navigation.navigate("ContentList", {
                  type,
                  categoryId: item.category_id,
                  categoryName: item.category_name,
                })
              }
              width={catCardWidth}
              height={catCardHeight}
            />
          )}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { flexDirection: "row", alignItems: "center", paddingBottom: Spacing.md, gap: Spacing.md },
  backBtn: {
    width: 40, height: 40, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
    overflow: "hidden",
  },
  backBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: Colors.dark.text },
  divider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.sm },

  listHeader: { gap: Spacing.sm, marginBottom: Spacing.sm },

  // Search bar
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1.5, borderColor: Colors.dark.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, height: 42,
  },
  searchBarActive: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 4,
  },
  searchInput: {
    flex: 1, color: Colors.dark.text, fontSize: 13,
    height: 42, padding: 0,
  },

  // Search results meta row
  searchResultsHeader: {
    flexDirection: "row", alignItems: "center", gap: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  searchResultsText: { color: Colors.dark.accent, fontSize: 12, fontWeight: "600", flex: 1 },
  searchResultsLimit: { color: Colors.dark.textSecondary, fontSize: 11 },

  // Favourites + Recently row (50/50)
  favRecentRow: { flexDirection: "row", gap: Spacing.sm },
  favRecentCell: { flex: 1 },

  // Pill buttons (Favourites / Recently Watched)
  pillButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm, borderWidth: 1.5, borderColor: Colors.dark.border,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    overflow: "hidden",
  },
  pillButtonActive: {
    borderColor: "#FFD700",
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7, shadowRadius: 14, elevation: 10,
  },
  pillLeft: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, flexShrink: 1 },
  pillIconWrap: {
    width: 30, height: 30, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary, borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  pillIconWrapActive: {
    backgroundColor: Colors.dark.accentDim, borderColor: Colors.dark.accent,
  },
  pillTitle: { fontSize: 13, fontWeight: "700", color: Colors.dark.textSecondary, letterSpacing: 0.3, flexShrink: 1 },
  pillTitleActive: { color: Colors.dark.accent },
  pillRight: { flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  pillCountBadge: {
    backgroundColor: Colors.dark.accent, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 1, minWidth: 24, alignItems: "center",
  },
  pillCountText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  pillBottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
    backgroundColor: "#FFD700",
    shadowColor: "#FFD700", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 6,
  },

  // Category cards
  card: {
    flex: 1, backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
    padding: Spacing.sm, gap: Spacing.xs, overflow: "hidden",
  },
  cardActive: {
    borderColor: Colors.dark.accent, backgroundColor: Colors.dark.backgroundSecondary,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7, shadowRadius: 12, elevation: 10,
  },
  cardText: { color: Colors.dark.textSecondary, fontSize: 13, fontWeight: "500", textAlign: "center" },
  cardTextActive: { color: Colors.dark.accent, fontWeight: "600" },
  cardGlow: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
    backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 4,
  },

  // Stream result cards (search mode)
  streamCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm, overflow: "hidden",
    borderWidth: 1, borderColor: Colors.dark.border,
    alignSelf: "flex-start",
  },
  streamCardActive: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 14, elevation: 10,
  },
  streamThumb: { overflow: "hidden", backgroundColor: Colors.dark.backgroundSecondary },
  streamPlaceholder: {
    flex: 1, justifyContent: "center", alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  streamOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,102,0,0.08)" },
  streamInfo: { padding: Spacing.sm },
  streamName: { color: Colors.dark.textSecondary, fontSize: 11, fontWeight: "500", lineHeight: 15 },
  streamNameActive: { color: Colors.dark.text },
  streamActiveBar: {
    height: 2, backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 4,
  },

  emptyState: {
    paddingTop: Spacing["4xl"],
    justifyContent: "center", alignItems: "center", gap: Spacing.md,
  },
  emptyText: { color: Colors.dark.textSecondary, fontSize: 14, textAlign: "center" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: Spacing.md },
  loadingText: { color: Colors.dark.textSecondary, fontSize: 14 },
});
