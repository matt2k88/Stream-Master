import React, { useState, useMemo } from "react";
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

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type CategoryRouteProp = RouteProp<RootStackParamList, "Category">;
type AnyStream = LiveStream | VodStream | Series;

const SEARCH_LIMIT = 100;

function FavouritesButton({
  type,
  count,
  onPress,
}: {
  type: "live" | "movies" | "series";
  count: number;
  onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const isActive = pressed || focused;

  return (
    <Pressable
      style={[styles.favButton, isActive && styles.favButtonActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <LinearGradient
        colors={["rgba(255,102,0,0.18)", "rgba(255,102,0,0.06)"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      />
      <View style={styles.favLeft}>
        <View style={styles.favIconWrap}>
          <Feather name="star" size={18} color={Colors.dark.accent} />
        </View>
        <ThemedText style={styles.favTitle}>Favourites</ThemedText>
      </View>
      <View style={styles.favRight}>
        {count > 0 ? (
          <View style={styles.favCountBadge}>
            <ThemedText style={styles.favCountText}>{count}</ThemedText>
          </View>
        ) : null}
        <Feather name="chevron-right" size={18} color={Colors.dark.accent} />
      </View>
      <View style={styles.favBottomBar} />
    </Pressable>
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
      <ThemedText style={[styles.cardText, isActive && styles.cardTextActive]} numberOfLines={2}>
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
          style={[styles.streamName, isActive && styles.streamNameActive]}
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
  const { liveCategories, vodCategories, seriesCategories, liveStreams, vodStreams, seriesList, isSyncing } = useData();
  const { getFavouritesByType } = useFavourites();
  const [query, setQuery] = useState("");

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

  const categories: Category[] =
    type === "live" ? liveCategories :
    type === "movies" ? vodCategories :
    seriesCategories;

  const getIcon = (): keyof typeof Feather.glyphMap => {
    switch (type) {
      case "live": return "tv";
      case "movies": return "film";
      case "series": return "grid";
      default: return "folder";
    }
  };

  const favCount = getFavouritesByType(type).length;
  const trimmedQuery = query.trim().toLowerCase();
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
      navigation.navigate("Player", { streamUrl: xtreamApi.getLiveStreamUrl(s.stream_id), title: s.name, type: "live" });
    } else if (type === "movies") {
      const s = item as VodStream;
      navigation.navigate("Player", { streamUrl: xtreamApi.getVodStreamUrl(s.stream_id, s.container_extension), title: s.name, type: "vod" });
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
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Feather name="x-circle" size={15} color={Colors.dark.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {/* Favourites button — hidden while searching */}
      {!isSearching ? (
        <FavouritesButton
          type={type}
          count={favCount}
          onPress={() =>
            navigation.navigate("ContentList", {
              type,
              categoryId: "favourites",
              categoryName: "Favourites",
            })
          }
        />
      ) : (
        // Results count when searching
        <View style={styles.searchResultsHeader}>
          <Feather name={getIcon()} size={13} color={Colors.dark.accent} />
          <ThemedText style={styles.searchResultsText}>
            {searchResults.length === 0
              ? `No results for "${query}"`
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
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={20} color={Colors.dark.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>{title}</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      {isSearching ? (
        // ── Search results grid ──────────────────────────────────────────────
        <FlatList
          key={`search-${numSearchCols}`}
          data={searchResults}
          keyExtractor={getStreamKey}
          numColumns={numSearchCols}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={{
            paddingHorizontal: padH,
            paddingTop: Spacing.sm,
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
          ListHeaderComponent={ListHeader}
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
  },
  backBtnPressed: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
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

  // Favourites button
  favButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm, borderWidth: 1.5, borderColor: Colors.dark.accent,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg,
    overflow: "hidden",
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
  },
  favButtonActive: { shadowOpacity: 0.8, shadowRadius: 18, elevation: 14 },
  favLeft: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  favIconWrap: {
    width: 36, height: 36, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.accentDim, borderWidth: 1, borderColor: Colors.dark.accent,
    justifyContent: "center", alignItems: "center",
  },
  favTitle: { fontSize: 15, fontWeight: "700", color: Colors.dark.accent, letterSpacing: 0.3 },
  favRight: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  favCountBadge: {
    backgroundColor: Colors.dark.accent, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 2, minWidth: 28, alignItems: "center",
  },
  favCountText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  favBottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
    backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 6,
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
