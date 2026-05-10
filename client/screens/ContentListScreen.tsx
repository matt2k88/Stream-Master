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
import { useCategoryOrder } from "@/contexts/CategoryOrderContext";
import { useUISettings } from "@/contexts/UISettingsContext";
import { normaliseSearch } from "@/lib/search";
import type { RecentlyWatched } from "@/components/RecentlyWatchedCard";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ContentListRouteProp = RouteProp<RootStackParamList, "ContentList">;
type ContentItem = LiveStream | VodStream | Series;

const SEARCH_LIMIT = 150;
const SIDEBAR_W = 170;
const CONTENT_PAD = Spacing.md;

// Header "Clear All" button — explicit focus/hover/press tracking because
// Pressable's style render-prop only exposes `pressed` on RN native; using
// `({ focused, hovered })` would always be undefined and the active style
// would never apply on TV remotes or desktop hover.
function ManageBtn({ active, onPress }: { active: boolean; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || hovered || pressed;
  return (
    <Pressable
      style={[
        styles.manageBtn,
        active && styles.manageBtnOn,
        isActive && (active ? styles.manageBtnOnActive : styles.manageBtnActive),
      ]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      <Feather
        name={active ? "check" : "edit-2"}
        size={13}
        color={active ? "#fff" : Colors.dark.accent}
      />
      <ThemedText style={[styles.manageBtnText, active && styles.manageBtnTextOn]}>
        {active ? "Done" : "Manage"}
      </ThemedText>
    </Pressable>
  );
}

function ClearAllButton({ onPress }: { onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || hovered || pressed;
  return (
    <Pressable
      style={[styles.clearAllBtn, isActive && styles.clearAllBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      <Feather name="trash-2" size={13} color={Colors.dark.error} />
      <ThemedText style={styles.clearAllText}>Clear All</ThemedText>
    </Pressable>
  );
}

// Confirm-modal Cancel / Clear All buttons — same focus/hover pattern as
// ClearAllButton so the active highlight actually shows on TV + desktop.
function ModalBtn({
  kind, onPress, disabled, children,
}: {
  kind: "cancel" | "confirm";
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || hovered || pressed;
  const baseStyle = kind === "cancel" ? styles.modalBtnCancel : styles.modalBtnConfirm;
  const activeStyle = kind === "cancel" ? styles.modalBtnCancelActive : styles.modalBtnConfirmActive;
  return (
    <Pressable
      style={[baseStyle, isActive && activeStyle]}
      onPress={onPress}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      {children}
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

function RefreshBtn({ onPress, refreshing }: { onPress: () => void; refreshing: boolean }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[styles.backBtn, (isActive || refreshing) && styles.backBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
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

const ContentCard = React.memo(function ContentCard({
  item,
  type,
  onPress,
  onLongPress,
  isFavourited,
  cardWidth,
  cardHeight,
  watchEntry,
  editMode,
  editAction,
}: {
  item: ContentItem;
  type: string;
  // Item-aware so parents can pass stable refs (no new closures per render).
  onPress: (item: ContentItem) => void;
  onLongPress: (item: ContentItem) => void;
  isFavourited: boolean;
  cardWidth: number;
  cardHeight: number;
  watchEntry?: RecentlyWatched;
  editMode?: boolean;
  editAction?: "delete" | "favourite";
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  const longFiredRef = useRef(false);
  const pressInTimeRef = useRef(0);
  const { scaleFont } = useUISettings();

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
        editMode && editAction === "delete" && styles.cardEditDelete,
        editMode && editAction === "delete" && isActive && styles.cardEditDeleteActive,
        editMode && editAction === "favourite" && isActive && styles.cardEditFavActive,
      ]}
      onPress={() => {
        if (longFiredRef.current) { longFiredRef.current = false; return; }
        onPress(item);
      }}
      onLongPress={() => {
        if (editMode) return;
        longFiredRef.current = true;
        onLongPress(item);
      }}
      delayLongPress={Platform.isTV ? 700 : 500}
      onPressIn={() => {
        setPressed(true);
        longFiredRef.current = false;
        pressInTimeRef.current = Date.now();
      }}
      onPressOut={() => {
        setPressed(false);
        if (
          !editMode &&
          Platform.isTV &&
          !longFiredRef.current &&
          (Date.now() - pressInTimeRef.current) >= 600
        ) {
          longFiredRef.current = true;
          onLongPress(item);
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
        {editMode && editAction === "delete" ? (
          <View style={styles.deleteBadge} pointerEvents="none">
            <Feather name="x" size={13} color="#fff" />
          </View>
        ) : null}
        {editMode && editAction === "favourite" ? (
          <View style={styles.editFavBadge} pointerEvents="none">
            <Feather
              name={isFavourited ? "star" : "plus"}
              size={11}
              color="#fff"
            />
          </View>
        ) : null}
        <StarBadge visible={isFavourited && !editMode} />
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
          style={[
            styles.cardName,
            { fontSize: scaleFont(11), lineHeight: scaleFont(15) },
            isActive && styles.cardNameActive,
          ]}
          numberOfLines={2}
        >
          {item.name}
        </ThemedText>
      </View>

      {isActive ? <View style={styles.activeBar} /> : null}
    </Pressable>
  );
});

interface SidebarCat {
  category_id: string;
  category_name: string;
}

const CategorySidebarItem = React.memo(function CategorySidebarItem({
  item,
  isSelected,
  onPress,
  isFav,
  isRecent,
}: {
  item: SidebarCat;
  isSelected: boolean;
  // Item-aware so parents can pass a single stable callback ref.
  onPress: (item: SidebarCat) => void;
  isFav?: boolean;
  isRecent?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  const highlight = isSelected || isActive;
  const { scaleFont } = useUISettings();

  return (
    <Pressable
      style={[
        styles.sidebarItem,
        isSelected && styles.sidebarItemSelected,
        isActive && !isSelected && styles.sidebarItemHover,
      ]}
      onPress={() => onPress(item)}
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
        style={[
          styles.sidebarItemText,
          { fontSize: scaleFont(11), lineHeight: scaleFont(15) },
          highlight && styles.sidebarItemTextActive,
        ]}
        numberOfLines={3}
      >
        {item.category_name}
      </ThemedText>
      {isSelected ? <View style={styles.sidebarActiveBar} /> : null}
    </Pressable>
  );
});

export default function ContentListScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ContentListRouteProp>();
  const { type, categoryId, categoryName } = route.params;
  const { width } = useWindowDimensions();
  const { liveStreams, vodStreams, seriesList, liveCategories, vodCategories, seriesCategories, isSyncing, refresh } = useData();
  const handleRefresh = useCallback(() => {
    if (isSyncing) return;
    refresh();
  }, [refresh, isSyncing]);
  const { isFavourite, toggleFavourite, getFavouritesByType, clearAllFavourites } = useFavourites();
  const { applyOrder } = useCategoryOrder();
  const { entries: watchEntries, getByStreamId, getBySeriesId, refetch: refetchHistory, clearHistory, removeOne: removeWatchEntry } = useWatchHistory();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState(categoryId);
  const [selectedCategoryName, setSelectedCategoryName] = useState(categoryName);
  const [categorySwitching, setCategorySwitching] = useState(false);

  // Clear the loading overlay shortly AFTER the new selectedCategoryId has
  // been applied (the list re-renders synchronously with the change). We
  // wait until selectedCategoryId actually changes — not when the spinner
  // first appears — so the overlay covers the entire heavy re-render.
  useEffect(() => {
    if (!categorySwitching) return;
    const t = setTimeout(() => setCategorySwitching(false), 120);
    return () => clearTimeout(t);
  }, [selectedCategoryId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [contentWidth, setContentWidth] = useState(Math.max(200, width - SIDEBAR_W - 2));
  const flatListRef = useRef<FlatList<ContentItem>>(null);

  const padH = Math.max(insets.left + Spacing.xs, Spacing.md);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.sm);
  const gap = Spacing.sm;

  const isFavouritesView = selectedCategoryId === "favourites";
  const isRecentlyView = selectedCategoryId === "recently";
  const isRecentlyAddedView = selectedCategoryId === "recent" && (type === "movies" || type === "series");
  const isSpecialView = isFavouritesView || isRecentlyView || isRecentlyAddedView;
  const trimmedQuery = normaliseSearch(submittedQuery);
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
      case "live": return applyOrder("live", liveCategories).map((c) => ({ category_id: c.category_id, category_name: c.category_name }));
      case "movies": return applyOrder("movies", vodCategories).map((c) => ({ category_id: c.category_id, category_name: c.category_name }));
      case "series": return applyOrder("series", seriesCategories).map((c) => ({ category_id: c.category_id, category_name: c.category_name }));
      default: return [];
    }
  }, [type, liveCategories, vodCategories, seriesCategories, applyOrder]);

  const sidebarData: SidebarCat[] = useMemo(() => {
    const pinned: SidebarCat[] = [];
    pinned.push({ category_id: "recently", category_name: "Recently Watched" });
    pinned.push({ category_id: "favourites", category_name: "Favourites" });
    if (type === "movies" || type === "series") {
      pinned.push({ category_id: "recent", category_name: "Recently Added" });
    }
    return [...pinned, ...categories];
  }, [type, categories]);

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

  // Special views (Favourites / Recently Watched / Recently Added).
  const specialContent: ContentItem[] = useMemo(() => {
    if (!isSpecialView) return [];
    // Recently Added — newest 30 items by `added` (movies) or `last_modified` (series)
    if (isRecentlyAddedView) {
      const RECENT_LIMIT = 30;
      const tsOf = (s: any): number => {
        const raw = (type === "series" ? s.last_modified : s.added) ?? s.added ?? s.last_modified;
        if (!raw) return 0;
        const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
        if (!isNaN(n) && n > 0) return n;
        const d = Date.parse(String(raw));
        return isNaN(d) ? 0 : Math.floor(d / 1000);
      };
      const pool: ContentItem[] = type === "movies" ? vodStreams : seriesList;
      const sorted = [...pool].sort((a, b) => tsOf(b) - tsOf(a));
      return sorted.slice(0, RECENT_LIMIT);
    }
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
  }, [isSpecialView, isFavouritesView, isRecentlyView, isRecentlyAddedView, type, liveStreams, vodStreams, seriesList, getFavouritesByType, watchEntries]);

  const categoryContent: ContentItem[] = isSpecialView ? specialContent : normalContent;

  // Progressive render: on slower devices, mounting a FlatList with hundreds
  // of cards (images + focus handlers + watch-state lookups) blocks the JS
  // thread on first paint. Instead we expose a tiny first batch immediately,
  // then grow the visible window off-screen in larger chunks until the full
  // list is materialised. The user sees results almost instantly and the
  // remainder fills in before they can scroll past it.
  const PROGRESSIVE_STEPS = [16, 60, 200, 600, 2000];
  const [renderLimit, setRenderLimit] = useState(PROGRESSIVE_STEPS[0]);

  // Scroll to top whenever the selected category changes (without remounting FlatList)
  useEffect(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [selectedCategoryId]);

  // Pre-build a normalised-name index once per stream list. Doing the
  // normalisation per-keystroke across thousands of titles would block the
  // JS thread; this caches the costly NFD/regex work and lets each search
  // be a cheap String.includes() over already-normalised values.
  const normalisedSection = useMemo(
    () => allSectionStreams.map((s) => ({ s, n: normaliseSearch(s.name) })),
    [allSectionStreams],
  );

  // Search results — searches entire section, not just current category.
  // Punctuation/accents/case are ignored so e.g. "ru pauls drag race"
  // matches "RuPaul's Drag Race".
  const searchResults: ContentItem[] = useMemo(() => {
    if (!trimmedQuery) return [];
    const out: ContentItem[] = [];
    for (const { s, n } of normalisedSection) {
      if (n.includes(trimmedQuery)) {
        out.push(s);
        if (out.length >= SEARCH_LIMIT) break;
      }
    }
    return out;
  }, [trimmedQuery, normalisedSection]);

  const fullDisplayContent = isSearching ? searchResults : categoryContent;

  // Reset progressive limit whenever the underlying list identity changes
  // (category switch, search, type change, special view toggle). Then ramp
  // it up on requestAnimationFrame + setTimeout so the bumps land AFTER
  // the first paint and don't compete with it for the JS thread.
  useEffect(() => {
    setRenderLimit(PROGRESSIVE_STEPS[0]);
    if (fullDisplayContent.length <= PROGRESSIVE_STEPS[0]) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let raf: number | null = null;
    const schedule = (i: number, delay: number) => {
      timers.push(setTimeout(() => {
        if (cancelled) return;
        setRenderLimit(PROGRESSIVE_STEPS[i]);
      }, delay));
    };
    raf = requestAnimationFrame(() => {
      if (cancelled) return;
      schedule(1, 32);   // ~1 frame after paint
      schedule(2, 120);
      schedule(3, 280);
      schedule(4, 600);
    });
    return () => {
      cancelled = true;
      if (raf !== null) cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
  }, [selectedCategoryId, isSearching, type, isFavouritesView, isRecentlyView, fullDisplayContent.length]);

  const displayContent = useMemo(
    () => fullDisplayContent.slice(0, renderLimit),
    [fullDisplayContent, renderLimit],
  );

  const handleItemPress = useCallback((item: ContentItem) => {
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
      navigation.navigate("MovieInfo", {
        streamId: s.stream_id,
        name: s.name,
        streamIcon: s.stream_icon ?? undefined,
        containerExtension: s.container_extension,
        categoryId: s.category_id,
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
  }, [type, selectedCategoryId, navigation, getBySeriesId]);

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

  const handleLongPress = useCallback((item: ContentItem) => {
    if (isSearching) return;
    const streamId = getStreamId(item, type);
    toggleFavourite({
      streamId,
      streamType: type as "live" | "movies" | "series",
      streamName: item.name,
      streamIcon: getIconUrl(item),
      categoryId: "category_id" in item ? (item as any).category_id : null,
    });
  }, [isSearching, type, toggleFavourite]);

  // Edit-mode action: delete from fav/recent lists, or toggle favourite on
  // normal categories. Single tap on a focused card — fully D-pad-friendly.
  const handleEditPress = useCallback(
    (item: ContentItem) => {
      const streamId = getStreamId(item, type);
      if (isFavouritesView) {
        toggleFavourite({
          streamId,
          streamType: type as "live" | "movies" | "series",
          streamName: item.name,
          streamIcon: getIconUrl(item),
          categoryId: "category_id" in item ? (item as any).category_id : null,
        });
        return;
      }
      if (isRecentlyView) {
        const entry =
          type === "series"
            ? getBySeriesId((item as Series).series_id)
            : getByStreamId(streamId);
        if (entry) removeWatchEntry(entry.id);
        return;
      }
      // Normal category: Manage = toggle favourite (TV-remote friendly)
      toggleFavourite({
        streamId,
        streamType: type as "live" | "movies" | "series",
        streamName: item.name,
        streamIcon: getIconUrl(item),
        categoryId: "category_id" in item ? (item as any).category_id : null,
      });
    },
    [type, isFavouritesView, isRecentlyView, toggleFavourite, getByStreamId, getBySeriesId, removeWatchEntry],
  );

  // Auto-exit edit mode whenever the category changes — semantics differ
  // between Favourites/Recently Watched (delete) and a normal category
  // (favourite toggle), so the user explicitly opts in per category.
  useEffect(() => {
    setEditMode(false);
  }, [selectedCategoryId, type]);

  // Also exit if the current view becomes invalid for edit mode
  useEffect(() => {
    if (!editMode) return;
    if (isSearching || isRecentlyAddedView || categoryContent.length === 0) {
      setEditMode(false);
    }
  }, [editMode, isSearching, isRecentlyAddedView, categoryContent.length]);

  const editAction: "delete" | "favourite" =
    isFavouritesView || isRecentlyView ? "delete" : "favourite";

  // O(1) favourite lookup per card. Built once per favourites change instead
  // of running an O(n) `favourites.some()` inside every visible card on every
  // re-render — a major win when scrolling through a long list with many
  // favourites stored.
  const favIdSet = useMemo(() => {
    const set = new Set<number>();
    for (const f of getFavouritesByType(type as "live" | "movies" | "series")) {
      set.add(f.stream_id);
    }
    return set;
  }, [getFavouritesByType, type]);

  const getItemId = useCallback((item: ContentItem) => {
    if ("stream_id" in item) return String((item as LiveStream | VodStream).stream_id);
    if ("series_id" in item) return String((item as Series).series_id);
    return String(item.num);
  }, []);

  // Stable per-card handlers so React.memo on ContentCard actually skips
  // re-renders. Without these, every parent state change (focus on any other
  // card, search keystroke, etc.) would create new arrow functions and
  // re-render every visible card — the root cause of the "selector lags
  // behind scrolling" feeling on TV remotes.
  const onCardPress = useCallback(
    (item: ContentItem) => (editMode ? handleEditPress(item) : handleItemPress(item)),
    [editMode, handleEditPress, handleItemPress],
  );

  // Row height for FlatList — lets it skip per-row measurement and locate
  // any row instantly. Crucial for TV focus auto-scroll: when the focused
  // card moves off-screen the list jumps to the right offset on the same
  // frame instead of measuring rows progressively.
  const rowHeight = cardTotalH + gap;
  const getItemLayout = useCallback(
    (_data: ArrayLike<ContentItem> | null | undefined, index: number) => {
      const row = Math.floor(index / Math.max(1, numColumns));
      return { length: rowHeight, offset: row * rowHeight + Spacing.xs, index };
    },
    [rowHeight, numColumns],
  );

  const renderContentItem = useCallback(
    ({ item }: { item: ContentItem }) => {
      const sid = getStreamId(item, type);
      const watchEntry =
        type === "series"
          ? getBySeriesId((item as Series).series_id)
          : type !== "live"
            ? getByStreamId(sid)
            : undefined;
      return (
        <ContentCard
          item={item}
          type={type}
          onPress={onCardPress}
          onLongPress={handleLongPress}
          isFavourited={!isSearching && favIdSet.has(sid)}
          cardWidth={cardWidth}
          cardHeight={cardTotalH}
          watchEntry={watchEntry}
          editMode={editMode && !isSearching}
          editAction={editAction}
        />
      );
    },
    [
      type, onCardPress, handleLongPress, isSearching, favIdSet,
      cardWidth, cardTotalH, editMode, editAction, getByStreamId, getBySeriesId,
    ],
  );

  // Stable sidebar press handler — referenced by every sidebar item so
  // CategorySidebarItem (memo'd) doesn't re-render when an unrelated
  // sibling gains focus.
  const handleSidebarPress = useCallback(
    (item: SidebarCat) => {
      if (item.category_id === selectedCategoryId) return;
      setCategorySwitching(true);
      const nextId = item.category_id;
      const nextName = item.category_name;
      requestAnimationFrame(() => {
        setSelectedCategoryId(nextId);
        setSelectedCategoryName(nextName);
      });
    },
    [selectedCategoryId],
  );

  const renderSidebarItem = useCallback(
    ({ item }: { item: SidebarCat }) => (
      <CategorySidebarItem
        item={item}
        isSelected={item.category_id === selectedCategoryId}
        isFav={item.category_id === "favourites"}
        isRecent={item.category_id === "recently"}
        onPress={handleSidebarPress}
      />
    ),
    [selectedCategoryId, handleSidebarPress],
  );

  const sectionPlaceholder =
    type === "live" ? "Search all live channels..." :
    type === "movies" ? "Search all movies..." :
    "Search all series...";

  const countDisplay = isSearching ? searchResults.length : fullDisplayContent.length;

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
              <ModalBtn
                kind="cancel"
                onPress={() => setShowClearConfirm(false)}
                disabled={clearing}
              >
                <ThemedText style={styles.modalBtnCancelText}>Cancel</ThemedText>
              </ModalBtn>
              <ModalBtn
                kind="confirm"
                onPress={handleClearAll}
                disabled={clearing}
              >
                {clearing
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <ThemedText style={styles.modalBtnConfirmText}>Clear All</ThemedText>}
              </ModalBtn>
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
        {(type === "movies" || type === "series") ? (
          <RequestsBtn onPress={() => navigation.navigate("ContentRequests")} />
        ) : null}
        <RefreshBtn onPress={handleRefresh} refreshing={isSyncing} />
        {!isSearching && !isRecentlyAddedView && categoryContent.length > 0 ? (
          <ManageBtn
            active={editMode}
            onPress={() => setEditMode((v) => !v)}
          />
        ) : null}
        {(isFavouritesView || isRecentlyView) && !isSearching ? (
          <ClearAllButton onPress={() => setShowClearConfirm(true)} />
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
            renderItem={renderSidebarItem}
            initialNumToRender={20}
            maxToRenderPerBatch={20}
            // Same reasoning as the content list below — keep the next
            // sidebar row mounted so D-pad focus moves on the first press
            // and never leaves a black gap during fast scrolling.
            windowSize={21}
            removeClippedSubviews={false}
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

          {categorySwitching ? (
            // Blank content area while switching — old list is unmounted so
            // it visually clears immediately, then the new content fades in.
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={Colors.dark.accent} />
            </View>
          ) : isFavouritesView && !isSearching && categoryContent.length === 0 ? (
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
              initialNumToRender={type === "live" ? 16 : 12}
              maxToRenderPerBatch={type === "live" ? 16 : 12}
              updateCellsBatchingPeriod={32}
              // Wider render window + clipped-subviews disabled means the
              // next row is already mounted (and focusable) when the user
              // presses D-pad down at the bottom of the visible window —
              // focus moves IMMEDIATELY on the same press, instead of the
              // list scrolling first and only moving focus on the next
              // press. Disabling removeClippedSubviews on Android also
              // stops the "black gap" flicker during fast scrolling — the
              // native side was unmounting visible rows too aggressively
              // and the next batch hadn't mounted yet, leaving black
              // rectangles where cards should be.
              windowSize={21}
              removeClippedSubviews={false}
              getItemLayout={getItemLayout}
              renderItem={renderContentItem}
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
  manageBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: "rgba(255,102,0,0.35)",
    backgroundColor: "rgba(255,102,0,0.08)",
  },
  manageBtnActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: "rgba(255,102,0,0.18)",
  },
  manageBtnOn: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  manageBtnOnActive: {
    opacity: 0.9,
  },
  manageBtnText: { fontSize: 12, fontWeight: "700", color: Colors.dark.accent },
  manageBtnTextOn: { color: "#fff" },
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
  cardEditDelete: {
    borderColor: "rgba(255,59,59,0.55)",
  },
  cardEditDeleteActive: {
    borderColor: Colors.dark.error,
    shadowColor: Colors.dark.error, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85, shadowRadius: 14, elevation: 10,
  },
  cardEditFavActive: {
    borderColor: "#FFD700",
    shadowColor: "#FFD700", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85, shadowRadius: 14, elevation: 10,
  },
  deleteBadge: {
    position: "absolute", top: 6, right: 6,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.dark.error,
    justifyContent: "center", alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.6, shadowRadius: 3, elevation: 6,
    zIndex: 5,
  },
  editFavBadge: {
    position: "absolute", top: 6, right: 6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.dark.accent,
    justifyContent: "center", alignItems: "center",
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1, shadowRadius: 6, elevation: 6,
    zIndex: 5,
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
