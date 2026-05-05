import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
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
import { xtreamApi, SeriesInfo, Episode } from "@/lib/xtream-api";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type SeriesDetailRouteProp = RouteProp<RootStackParamList, "SeriesDetail">;

export default function SeriesDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<SeriesDetailRouteProp>();
  const { seriesId, seriesName, cover } = route.params;
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [seriesInfo, setSeriesInfo] = useState<SeriesInfo | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const padH = Math.max(insets.left + Spacing.sm, Spacing.md);
  const padT = Math.max(insets.top + Spacing.sm, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.sm, Spacing.md);

  useEffect(() => {
    loadSeriesInfo();
  }, [seriesId]);

  const loadSeriesInfo = async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await xtreamApi.getSeriesInfo(seriesId);
      setSeriesInfo(data);
      const seasons = Object.keys(data.episodes || {});
      if (seasons.length > 0) setSelectedSeason(seasons[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load series info");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEpisodePress = (episode: Episode) => {
    navigation.navigate("Player", {
      streamUrl: xtreamApi.getSeriesStreamUrl(episode.id, episode.container_extension),
      title: `${seriesName} - ${episode.title}`,
      type: "series",
    });
  };

  const seasons = seriesInfo ? Object.keys(seriesInfo.episodes || {}) : [];
  const currentEpisodes = selectedSeason && seriesInfo
    ? seriesInfo.episodes[selectedSeason] || []
    : [];

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={styles.loadingText}>Loading series...</ThemedText>
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
          <Pressable style={styles.retryButton} onPress={loadSeriesInfo}>
            <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  const renderEpisode = ({ item: episode }: { item: Episode }) => (
    <Pressable
      key={episode.id}
      style={({ pressed }) => [styles.episodeCard, pressed && styles.episodeCardPressed]}
      onPress={() => handleEpisodePress(episode)}
    >
      <View style={styles.episodeThumbnail}>
        {episode.info?.movie_image ? (
          <Image
            source={{ uri: episode.info.movie_image }}
            style={styles.episodeImage}
            contentFit="cover"
          />
        ) : (
          <View style={styles.episodePlaceholder}>
            <Feather name="play" size={20} color={Colors.dark.textSecondary} />
          </View>
        )}
      </View>
      <View style={styles.episodeInfo}>
        <ThemedText style={styles.episodeTitle} numberOfLines={1}>
          {episode.episode_num}. {episode.title}
        </ThemedText>
        {episode.info?.duration ? (
          <ThemedText style={styles.episodeMeta}>{episode.info.duration}</ThemedText>
        ) : null}
        {episode.info?.plot ? (
          <ThemedText style={styles.episodePlot} numberOfLines={2}>
            {episode.info.plot}
          </ThemedText>
        ) : null}
      </View>
      <Feather name="play-circle" size={28} color={Colors.dark.accent} style={styles.playIcon} />
    </Pressable>
  );

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
          {seriesName}
        </ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <View style={[styles.body, { paddingHorizontal: padH, flexDirection: isLandscape ? "row" : "column" }]}>
        <View style={[styles.sidebar, isLandscape ? styles.sidebarLandscape : styles.sidebarPortrait]}>
          <View style={styles.coverContainer}>
            {cover ? (
              <Image source={{ uri: cover }} style={styles.coverImage} contentFit="cover" transition={200} />
            ) : (
              <View style={styles.placeholderCover}>
                <Feather name="grid" size={40} color={Colors.dark.textSecondary} />
              </View>
            )}
          </View>
          {seriesInfo?.info?.plot ? (
            <ThemedText style={styles.plotText} numberOfLines={isLandscape ? 6 : 3}>
              {seriesInfo.info.plot}
            </ThemedText>
          ) : null}
          {seriesInfo?.info?.genre ? (
            <ThemedText style={styles.genreText} numberOfLines={1}>{seriesInfo.info.genre}</ThemedText>
          ) : null}
        </View>

        <View style={styles.episodesSection}>
          {seasons.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.seasonsScroll}
              style={styles.seasonsBar}
            >
              {seasons.map((season) => (
                <Pressable
                  key={season}
                  style={[styles.seasonButton, selectedSeason === season && styles.seasonButtonActive]}
                  onPress={() => setSelectedSeason(season)}
                >
                  <ThemedText style={[styles.seasonButtonText, selectedSeason === season && styles.seasonButtonTextActive]}>
                    Season {season}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <FlatList
            data={currentEpisodes}
            renderItem={renderEpisode}
            keyExtractor={(ep) => String(ep.id)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: padB, gap: Spacing.sm }}
          />
        </View>
      </View>
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
  body: {
    flex: 1,
    gap: Spacing.md,
  },
  sidebar: {
    gap: Spacing.sm,
  },
  sidebarPortrait: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  sidebarLandscape: {
    width: 160,
    flexDirection: "column",
  },
  coverContainer: {
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    flexShrink: 0,
  },
  coverImage: {
    width: 100,
    height: 140,
  },
  placeholderCover: {
    width: 100,
    height: 140,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  plotText: {
    flex: 1,
    color: Colors.dark.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  genreText: {
    color: Colors.dark.accent,
    fontSize: 13,
    fontWeight: "500",
  },
  episodesSection: {
    flex: 1,
    gap: Spacing.sm,
  },
  seasonsBar: {
    flexGrow: 0,
    flexShrink: 0,
  },
  seasonsScroll: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  seasonButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  seasonButtonActive: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  seasonButtonText: {
    color: Colors.dark.text,
    fontSize: 13,
  },
  seasonButtonTextActive: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  episodeCard: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
  },
  episodeCardPressed: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  episodeThumbnail: {
    width: 120,
    height: 68,
    flexShrink: 0,
  },
  episodeImage: {
    width: "100%",
    height: "100%",
  },
  episodePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  episodeInfo: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  episodeTitle: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: "500",
    marginBottom: Spacing.xs,
  },
  episodeMeta: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    marginBottom: Spacing.xs,
  },
  episodePlot: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
  },
  playIcon: {
    paddingHorizontal: Spacing.md,
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
