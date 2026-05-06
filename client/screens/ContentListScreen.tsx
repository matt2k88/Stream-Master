import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Animated,
  TextInput,
  Modal,
  useWindowDimensions,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { xtreamApi, LiveStream, VodStream, Series } from "@/lib/xtream-api";
import { useData } from "@/contexts/DataContext";
import { useFavourites } from "@/contexts/FavouritesContext";
import { useWatchHistory, getWatchState } from "@/contexts/WatchHistoryContext";
import type { RecentlyWatched } from "@/components/RecentlyWatchedCard";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ContentListRouteProp = RouteProp<RootStackParamList, "ContentList">;
type ContentItem = LiveStream | VodStream | Series;

const SEARCH_LIMIT = 150;
const SIDEBAR_W = 170;
const CONTENT_PAD = Spacing.md;

function BackBtn({ onPress }: { onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[styles.backBtn, isActive && styles.backBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
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

function getImageRatio(type: string): number {
  if (type === "movies" || type === "series") return 1.5;
  return 0.75;
}

function getImageFit(type: string): "cover" | "contain" {
  if (type === "live") return "contain";
  return "cover";
}

function getStreamId(item: ContentItem, type: string): number {
  if (type === "series" && "series_id" in item) return (item as Series).series_id;
  if ("stream_id" in item) return (item as LiveStream | VodStream).stream_id;
  return 0;
}

function getIconUrl(item: ContentItem): string | null {
  if ("stream_icon" in item && item.stream_icon) return item.stream_icon;
  if ("cover" in item && item.cover) return item.cover;
  return null;
}

function StarBadge({ visible }: { visible: boolean }) {
  const scaleAnim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  React.useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      tension: 200,
      friction: 10,
    }).start();
  }, [visible]);

  return (
    <Animated.View
      style={[styles.starBadge, { transform: [{ scale: scaleAnim }] }]}
      pointerEvents="none"
    >
      <Feather name="star" size={11} color="#fff" />
    </Animated.View>
  );
}

function ContentCard({
  item,
  type,
  onPress,
  onLongPress,
  isFavourited,
  cardWidth,
  cardHeight,
  watchEntry,
}: {
  item: ContentItem;
  type: string;
  onPress: () => void;
  onLongPress: () => void;
  isFavourited: boolean;
  cardWidth: number;
  cardHeight: number;
  watchEntry?: RecentlyWatched;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  const longFiredRef = useRef(false);
  const pressInTimeRef = useRef(0);

  const imageUrl = getIconUrl(item);
  const iconName = type === "live" ? "tv" : type === "movies" ? "film" : "grid";
  const imgH = cardHeight - 52;
  const imgFit = getImageFit(type);

  return (
    <Pressable
      style={[
        styles.card,
        { width: cardWidth, height: cardHeight },
        isActive && !isFavourited && styles.cardActive,
        isFavourited && styles.cardFavourited,
        isActive && isFavourited && styles.cardFavouritedActive,
      ]}
      onPress={() => {
        if (longFiredRef.current) { longFiredRef.current = false; return; }
        onPress();
      }}
      onLongPress={() => {
        longFiredRef.current = true;
        onLongPress();
      }}
      delayLongPress={Platform.isTV ? 700 : 500}
      onPressIn={() => {
        setPressed(true);
        longFiredRef.current = false;
        pressInTimeRef.current = Date.now();
      }}
      onPressOut={() => {
        setPressed(false);
        if (Platform.isTV && !longFiredRef.current && (Date.now() - pressInTimeRef.current) >= 600) {
          longFiredRef.current = true;
          onLongPress();
        }
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <View style={[styles.cardThumb, { width: cardWidth, height: imgH }]}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.cardImage}
            contentFit={imgFit}
            transition={200}
          />
        ) : (
          <View style={styles.cardPlaceholder}>
            <Feather name={iconName} size={24} color={Colors.dark.border} />
          </View>
        )}
        {isActive ? <View style={styles.cardOverlay} /> : null}
        <StarBadge visible={isFavourited} />
        {"rating" in item && item.rating ? (
          <View style={styles.ratingBadge}>
            <Feather name="star" size={9} color={Colors.dark.accent} />
            <ThemedText style={styles.ratingText}>{item.rating}</ThemedText>
          </View>
        ) : null}
        {(() => {
          const ws = getWatchState(watchEntry);
          if (!ws.hasProgress || type === "live") return null;
          return (
            <>
              {ws.isCompleted ? (
                <View style={styles.watchedBadge}>
                  <Feather name="check" size={9} color="#fff" />
                  <ThemedText style={styles.watchedBadgeText}>WATCHED</ThemedText>
                </View>
              ) : (
                <View style={styles.continueBadge}>
                  <Feather name="play" size={9} color={Colors.dark.accent} />
                  <ThemedText style={styles.continueBadgeText}>CONTINUE</ThemedText>
                </View>
              )}
              {!ws.isCompleted ? (
                <View style={styles.cardProgressTrack}>
                  <View style={[styles.cardProgressFill, { width: `${ws.progress * 100}%` }]} />
                </View>
              ) : null}
            </>
          );
        })()}
      </View>

      <View style={styles.cardInfo}>
        <ThemedText
          style={[styles.cardName, isActive && styles.cardNameActive]}
          numberOfLines={2}
        >
          {item.name}
        </ThemedText>
      </View>

      {isActive ? <View style={styles.activeBar} /> : null}
    </Pressable>
  );
}

