import React, { useEffect, useState } from "react";
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

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ContentListRouteProp = RouteProp<RootStackParamList, "ContentList">;
type ContentItem = LiveStream | VodStream | Series;

export default function ContentListScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ContentListRouteProp>();
  const { type, categoryId, categoryName } = route.params;
  const { width } = useWindowDimensions();

  const [content, setContent] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const padH = Math.max(insets.left + Spacing.sm, Spacing.md);
  const padT = Math.max(insets.top + Spacing.sm, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.sm, Spacing.md);
  const cardGap = Spacing.sm;

  const numColumns = Math.max(2, Math.floor(width / 160));
  const totalPad = padH * 2 + cardGap * (numColumns - 1);
  const cardWidth = Math.floor((width - totalPad) / numColumns);

  useEffect(() => {
    loadContent();
  }, [type, categoryId]);

  const loadContent = async () => {
    setIsLoading(true);
    setError("");
    try {
      let data: ContentItem[] = [];
      switch (type) {
        case "live": data = await xtreamApi.getLiveStreams(categoryId); break;
        case "movies": data = await xtreamApi.getVodStreams(categoryId); break;
        case "series": data = await xtreamApi.getSeries(categoryId); break;
      }
      setContent(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load content");
    } finally {
      setIsLoading(false);
    }
  };

  const handleItemPress = (item: ContentItem) => {
    if (type === "live") {
      const liveItem = item as LiveStream;
      navigation.navigate("Player", {
        streamUrl: xtreamApi.getLiveStreamUrl(liveItem.stream_id),
        title: liveItem.name,
        type: "live",
      });
    } else if (type === "movies") {
      const vodItem = item as VodStream;
      navigation.navigate("Player", {
        streamUrl: xtreamApi.getVodStreamUrl(vodItem.stream_id, vodItem.container_extension),
        title: vodItem.name,
        type: "vod",
      });
    } else if (type === "series") {
      const seriesItem = item as Series;
      navigation.navigate("SeriesDetail", {
        seriesId: seriesItem.series_id,
        seriesName: seriesItem.name,
        cover: seriesItem.cover,
      });
    }
  };

  const getItemImage = (item: ContentItem): string | null => {
    if ("stream_icon" in item && item.stream_icon) return item.stream_icon;
    if ("cover" in item && item.cover) return item.cover;
    return null;
  };

  const getItemId = (item: ContentItem): string => {
    if ("stream_id" in item) return String(item.stream_id);
    if ("series_id" in item) return String(item.series_id);
    return String(item.num);
  };

  const renderItem = ({ item }: { item: ContentItem }) => {
    const imageUrl = getItemImage(item);
    const iconName = type === "live" ? "tv" : type === "movies" ? "film" : "grid";
    return (
      <Pressable
        style={({ pressed }) => [
          styles.contentCard,
          { width: cardWidth },
          pressed && styles.contentCardPressed,
        ]}
        onPress={() => handleItemPress(item)}
      >
        <View style={[styles.imageContainer, { width: cardWidth, height: cardWidth * 0.56 }]}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.contentImage}
              contentFit="cover"
              placeholder={require("../../assets/images/icon.png")}
              transition={200}
            />
          ) : (
            <View style={styles.placeholderImage}>
              <Feather name={iconName} size={24} color={Colors.dark.textSecondary} />
            </View>
          )}
        </View>
        <View style={styles.contentInfo}>
          <ThemedText style={styles.contentName} numberOfLines={2}>
            {item.name}
          </ThemedText>
          {"rating" in item && item.rating ? (
            <View style={styles.ratingContainer}>
              <Feather name="star" size={11} color={Colors.dark.accent} />
              <ThemedText style={styles.ratingText}>{item.rating}</ThemedText>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={styles.loadingText}>Loading content...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centered}>
          <Feather name="alert-circle" size={40} color={Colors.dark.error} />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <Pressable style={styles.retryButton} onPress={loadContent}>
            <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={22} color={Colors.dark.text} />
        </Pressable>
        <ThemedText type="h3" style={styles.headerTitle} numberOfLines={1}>
          {categoryName}
        </ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={content}
        renderItem={renderItem}
        keyExtractor={getItemId}
        numColumns={numColumns}
        key={`cols-${numColumns}`}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: padB, paddingHorizontal: padH },
        ]}
        columnWrapperStyle={numColumns > 1 ? { gap: cardGap, marginBottom: cardGap } : undefined}
        showsVerticalScrollIndicator={false}
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
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    justifyContent: "center",
    alignItems: "center",
  },
  iconBtnPressed: {
    opacity: 0.7,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  headerTitle: {
    flex: 1,
    color: Colors.dark.text,
  },
  headerSpacer: {
    width: 40,
  },
  listContent: {
    paddingTop: Spacing.sm,
  },
  contentCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  contentCardPressed: {
    borderColor: Colors.dark.accent,
    opacity: 0.9,
  },
  imageContainer: {
    overflow: "hidden",
  },
  contentImage: {
    width: "100%",
    height: "100%",
  },
  placeholderImage: {
    width: "100%",
    height: "100%",
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  contentInfo: {
    padding: Spacing.sm,
  },
  contentName: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: "500",
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xs,
    gap: Spacing.xs,
  },
  ratingText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.dark.textSecondary,
  },
  errorText: {
    color: Colors.dark.error,
    textAlign: "center",
  },
  retryButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.accent,
    borderRadius: BorderRadius.sm,
  },
  retryButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
});
