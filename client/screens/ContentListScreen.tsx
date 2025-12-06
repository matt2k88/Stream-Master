import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
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

  const [content, setContent] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadContent();
  }, [type, categoryId]);

  const loadContent = async () => {
    setIsLoading(true);
    setError("");
    try {
      let data: ContentItem[] = [];
      switch (type) {
        case "live":
          data = await xtreamApi.getLiveStreams(categoryId);
          break;
        case "movies":
          data = await xtreamApi.getVodStreams(categoryId);
          break;
        case "series":
          data = await xtreamApi.getSeries(categoryId);
          break;
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
      const streamUrl = xtreamApi.getLiveStreamUrl(liveItem.stream_id);
      navigation.navigate("Player", {
        streamUrl,
        title: liveItem.name,
        type: "live",
      });
    } else if (type === "movies") {
      const vodItem = item as VodStream;
      const streamUrl = xtreamApi.getVodStreamUrl(
        vodItem.stream_id,
        vodItem.container_extension
      );
      navigation.navigate("Player", {
        streamUrl,
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
    if ("stream_icon" in item && item.stream_icon) {
      return item.stream_icon;
    }
    if ("cover" in item && item.cover) {
      return item.cover;
    }
    return null;
  };

  const getItemName = (item: ContentItem): string => {
    return item.name;
  };

  const getItemId = (item: ContentItem): string => {
    if ("stream_id" in item) {
      return String(item.stream_id);
    }
    if ("series_id" in item) {
      return String(item.series_id);
    }
    return String(item.num);
  };

  const renderItem = ({ item }: { item: ContentItem }) => {
    const imageUrl = getItemImage(item);

    return (
      <Pressable
        style={({ pressed }) => [
          styles.contentCard,
          pressed && styles.contentCardPressed,
        ]}
        onPress={() => handleItemPress(item)}
      >
        <View style={styles.imageContainer}>
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
              <Feather
                name={type === "live" ? "tv" : type === "movies" ? "film" : "grid"}
                size={32}
                color={Colors.dark.textSecondary}
              />
            </View>
          )}
        </View>
        <View style={styles.contentInfo}>
          <ThemedText type="body" style={styles.contentName} numberOfLines={2}>
            {getItemName(item)}
          </ThemedText>
          {"rating" in item && item.rating ? (
            <View style={styles.ratingContainer}>
              <Feather name="star" size={14} color={Colors.dark.accent} />
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
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={styles.loadingText}>Loading content...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.errorContainer}>
          <Feather name="alert-circle" size={48} color={Colors.dark.error} />
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
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Spacing.lg,
            paddingHorizontal: insets.left + Spacing.tvSafeZone,
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.backButtonPressed,
          ]}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={24} color={Colors.dark.text} />
        </Pressable>
        <ThemedText type="h2" style={styles.headerTitle} numberOfLines={1}>
          {categoryName}
        </ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={content}
        renderItem={renderItem}
        keyExtractor={getItemId}
        numColumns={5}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingBottom: insets.bottom + Spacing.tvSafeZone,
            paddingHorizontal: insets.left + Spacing.tvSafeZone,
          },
        ]}
        columnWrapperStyle={styles.columnWrapper}
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
    paddingBottom: Spacing.lg,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.lg,
  },
  backButtonPressed: {
    opacity: 0.7,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  headerTitle: {
    flex: 1,
    color: Colors.dark.text,
  },
  headerSpacer: {
    width: 48,
  },
  listContent: {
    paddingTop: Spacing.lg,
  },
  columnWrapper: {
    justifyContent: "flex-start",
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  contentCard: {
    width: 180,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    ...Shadows.card,
  },
  contentCardPressed: {
    transform: [{ scale: 1.03 }],
    borderColor: Colors.dark.accent,
  },
  imageContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
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
    padding: Spacing.md,
  },
  contentName: {
    color: Colors.dark.text,
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xs,
  },
  ratingText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    marginLeft: Spacing.xs,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.lg,
    color: Colors.dark.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.tvSafeZone,
  },
  errorText: {
    color: Colors.dark.error,
    marginTop: Spacing.lg,
    textAlign: "center",
  },
  retryButton: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing["2xl"],
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.accent,
    borderRadius: BorderRadius.sm,
  },
  retryButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
});