interface SidebarCat {
  category_id: string;
  category_name: string;
}

function CategorySidebarItem({
  item,
  isSelected,
  onPress,
  isFav,
  isRecent,
}: {
  item: SidebarCat;
  isSelected: boolean;
  onPress: () => void;
  isFav?: boolean;
  isRecent?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  const highlight = isSelected || isActive;

  return (
    <Pressable
      style={[
        styles.sidebarItem,
        isSelected && styles.sidebarItemSelected,
        isActive && !isSelected && styles.sidebarItemHover,
      ]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      {isSelected ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.18)", "rgba(255,102,0,0.04)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      ) : isActive ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.08)", "rgba(255,102,0,0.02)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      ) : null}
      {isFav ? (
        <Feather
          name="star"
          size={10}
          color={highlight ? Colors.dark.accent : Colors.dark.textSecondary}
        />
      ) : isRecent ? (
        <Feather
          name="clock"
          size={10}
          color={highlight ? Colors.dark.accent : Colors.dark.textSecondary}
        />
      ) : null}
      <ThemedText
        style={[styles.sidebarItemText, highlight && styles.sidebarItemTextActive]}
        numberOfLines={3}
      >
        {item.category_name}
      </ThemedText>
      {isSelected ? <View style={styles.sidebarActiveBar} /> : null}
    </Pressable>
  );
}

