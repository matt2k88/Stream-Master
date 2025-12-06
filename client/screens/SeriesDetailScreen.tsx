import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
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
import { xtreamApi, SeriesInfo, Episode } from "@/lib/xtream-api";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type SeriesDetailRouteProp = RouteProp<RootStackParamList, "SeriesDetail">;

export default function SeriesDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<SeriesDetailRouteProp>();
  const { seriesId, seriesName, cover } = route.params;

  const [seriesInfo, setSeriesInfo] = useState<SeriesInfo | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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
      if (seasons.length > 0) {
        setSelectedSeason(seasons[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load series info");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEpisodePress = (episode: Episode) => {
    const streamUrl = xtreamApi.getSeriesStreamUrl(
      episode.id,
      episode.container_extension
    );
    navigation.navigate("Player", {
      streamUrl,
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
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={styles.loadingText}>Loading series...</ThemedText>
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
          <Pressable style={styles.retryButton} onPress={loadSeriesInfo}>
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
          {seriesName}
        </ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: insets.bottom + Spacing.tvSafeZone,
            paddingHorizontal: insets.left + Spacing.tvSafeZone,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.seriesHeader}>
          <View style={styles.coverContainer}>
            {cover ? (
              <Image
                source={{ uri: cover }}
                style={styles.coverImage}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={styles.placeholderCover}>
                <Feather name="grid" size={48} color={Colors.dark.textSecondary} />
              </View>
            )}
          </View>
          <View style={styles.seriesInfoContainer}>
            <ThemedText type="h2" style={styles.seriesTitle}>
              {seriesName}
            </ThemedText>
            {seriesInfo?.info?.plot ? (
              <ThemedText style={styles.plotText} numberOfLines={4}>
                {seriesInfo.info.plot}
              </ThemedText>
            ) : null}
            {seriesInfo?.info?.genre ? (
              <ThemedText style={styles.genreText}>
                {seriesInfo.info.genre}
              </ThemedText>
            ) : null}
          </View>
        </View>

        {seasons.length > 0 ? (
          <View style={styles.seasonsContainer}>
            <ThemedText type="h4" style={styles.sectionTitle}>
              Seasons
            </ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.seasonsScroll}
            >
              {seasons.map((season) => (
                <Pressable
                  key={season}
                  style={[
                    styles.seasonButton,
                    selectedSeason === season && styles.seasonButtonActive,
                  ]}
                  onPress={() => setSelectedSeason(season)}
                >
                  <ThemedText
                    style={[
                      styles.seasonButtonText,
                      selectedSeason === season && styles.seasonButtonTextActive,
                    ]}
                  >
                    Season {season}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {currentEpisodes.length > 0 ? (
          <View style={styles.episodesContainer}>
            <ThemedText type="h4" style={styles.sectionTitle}>
              Episodes
            </ThemedText>
            {currentEpisodes.map((episode) => (
              <Pressable
                key={episode.id}
                style={({ pressed }) => [
                  styles.episodeCard,
                  pressed && styles.episodeCardPressed,
                ]}
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
                      <Feather name="play" size={24} color={Colors.dark.textSecondary} />
                    </View>
                  )}
                </View>
                <View style={styles.episodeInfo}>
                  <ThemedText type="body" style={styles.episodeTitle}>
                    Episode {episode.episode_num}: {episode.title}
                  </ThemedText>
                  {episode.info?.duration ? (
                    <ThemedText style={styles.episodeDuration}>
                      {episode.info.duration}
                    </ThemedText>
                  ) : null}
                  {episode.info?.plot ? (
                    <ThemedText style={styles.episodePlot} numberOfLines={2}>
                      {episode.info.plot}
                    </ThemedText>
                  ) : null}
                </View>
                <View style={styles.playButton}>
                  <Feather name="play-circle" size={32} color={Colors.dark.accent} />
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
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
  scrollContent: {
    paddingTop: Spacing.lg,
  },
  seriesHeader: {
    flexDirection: "row",
    marginBottom: Spacing["2xl"],
  },
  coverContainer: {
    width: 200,
    height: 280,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    ...Shadows.card,
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  placeholderCover: {
    width: "100%",
    height: "100%",
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  seriesInfoContainer: {
    flex: 1,
    marginLeft: Spacing["2xl"],
    justifyContent: "center",
  },
  seriesTitle: {
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  plotText: {
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.md,
  },
  genreText: {
    color: Colors.dark.accent,
  },
  seasonsContainer: {
    marginBottom: Spacing["2xl"],
  },
  sectionTitle: {
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  seasonsScroll: {
    gap: Spacing.md,
  },
  seasonButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  seasonButtonActive: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  seasonButtonText: {
    color: Colors.dark.text,
  },
  seasonButtonTextActive: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  episodesContainer: {
    marginBottom: Spacing["2xl"],
  },
  episodeCard: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    ...Shadows.card,
  },
  episodeCardPressed: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  episodeThumbnail: {
    width: 160,
    height: 90,
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
    padding: Spacing.md,
    justifyContent: "center",
  },
  episodeTitle: {
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  episodeDuration: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    marginBottom: Spacing.xs,
  },
  episodePlot: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
  },
  playButton: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
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
