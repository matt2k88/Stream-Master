import React, { useState, useMemo, useRef } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { xtreamApi, LiveStream, VodStream, Series } from "@/lib/xtream-api";
import { useData } from "@/contexts/DataContext";
import { useFavourites } from "@/contexts/FavouritesContext";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ContentListRouteProp = RouteProp<RootStackParamList, "ContentList">;
type ContentItem = LiveStream | VodStream | Series;

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
}: {
  item: ContentItem;
  type: string;
  onPress: () => void;
  onLongPress: () => void;
  isFavourited: boolean;
  cardWidth: number;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;

  const imageUrl = getIconUrl(item);
  const iconName = type === "live" ? "tv" : type === "movies" ? "film" : "grid";
  const imgH = Math.round(cardWidth * getImageRatio(type));
  const imgFit = getImageFit(type);

  return (
    <Pressable
      style={[styles.card, { width: cardWidth }, isActive && styles.cardActive, isFavourited && styles.cardFavourited]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {/* Thumbnail */}
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
      </View>

      {/* Info */}
      <View style={styles.cardInfo}>
        <ThemedText
          style={[styles.cardName, isActive && styles.cardNameActive]}
          numberOfLines={2}
        >
          {item.name}
        </ThemedText>
        {"rating" in item && item.rating ? (
          <View style={styles.ratingRow}>
            <Feather name="star" size={10} color={Colors.dark.accent} />
            <ThemedText style={styles.ratingText}>{item.rating}</ThemedText>
          </View>
        ) : null}
      </View>

      {isActive ? <View style={styles.activeBar} /> : null}
    </Pressable>
  );
}

export default function ContentListScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ContentListRouteProp>();
  const { type, categoryId, categoryName } = route.params;
  const { width, height } = useWindowDimensions();
  const { liveStreams, vodStreams, seriesList, isSyncing } = useData();
  const { isFavourite, toggleFavourite, getFavouritesByType } = useFavourites();

  const padH = Math.max(insets.left + Spacing.xs, Spacing.md);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.sm);
  const gap = Spacing.sm;

  const isFavouritesView = categoryId === "favourites";

  const defaultCols = type === "live"
    ? Math.max(3, Math.floor(width / 150))
    : Math.max(3, Math.floor(width / 130));
  const numColumns = defaultCols;
  const cardWidth = Math.floor((width - padH * 2 - gap * (numColumns - 1)) / numColumns);

  const content: ContentItem[] = useMemo(() => {
    if (isFavouritesView) {
      // Filter full stream list by favourited IDs for this type
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
    switch (type) {
      case "live": return liveStreams.filter((s) => s.category_id === categoryId);
      case "movies": return vodStreams.filter((s) => s.category_id === categoryId);
      case "series": return seriesList.filter((s) => s.category_id === categoryId);
      default: return [];
    }
  }, [type, categoryId, isFavouritesView, liveStreams, vodStreams, seriesList, getFavouritesByType]);

  const handleItemPress = (item: ContentItem) => {
    if (type === "live") {
      const s = item as LiveStream;
      navigation.navigate("Player", {
        streamUrl: xtreamApi.getLiveStreamUrl(s.stream_id),
        title: s.name,
        type: "live",
      });
    } else if (type === "movies") {
      const s = item as VodStream;
      navigation.navigate("Player", {
        streamUrl: xtreamApi.getVodStreamUrl(s.stream_id, s.container_extension),
        title: s.name,
        type: "vod",
      });
    } else {
      const s = item as Series;
      navigation.navigate("SeriesDetail", {
        seriesId: s.series_id,
        seriesName: s.name,
        cover: s.cover,
      });
    }
  };

  const handleLongPress = (item: ContentItem) => {
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

  if (isSyncing && content.length === 0 && !isFavouritesView) {
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
      {/* Header */}
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={20} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.headerTitleRow}>
          {isFavouritesView ? (
            <Feather name="star" size={16} color={Colors.dark.accent} />
          ) : null}
          <ThemedText style={styles.headerTitle} numberOfLines={1}>
            {categoryName}
          </ThemedText>
        </View>
        <View style={styles.countBadge}>
          <ThemedText style={styles.countText}>{content.length}</ThemedText>
        </View>
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      {isFavouritesView && content.length === 0 ? (
        <View style={styles.centered}>
          <Feather name="star" size={44} color={Colors.dark.border} />
          <ThemedText style={styles.emptyTitle}>No Favourites Yet</ThemedText>
          <ThemedText style={styles.emptyText}>
            Hold any item to add it to your favourites
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={content}
          keyExtractor={getItemId}
          numColumns={numColumns}
          key={`content-${type}-${numColumns}`}
          contentContainerStyle={{
            paddingHorizontal: padH,
            paddingTop: Spacing.sm,
            paddingBottom: padB,
            gap,
          }}
          columnWrapperStyle={numColumns > 1 ? { gap } : undefined}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ContentCard
              item={item}
              type={type}
              onPress={() => handleItemPress(item)}
              onLongPress={() => handleLongPress(item)}
              isFavourited={isFavourite(getStreamId(item, type), type)}
              cardWidth={cardWidth}
            />
          )}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Feather name="inbox" size={36} color={Colors.dark.border} />
              <ThemedText style={styles.emptyText}>No content in this category</ThemedText>
            </View>
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingBottom: Spacing.md, gap: Spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  backBtnPressed: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  headerTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  headerTitle: { fontSize: 18, fontWeight: "700", color: Colors.dark.text, flex: 1 },
  countBadge: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    minWidth: 38, alignItems: "center",
  },
  countText: { fontSize: 12, color: Colors.dark.textSecondary, textAlign: "center" },
  divider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.sm },
  card: {
    flex: 1, backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm, overflow: "hidden",
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  cardActive: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 14, elevation: 10,
  },
  cardFavourited: {
    borderColor: "rgba(255,102,0,0.45)",
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
  cardInfo: { padding: Spacing.sm, gap: 2 },
  cardName: { color: Colors.dark.textSecondary, fontSize: 11, fontWeight: "500", lineHeight: 15 },
  cardNameActive: { color: Colors.dark.text },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 1 },
  ratingText: { color: Colors.dark.textSecondary, fontSize: 10 },
  activeBar: {
    height: 2, backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 4,
  },
  centered: {
    flex: 1, justifyContent: "center", alignItems: "center",
    gap: Spacing.md, paddingTop: Spacing["4xl"],
  },
  emptyTitle: { color: Colors.dark.text, fontSize: 16, fontWeight: "700" },
  emptyText: { color: Colors.dark.textSecondary, fontSize: 14, textAlign: "center", paddingHorizontal: Spacing.xl },
  loadingText: { color: Colors.dark.textSecondary, fontSize: 14 },
});
