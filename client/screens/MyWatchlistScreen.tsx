import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
const AnyFlashList = FlashList as any;
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
import { useData } from "@/contexts/DataContext";
import { useCategoryOrder } from "@/contexts/CategoryOrderContext";
import { useWatchlist, type WatchlistItem } from "@/contexts/WatchlistContext";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteP = RouteProp<RootStackParamList, "MyWatchlist">;

const TMDB_IMG_W500 = "https://image.tmdb.org/t/p/w500";

const SIDEBAR_W = 170;
const CONTENT_PAD = Spacing.md;

function posterUriOf(item: WatchlistItem): string | null {
  const d = item.content_data ?? {};
  if (d.poster) return d.poster as string;
  if (d.poster_path) {
    const p = String(d.poster_path).startsWith("/") ? d.poster_path : `/${d.poster_path}`;
    return `${TMDB_IMG_W500}${p}`;
  }
  return null;
}

function titleOf(item: WatchlistItem): string {
  const d: any = item.content_data ?? {};
  return d.name || d.title || "Untitled";
}

function HeaderBtn({
  icon,
  label,
  onPress,
  active,
}: {
  icon: keyof typeof Feather.glyphMap;
  label?: string;
  onPress: () => void;
  active?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isActive = focused || pressed || hovered || !!active;
  return (
    <Pressable
      style={[
        styles.headerBtn,
        isActive && styles.headerBtnActive,
        label ? { flexDirection: "row", paddingHorizontal: Spacing.sm, gap: 6, width: undefined } : null,
      ]}
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
      <Feather name={icon} size={18} color={isActive ? Colors.dark.accent : Colors.dark.text} />
      {label ? (
        <ThemedText style={{ color: isActive ? Colors.dark.accent : Colors.dark.text, fontWeight: "700", fontSize: 12 }}>
          {label}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

function SidebarRow({
  label,
  active,
  pinned,
  icon,
  onPress,
}: {
  label: string;
  active: boolean;
  pinned?: boolean;
  icon?: keyof typeof Feather.glyphMap;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const interacting = focused || hovered || pressed;
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.sideRow,
        (active || interacting) && styles.sideRowActive,
      ]}
    >
      {(active || interacting) ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.22)", "rgba(255,102,0,0.04)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      ) : null}
      {icon ? (
        <Feather
          name={icon}
          size={13}
          color={active ? Colors.dark.accent : interacting ? Colors.dark.accent : Colors.dark.textSecondary}
          style={{ marginRight: 6 }}
        />
      ) : null}
      <ThemedText
        numberOfLines={1}
        style={[
          styles.sideRowText,
          active && styles.sideRowTextActive,
          interacting && !active && { color: Colors.dark.accent },
          pinned && { fontWeight: "700" },
        ]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

function WatchlistCard({
  item,
  width,
  imgH,
  onPress,
  onLongPress,
}: {
  item: WatchlistItem;
  width: number;
  imgH: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const active = focused || hovered || pressed;
  const uri = posterUriOf(item);
  const watched = item.status === "watched";
  return (
    <Pressable
      style={[
        styles.card,
        { width },
        active && styles.cardActive,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      <View style={[styles.cardImgWrap, { height: imgH }]}>
        {uri ? (
          <Image source={{ uri }} style={styles.cardImg} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.cardImg, styles.cardImgPlaceholder]}>
            <Feather name={item.content_type === "series" ? "grid" : "film"} size={32} color={Colors.dark.border} />
          </View>
        )}
        <View style={[styles.statusPill, watched ? styles.statusPillWatched : styles.statusPillUnwatched]}>
          <Feather
            name={watched ? "check" : "bookmark"}
            size={10}
            color={watched ? "#7CFF7C" : Colors.dark.accent}
          />
          <ThemedText style={[styles.statusText, { color: watched ? "#7CFF7C" : Colors.dark.accent }]}>
            {watched ? "WATCHED" : "WATCHLIST"}
          </ThemedText>
        </View>
      </View>
      <ThemedText numberOfLines={2} style={styles.cardTitle}>{titleOf(item)}</ThemedText>
    </Pressable>
  );
}

export default function MyWatchlistScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteP>();
  const { type } = route.params;
  const { width, height } = useWindowDimensions();

  const { vodCategories, seriesCategories } = useData();
  const { applyOrder } = useCategoryOrder();
  const { items, isLoading, refresh, setStatus } = useWatchlist();

  const watchlistType: "movie" | "series" = type === "series" ? "series" : "movie";

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const filtered = useMemo(
    () => items.filter((i) => i.content_type === watchlistType),
    [items, watchlistType],
  );

  // Sidebar — show watchlist as the active virtual category, plus all real
  // categories so users can jump back into the regular grid quickly.
  const realCategories = useMemo(() => {
    const list = type === "movies" ? vodCategories : seriesCategories;
    return applyOrder(type, list).map((c) => ({ category_id: c.category_id, category_name: c.category_name }));
  }, [type, vodCategories, seriesCategories, applyOrder]);

  const padH = Math.max(insets.left + Spacing.xs, Spacing.md);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.sm);

  const contentWidth = Math.max(0, width - SIDEBAR_W - padH * 2);
  const numColumns = Math.max(2, Math.floor(contentWidth / 140));
  const gap = Spacing.sm;
  const cardWidth = Math.floor((contentWidth - CONTENT_PAD * 2 - gap * (numColumns - 1)) / numColumns);
  const cardImgH = Math.round(cardWidth * 1.5);

  const handleCardPress = useCallback(
    (item: WatchlistItem) => {
      const d: any = item.content_data ?? {};
      const sid = item.content_type === "series" ? (d.series_id ?? d.stream_id) : d.stream_id;
      if (sid == null) return; // TMDB-only row, no in-app navigation
      if (item.content_type === "movie") {
        navigation.navigate("MovieInfo", {
          streamId: Number(sid),
          name: titleOf(item),
          streamIcon: posterUriOf(item) ?? undefined,
        });
      } else {
        navigation.navigate("SeriesDetail", {
          seriesId: Number(sid),
          seriesName: titleOf(item),
          cover: posterUriOf(item) ?? "",
        });
      }
    },
    [navigation],
  );

  const handleCardLongPress = useCallback(
    (item: WatchlistItem) => {
      // Long-press toggles watched/unwatched status. Long-press is the
      // standard "secondary action" gesture in the rest of the app and
      // works on both touch and TV remote (long OK).
      setStatus(item.id, item.status === "watched" ? "unwatched" : "watched");
    },
    [setStatus],
  );

  const renderCard = ({ item }: { item: WatchlistItem }) => (
    <View style={{ width: cardWidth, marginRight: gap, marginBottom: gap }}>
      <WatchlistCard
        item={item}
        width={cardWidth}
        imgH={cardImgH}
        onPress={() => handleCardPress(item)}
        onLongPress={() => handleCardLongPress(item)}
      />
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <HeaderBtn icon="arrow-left" onPress={() => navigation.goBack()} />
        <View style={styles.headerTitleRow}>
          <Feather name="bookmark" size={16} color={Colors.dark.accent} />
          <ThemedText style={styles.headerTitle} numberOfLines={1}>
            My Watchlist · {type === "movies" ? "Movies" : "Series"}
          </ThemedText>
        </View>
        <View style={styles.countBadge}>
          <ThemedText style={styles.countText}>{filtered.length}</ThemedText>
        </View>
        <HeaderBtn icon="refresh-cw" onPress={refresh} />
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      <View style={styles.body}>
        {/* Sidebar */}
        <View style={[styles.sidebar, { paddingLeft: Math.max(insets.left, Spacing.xs), paddingBottom: padB }]}>
          <AnyFlashList
            data={[
              { key: "watchlist", label: "Watchlist", pinned: true, icon: "bookmark" as keyof typeof Feather.glyphMap | undefined },
              ...realCategories.map((c) => ({ key: c.category_id, label: c.category_name, pinned: false, icon: undefined as keyof typeof Feather.glyphMap | undefined })),
            ]}
            estimatedItemSize={36}
            keyExtractor={(it: any) => it.key}
            renderItem={({ item }: { item: any }) => (
              <SidebarRow
                label={item.label}
                active={item.key === "watchlist"}
                pinned={item.pinned}
                icon={item.icon}
                onPress={() => {
                  if (item.key === "watchlist") return;
                  navigation.replace("ContentList", {
                    type,
                    categoryId: item.key,
                    categoryName: item.label,
                  });
                }}
              />
            )}
          />
        </View>

        {/* Main */}
        <View style={[styles.main, { paddingHorizontal: CONTENT_PAD, paddingBottom: padB }]}>
          {isLoading && filtered.length === 0 ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={Colors.dark.accent} />
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.centered}>
              <Feather name="bookmark" size={42} color={Colors.dark.border} />
              <ThemedText style={styles.emptyTitle}>Your watchlist is empty</ThemedText>
              <ThemedText style={styles.emptyHint}>
                Open a {type === "movies" ? "movie" : "series"} and tap the bookmark icon to save it here.
              </ThemedText>
            </View>
          ) : (
            <AnyFlashList
              key={`grid-${numColumns}`}
              data={filtered}
              numColumns={numColumns}
              estimatedItemSize={cardImgH + 60}
              keyExtractor={(it: WatchlistItem) => it.id}
              renderItem={renderCard}
              contentContainerStyle={{ paddingTop: Spacing.md }}
            />
          )}
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingBottom: Spacing.sm },
  headerTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: Colors.dark.text, flexShrink: 1 },
  countBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    backgroundColor: "rgba(255,102,0,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
  },
  countText: { color: Colors.dark.accent, fontWeight: "700", fontSize: 12 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.dark.border },

  headerBtn: {
    height: 36,
    width: 36,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundDefault,
    overflow: "hidden",
  },
  headerBtnActive: { borderColor: Colors.dark.accent },

  body: { flex: 1, flexDirection: "row" },

  sidebar: { width: SIDEBAR_W, paddingTop: Spacing.sm, paddingRight: Spacing.xs },
  sideRow: {
    minHeight: 32,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    marginBottom: 4,
    borderRadius: BorderRadius.sm,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  sideRowActive: { borderWidth: 1, borderColor: "rgba(255,102,0,0.6)" },
  sideRowText: { fontSize: 12, color: Colors.dark.textSecondary, flex: 1 },
  sideRowTextActive: { color: Colors.dark.accent, fontWeight: "700" },

  main: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.lg, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: Colors.dark.text, marginTop: Spacing.sm },
  emptyHint: { fontSize: 12, color: Colors.dark.textSecondary, textAlign: "center", maxWidth: 320 },

  card: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: "transparent",
  },
  cardActive: { borderColor: Colors.dark.accent },
  cardImgWrap: { position: "relative", borderTopLeftRadius: BorderRadius.md, borderTopRightRadius: BorderRadius.md, overflow: "hidden" },
  cardImg: { width: "100%", height: "100%" },
  cardImgPlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: Colors.dark.backgroundSecondary },
  cardTitle: { fontSize: 12, color: Colors.dark.text, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 8, minHeight: 44 },

  statusPill: {
    position: "absolute",
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.78)",
    borderWidth: 1,
  },
  statusPillUnwatched: { borderColor: "rgba(255,102,0,0.55)" },
  statusPillWatched: { borderColor: "rgba(124,255,124,0.55)" },
  statusText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
});
