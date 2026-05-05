import React, { useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
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

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ContentListRouteProp = RouteProp<RootStackParamList, "ContentList">;
type ContentItem = LiveStream | VodStream | Series;

function ContentCard({
  item,
  type,
  onPress,
  cardWidth,
}: {
  item: ContentItem;
  type: string;
  onPress: () => void;
  cardWidth: number;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;

  const imageUrl =
    "stream_icon" in item && item.stream_icon
      ? item.stream_icon
      : "cover" in item && item.cover
      ? item.cover
      : null;

  const iconName = type === "live" ? "tv" : type === "movies" ? "film" : "grid";
  const imgH = Math.round(cardWidth * 0.56);

  return (
    <Pressable
      style={[styles.card, { width: cardWidth }, isActive && styles.cardActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <View style={{ width: cardWidth, height: imgH, overflow: "hidden" }}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.cardImage}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={styles.cardPlaceholder}>
            <Feather name={iconName} size={22} color={Colors.dark.border} />
          </View>
        )}
        {isActive ? <View style={styles.cardOverlay} /> : null}
      </View>
      <View style={styles.cardInfo}>
        <ThemedText style={[styles.cardName, isActive && styles.cardNameActive]} numberOfLines={2}>
          {item.name}
        </ThemedText>
        {"rating" in item && item.rating ? (
          <View style={styles.rating}>
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
  const { width } = useWindowDimensions();
  const { liveStreams, vodStreams, seriesList, isSyncing } = useData();

  const padH = Math.max(insets.left + Spacing.xs, Spacing.md);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.sm);
  const gap = Spacing.sm;
  const numColumns = Math.max(2, Math.floor(width / 155));
  const cardWidth = Math.floor((width - padH * 2 - gap * (numColumns - 1)) / numColumns);

  const content: ContentItem[] = useMemo(() => {
    switch (type) {
      case "live":
        return liveStreams.filter((s) => s.category_id === categoryId);
      case "movies":
        return vodStreams.filter((s) => s.category_id === categoryId);
      case "series":
        return seriesList.filter((s) => s.category_id === categoryId);
      default:
        return [];
    }
  }, [type, categoryId, liveStreams, vodStreams, seriesList]);

  const handleItemPress = (item: ContentItem) => {
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

  const getItemId = (item: ContentItem) => {
    if ("stream_id" in item) return String(item.stream_id);
    if ("series_id" in item) return String(item.series_id);
    return String(item.num);
  };

  if (isSyncing && content.length === 0) {
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
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={20} color={Colors.dark.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle} numberOfLines={1}>{categoryName}</ThemedText>
        <ThemedText style={styles.countBadge}>{content.length}</ThemedText>
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      <FlatList
        data={content}
        keyExtractor={getItemId}
        numColumns={numColumns}
        key={`content-${numColumns}`}
        contentContainerStyle={{ paddingHorizontal: padH, paddingTop: Spacing.sm, paddingBottom: padB }}
        columnWrapperStyle={numColumns > 1 ? { gap, marginBottom: gap } : undefined}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <ContentCard
            item={item}
            type={type}
            onPress={() => handleItemPress(item)}
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
  },
  backBtnPressed: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accentDim,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  countBadge: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    minWidth: 36,
    textAlign: "center",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cardActive: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 14,
    elevation: 10,
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  cardPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,102,0,0.08)",
  },
  cardInfo: {
    padding: Spacing.sm,
  },
  cardName: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontWeight: "500",
  },
  cardNameActive: {
    color: Colors.dark.text,
  },
  rating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  ratingText: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
  },
  activeBar: {
    height: 2,
    backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
    paddingTop: Spacing["4xl"],
  },
  loadingText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
  },
  emptyText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
  },
});