export default function ContentListScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ContentListRouteProp>();
  const { type, categoryId, categoryName } = route.params;
  const { width } = useWindowDimensions();
  const { liveStreams, vodStreams, seriesList, liveCategories, vodCategories, seriesCategories, isSyncing } = useData();
  const { isFavourite, toggleFavourite, getFavouritesByType, clearAllFavourites } = useFavourites();
  const { entries: watchEntries, getByStreamId, getBySeriesId, refetch: refetchHistory, clearHistory } = useWatchHistory();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState(categoryId);
  const [selectedCategoryName, setSelectedCategoryName] = useState(categoryName);
  const [categorySwitching, setCategorySwitching] = useState(false);

  // Brief loading overlay when category changes (lets the UI show feedback
  // before the new list renders, especially on slower TV devices).
  useEffect(() => {
    if (!categorySwitching) return;
    const t = setTimeout(() => setCategorySwitching(false), 280);
    return () => clearTimeout(t);
  }, [categorySwitching, selectedCategoryId]);
  const [contentWidth, setContentWidth] = useState(Math.max(200, width - SIDEBAR_W - 2));
  const flatListRef = useRef<FlatList<ContentItem>>(null);

  const padH = Math.max(insets.left + Spacing.xs, Spacing.md);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.sm);
  const gap = Spacing.sm;

  const isFavouritesView = selectedCategoryId === "favourites";
  const isRecentlyView = selectedCategoryId === "recently";
  const isSpecialView = isFavouritesView || isRecentlyView;
  const trimmedQuery = submittedQuery.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  const numColumns = type === "live"
    ? Math.max(2, Math.floor(contentWidth / 150))
    : Math.max(2, Math.floor(contentWidth / 140));
  const cardWidth = Math.floor((contentWidth - CONTENT_PAD * 2 - gap * (numColumns - 1)) / numColumns);
  const cardImgH = Math.round(cardWidth * getImageRatio(type));
  const cardTotalH = cardImgH + 52;

  // Categories for the sidebar
  const categories: SidebarCat[] = useMemo(() => {
    switch (type) {
      case "live": return liveCategories.map((c) => ({ category_id: c.category_id, category_name: c.category_name }));
      case "movies": return vodCategories.map((c) => ({ category_id: c.category_id, category_name: c.category_name }));
      case "series": return seriesCategories.map((c) => ({ category_id: c.category_id, category_name: c.category_name }));
      default: return [];
    }
  }, [type, liveCategories, vodCategories, seriesCategories]);

  const sidebarData: SidebarCat[] = useMemo(() => {
    const pinned: SidebarCat[] = [
      { category_id: "recently", category_name: "Recently Watched" },
      { category_id: "favourites", category_name: "Favourites" },
    ];
    return [...pinned, ...categories];
  }, [categories]);

  // All streams for this section type (used for section-wide search)
  const allSectionStreams: ContentItem[] = useMemo(() => {
    switch (type) {
      case "live": return liveStreams;
      case "movies": return vodStreams;
      case "series": return seriesList;
      default: return [];
    }
  }, [type, liveStreams, vodStreams, seriesList]);

  // Pre-build a category_id → items[] index once per stream list change.
  // Category switches become an O(1) Map lookup instead of an O(n) filter.
  const categoryIndex = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    for (const s of allSectionStreams) {
      const cid = (s as any).category_id as string;
      if (!cid) continue;
      let bucket = map.get(cid);
      if (!bucket) { bucket = []; map.set(cid, bucket); }
      bucket.push(s);
    }
    return map;
  }, [allSectionStreams]);

  // Normal category content — O(1) lookup, no dependency on watchEntries.
  // This memo only re-runs when streams or selected category actually changes.
  const normalContent: ContentItem[] = useMemo(() => {
    if (isSpecialView) return [];
    return categoryIndex.get(selectedCategoryId) ?? [];
  }, [isSpecialView, selectedCategoryId, categoryIndex]);

  // Special views (Favourites / Recently Watched) — allowed to depend on watchEntries.
  const specialContent: ContentItem[] = useMemo(() => {
    if (!isSpecialView) return [];
    if (isFavouritesView) {
      const favIds = new Set(
        getFavouritesByType(type as "live" | "movies" | "series").map((f) => f.stream_id)
      );
      switch (type) {
        case "live": return liveStreams.filter((s) => favIds.has(s.stream_id));
        case "movies": return vodStreams.filter((s) => favIds.has(s.stream_id));
        case "series": return seriesList.filter((s) => favIds.has(s.series_id));
        default: return [];
      }
    }
    // Recently Watched — walk watchEntries (newest-first), dedup, hydrate
    if (type === "live") {
      const out: LiveStream[] = [];
      const seen = new Set<string>();
      const idx = new Map<string, LiveStream>();
      for (const s of liveStreams) idx.set(String(s.stream_id), s);
      for (const e of watchEntries) {
        if (e.content_type !== "live" || !e.stream_id) continue;
        const k = String(e.stream_id);
        if (seen.has(k)) continue;
        const s = idx.get(k);
        if (s) { out.push(s); seen.add(k); }
      }
      return out;
    }
    if (type === "movies") {
      const out: VodStream[] = [];
      const seen = new Set<string>();
      const idx = new Map<string, VodStream>();
      for (const v of vodStreams) idx.set(String(v.stream_id), v);
      for (const e of watchEntries) {
        if (e.content_type !== "movie" || !e.stream_id) continue;
        const k = String(e.stream_id);
        if (seen.has(k)) continue;
        const v = idx.get(k);
        if (v) { out.push(v); seen.add(k); }
      }
      return out;
    }
    if (type === "series") {
      const out: Series[] = [];
      const seen = new Set<string>();
      const idx = new Map<string, Series>();
      for (const s of seriesList) idx.set(String(s.series_id), s);
      for (const e of watchEntries) {
        if (e.content_type !== "series" || !e.series_id) continue;
        const k = String(e.series_id);
        if (seen.has(k)) continue;
        const s = idx.get(k);
        if (s) { out.push(s); seen.add(k); }
      }
      return out;
    }
    return [];
  }, [isSpecialView, isFavouritesView, isRecentlyView, type, liveStreams, vodStreams, seriesList, getFavouritesByType, watchEntries]);

  const categoryContent: ContentItem[] = isSpecialView ? specialContent : normalContent;

  // Scroll to top whenever the selected category changes (without remounting FlatList)
  useEffect(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [selectedCategoryId]);

  // Search results — searches entire section, not just current category
  const searchResults: ContentItem[] = useMemo(() => {
    if (!trimmedQuery) return [];
    return allSectionStreams
      .filter((s) => s.name.toLowerCase().includes(trimmedQuery))
      .slice(0, SEARCH_LIMIT);
  }, [trimmedQuery, allSectionStreams]);

  const displayContent = isSearching ? searchResults : categoryContent;

  const handleItemPress = (item: ContentItem) => {
    if (type === "live") {
      const s = item as LiveStream;
      if (selectedCategoryId === "favourites") {
        // Favourites has no real category — go straight to fullscreen via LivePreview
        navigation.navigate("LivePreview", {
          streamId: s.stream_id,
          name: s.name,
          streamUrl: xtreamApi.getLiveStreamUrl(s.stream_id),
          thumbnail: s.stream_icon ?? undefined,
          streamIcon: s.stream_icon ?? undefined,
          initialFullscreen: true,
        });
      } else {
        navigation.navigate("LivePreview", {
          streamId: s.stream_id,
          name: s.name,
          streamUrl: xtreamApi.getLiveStreamUrl(s.stream_id),
          thumbnail: s.stream_icon ?? undefined,
          streamIcon: s.stream_icon ?? undefined,
          categoryId: selectedCategoryId ?? undefined,
        });
      }
    } else if (type === "movies") {
      const s = item as VodStream;
      const watch = getByStreamId(s.stream_id);
      const resume = watch && !watch.is_completed ? (watch.current_time ?? 0) : 0;
      navigation.navigate("Player", {
        streamUrl: xtreamApi.getVodStreamUrl(s.stream_id, s.container_extension),
        title: s.name,
        type: "vod",
        thumbnail: s.stream_icon ?? undefined,
        streamId: String(s.stream_id),
        resumeTime: resume,
      });
    } else {
      const s = item as Series;
      const watch = getBySeriesId(s.series_id);
      const initialSeason =
        watch && watch.season_num != null ? Number(watch.season_num) : undefined;
      navigation.navigate("SeriesDetail", {
        seriesId: s.series_id,
        seriesName: s.name,
        cover: s.cover,
        initialSeason,
      });
    }
  };

  // Refresh watch history when this screen comes into focus
  useFocusEffect(
    useCallback(() => {
      refetchHistory();
    }, [refetchHistory])
  );

  const handleClearAll = useCallback(async () => {
    setClearing(true);
    try {
      if (isFavouritesView) {
        await clearAllFavourites(type as "live" | "movies" | "series");
      } else if (isRecentlyView) {
        const ct = type === "live" ? "live" : type === "movies" ? "movie" : "series";
        await clearHistory(ct as "live" | "movie" | "series");
      }
    } finally {
      setClearing(false);
      setShowClearConfirm(false);
    }
  }, [isFavouritesView, isRecentlyView, type, clearAllFavourites, clearHistory]);

  const handleLongPress = (item: ContentItem) => {
    if (isSearching) return;
    const streamId = getStreamId(item, type);
    toggleFavourite({
      streamId,
      streamType: type as "live" | "movies" | "series",
      streamName: item.name,
      streamIcon: getIconUrl(item),
      categoryId: "category_id" in item ? (item as any).category_id : null,
    });
  };

  const getItemId = (item: ContentItem) => {
    if ("stream_id" in item) return String((item as LiveStream | VodStream).stream_id);
    if ("series_id" in item) return String((item as Series).series_id);
    return String(item.num);
  };

  const sectionPlaceholder =
    type === "live" ? "Search all live channels..." :
    type === "movies" ? "Search all movies..." :
    "Search all series...";

  const countDisplay = isSearching ? searchResults.length : displayContent.length;

  const searchBarHeader = (
    <View style={styles.searchBarWrap}>
      <View style={[styles.searchBar, isSearching && styles.searchBarActive]}>
        <Feather
          name="search"
          size={15}
          color={isSearching ? Colors.dark.accent : Colors.dark.textSecondary}
        />
        <TextInput
          style={styles.searchInput}
          placeholder={sectionPlaceholder}
          placeholderTextColor={Colors.dark.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          blurOnSubmit={false}
          onSubmitEditing={() => setSubmittedQuery(query)}
          focusable={!Platform.isTV}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => { setQuery(""); setSubmittedQuery(""); }} hitSlop={8}>
            <Feather name="x-circle" size={15} color={Colors.dark.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {isSearching ? (
        <View style={styles.searchMeta}>
          <ThemedText style={styles.searchMetaText}>
            {searchResults.length === 0
              ? `No results for "${submittedQuery}"`
              : `${searchResults.length} results across all ${
                  type === "live" ? "channels" : type === "movies" ? "movies" : "series"
                }`}
          </ThemedText>
          {searchResults.length === SEARCH_LIMIT ? (
            <ThemedText style={styles.searchMetaLimit}>
              (first {SEARCH_LIMIT} shown)
            </ThemedText>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  if (isSyncing && categoryContent.length === 0 && !isSpecialView) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={styles.loadingText}>Loading content...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Confirm Clear All modal */}
      <Modal
        visible={showClearConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowClearConfirm(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Feather
              name={isFavouritesView ? "star" : "clock"}
              size={28}
              color={Colors.dark.accent}
            />
            <ThemedText style={styles.modalTitle}>Clear All?</ThemedText>
            <ThemedText style={styles.modalBody}>
              {isFavouritesView
                ? `Remove all ${type} favourites for this profile?`
                : `Remove all ${type === "movies" ? "movie" : "series"} watch history for this profile?`}
            </ThemedText>
            <View style={styles.modalBtnRow}>
              <Pressable
                style={({ pressed, focused }) => [styles.modalBtnCancel, (pressed || focused) && styles.modalBtnCancelActive]}
                onPress={() => setShowClearConfirm(false)}
                disabled={clearing}
              >
                <ThemedText style={styles.modalBtnCancelText}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={({ pressed, focused }) => [styles.modalBtnConfirm, (pressed || focused) && styles.modalBtnConfirmActive]}
                onPress={handleClearAll}
                disabled={clearing}
              >
                {clearing
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <ThemedText style={styles.modalBtnConfirmText}>Clear All</ThemedText>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <BackBtn onPress={() => navigation.goBack()} />
        <View style={styles.headerTitleRow}>
          {isFavouritesView ? (
            <Feather name="star" size={16} color={Colors.dark.accent} />
          ) : isRecentlyView ? (
            <Feather name="clock" size={16} color={Colors.dark.accent} />
          ) : null}
          <ThemedText style={styles.headerTitle} numberOfLines={1}>
            {isSearching ? "Search Results" : selectedCategoryName}
          </ThemedText>
        </View>
        <View style={[
          styles.countBadge,
          isSearching && styles.countBadgeSearch,
        ]}>
          <ThemedText style={[styles.countText, isSearching && styles.countTextSearch]}>
            {countDisplay}
          </ThemedText>
        </View>
        {isSpecialView && !isSearching ? (
          <Pressable
            style={({ pressed, focused }) => [styles.clearAllBtn, (pressed || focused) && styles.clearAllBtnActive]}
            onPress={() => setShowClearConfirm(true)}
          >
            <Feather name="trash-2" size={13} color={Colors.dark.error} />
            <ThemedText style={styles.clearAllText}>Clear All</ThemedText>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      {/* Body: sidebar + main content */}
      <View style={styles.body}>
        {/* Category Sidebar */}
        <View style={[styles.sidebar, { paddingLeft: Math.max(insets.left, Spacing.xs), paddingBottom: padB }]}>
          <FlatList
            data={sidebarData}
            keyExtractor={(item) => item.category_id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <CategorySidebarItem
                item={item}
                isSelected={item.category_id === selectedCategoryId}
                isFav={item.category_id === "favourites"}
                isRecent={item.category_id === "recently"}
                onPress={() => {
                  if (item.category_id === selectedCategoryId) return;
                  setCategorySwitching(true);
                  setSelectedCategoryId(item.category_id);
                  setSelectedCategoryName(item.category_name);
                }}
              />
            )}
          />
        </View>

        <View style={styles.sidebarDivider} />

        {/* Main content */}
        <View
          style={styles.mainContent}
          onLayout={(e) => setContentWidth(e.nativeEvent.layout.width)}
        >
          {/* Search bar — always rendered here so it never remounts when results switch in */}
          <View style={{ paddingHorizontal: CONTENT_PAD }}>
            {searchBarHeader}
          </View>

          {isFavouritesView && !isSearching && categoryContent.length === 0 ? (
            <View style={styles.centered}>
              <Feather name="star" size={44} color={Colors.dark.border} />
              <ThemedText style={styles.emptyTitle}>No Favourites Yet</ThemedText>
              <ThemedText style={styles.emptyText}>
                Hold any item to add it to your favourites
              </ThemedText>
            </View>
          ) : isRecentlyView && !isSearching && categoryContent.length === 0 ? (
            <View style={styles.centered}>
              <Feather name="clock" size={44} color={Colors.dark.border} />
              <ThemedText style={styles.emptyTitle}>Nothing Watched Yet</ThemedText>
              <ThemedText style={styles.emptyText}>
                {type === "movies"
                  ? "Movies you watch will show up here"
                  : "Series you watch will show up here"}
              </ThemedText>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={displayContent}
              keyExtractor={getItemId}
              numColumns={numColumns}
              key={`content-${type}-${numColumns}`}
              contentContainerStyle={{
                paddingHorizontal: CONTENT_PAD,
                paddingTop: Spacing.xs,
                paddingBottom: padB,
                gap,
              }}
              columnWrapperStyle={numColumns > 1 ? { gap } : undefined}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              initialNumToRender={type === "live" ? 30 : 20}
              maxToRenderPerBatch={type === "live" ? 30 : 20}
              updateCellsBatchingPeriod={16}
              windowSize={21}
              renderItem={({ item }) => {
                const watchEntry =
                  type === "series"
                    ? getBySeriesId((item as Series).series_id)
                    : type !== "live"
                      ? getByStreamId((item as VodStream).stream_id)
                      : undefined;
                return (
                  <ContentCard
                    item={item}
                    type={type}
                    onPress={() => handleItemPress(item)}
                    onLongPress={() => handleLongPress(item)}
                    isFavourited={!isSearching && isFavourite(getStreamId(item, type), type)}
                    cardWidth={cardWidth}
                    cardHeight={cardTotalH}
                    watchEntry={watchEntry}
                  />
                );
              }}
              ListEmptyComponent={
                isSearching ? (
                  <View style={styles.centeredInline}>
                    <Feather name="search" size={36} color={Colors.dark.border} />
                    <ThemedText style={styles.emptyText}>No matches found</ThemedText>
                  </View>
                ) : (
                  <View style={styles.centeredInline}>
                    <Feather name="inbox" size={36} color={Colors.dark.border} />
                    <ThemedText style={styles.emptyText}>No content in this category</ThemedText>
                  </View>
                )
              }
            />
          )}

          {categorySwitching ? (
            <View style={styles.switchOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color={Colors.dark.accent} />
            </View>
          ) : null}
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  switchOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(8,8,8,0.45)",
  },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingBottom: Spacing.md, gap: Spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
    overflow: "hidden",
  },
  backBtnActive: { borderColor: Colors.dark.accent },
  headerTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  headerTitle: { fontSize: 18, fontWeight: "700", color: Colors.dark.text, flex: 1 },
  countBadge: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    minWidth: 38, alignItems: "center",
  },
  countBadgeSearch: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  countText: { fontSize: 12, color: Colors.dark.textSecondary, textAlign: "center" },
  countTextSearch: { color: Colors.dark.accent, fontWeight: "700" },
  clearAllBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: "rgba(255,59,59,0.35)",
    backgroundColor: "rgba(255,59,59,0.08)",
  },
  clearAllBtnActive: {
    borderColor: Colors.dark.error,
    backgroundColor: "rgba(255,59,59,0.18)",
  },
  clearAllText: { fontSize: 12, fontWeight: "700", color: Colors.dark.error },
  // Confirm modal
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center", alignItems: "center",
  },
  modalCard: {
    width: 340, maxWidth: "90%",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.dark.border,
    padding: Spacing.xl,
    alignItems: "center", gap: Spacing.md,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: Colors.dark.text },
  modalBody: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center", lineHeight: 19 },
  modalBtnRow: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.xs, width: "100%" },
  modalBtnCancel: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.dark.border,
    alignItems: "center", justifyContent: "center",
  },
  modalBtnCancelActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  modalBtnCancelText: { color: Colors.dark.text, fontWeight: "600", fontSize: 14 },
  modalBtnConfirm: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.error, alignItems: "center", justifyContent: "center",
    minHeight: 40,
  },
  modalBtnConfirmActive: { opacity: 0.8 },
  modalBtnConfirmText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  divider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.xs },

  // Body layout
  body: { flex: 1, flexDirection: "row" },

  // Sidebar
  sidebar: {
    width: SIDEBAR_W,
    paddingRight: Spacing.xs,
    paddingTop: Spacing.xs,
  },
  sidebarDivider: {
    width: 1,
    backgroundColor: Colors.dark.border,
    marginVertical: Spacing.xs,
  },
  sidebarItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: 2,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "transparent",
  },
  sidebarItemSelected: {
    borderColor: "rgba(255,102,0,0.35)",
  },
  sidebarItemHover: {
    borderColor: "rgba(255,102,0,0.15)",
  },
  sidebarItemText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
    lineHeight: 15,
  },
  sidebarItemTextActive: {
    color: Colors.dark.accent,
    fontWeight: "700",
  },
  sidebarActiveBar: {
    position: "absolute",
    left: 0,
    top: 6,
    bottom: 6,
    width: 2.5,
    backgroundColor: Colors.dark.accent,
    borderRadius: 2,
  },

  // Main content
  mainContent: { flex: 1 },

  // Search bar
  searchBarWrap: { marginBottom: Spacing.sm, gap: Spacing.xs },
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
  searchMeta: { flexDirection: "row", alignItems: "center", gap: Spacing.xs, paddingHorizontal: Spacing.xs },
  searchMetaText: { flex: 1, color: Colors.dark.accent, fontSize: 12, fontWeight: "600" },
  searchMetaLimit: { color: Colors.dark.textSecondary, fontSize: 11 },

  // Cards
  card: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm, overflow: "hidden",
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  cardActive: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 14, elevation: 10,
  },
  cardFavourited: { borderColor: "rgba(255,102,0,0.45)" },
  cardFavouritedActive: {
    borderColor: "#FFD700",
    shadowColor: "#FFD700", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9, shadowRadius: 14, elevation: 10,
  },
  cardThumb: { overflow: "hidden", backgroundColor: Colors.dark.backgroundSecondary },
  cardImage: { width: "100%", height: "100%" },
  cardPlaceholder: {
    width: "100%", height: "100%",
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center", alignItems: "center",
  },
  cardOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,102,0,0.08)" },
  starBadge: {
    position: "absolute", top: 6, right: 6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.dark.accent,
    justifyContent: "center", alignItems: "center",
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1, shadowRadius: 6, elevation: 6,
  },
  cardInfo: { padding: Spacing.sm, gap: 2, flex: 1, justifyContent: "center" },
  cardName: { color: Colors.dark.textSecondary, fontSize: 11, fontWeight: "500", lineHeight: 15 },
  cardNameActive: { color: Colors.dark.text },
  ratingBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.78)",
    borderRadius: BorderRadius.xs,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.35)",
  },
  ratingText: { color: Colors.dark.text, fontSize: 10, fontWeight: "700" },
  watchedBadge: {
    position: "absolute", top: 4, left: 4,
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(0,0,0,0.82)",
    borderRadius: BorderRadius.xs,
    paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 1, borderColor: "rgba(120,255,120,0.5)",
  },
  watchedBadgeText: { color: "#7CFF7C", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  continueBadge: {
    position: "absolute", top: 4, left: 4,
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(0,0,0,0.82)",
    borderRadius: BorderRadius.xs,
    paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 1, borderColor: "rgba(255,102,0,0.55)",
  },
  continueBadgeText: { color: Colors.dark.accent, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  cardProgressTrack: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    height: 3, backgroundColor: "rgba(0,0,0,0.55)",
  },
  cardProgressFill: {
    height: "100%",
    backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 4,
  },
  activeBar: {
    height: 2, backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 4,
  },

  centered: {
    flex: 1, justifyContent: "center", alignItems: "center",
    gap: Spacing.md, paddingTop: Spacing["4xl"],
  },
  centeredInline: {
    paddingTop: Spacing["4xl"],
    justifyContent: "center", alignItems: "center", gap: Spacing.md,
  },
  emptyTitle: { color: Colors.dark.text, fontSize: 16, fontWeight: "700" },
  emptyText: { color: Colors.dark.textSecondary, fontSize: 14, textAlign: "center", paddingHorizontal: Spacing.xl },
  loadingText: { color: Colors.dark.textSecondary, fontSize: 14 },
});
