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

function EpisodeCard({ episode, onPress }: { episode: Episode; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;

  return (
    <Pressable
      style={[styles.episodeCard, isActive && styles.episodeCardActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <View style={styles.episodeThumb}>
        {episode.info?.movie_image ? (
          <Image source={{ uri: episode.info.movie_image }} style={styles.episodeImg} contentFit="cover" />
        ) : (
          <View style={styles.episodePlaceholder}>
            <Feather name="play" size={18} color={Colors.dark.border} />
          </View>
        )}
        {isActive ? (
          <View style={styles.episodeOverlay}>
            <Feather name="play-circle" size={28} color={Colors.dark.accent} />
          </View>
        ) : null}
      </View>
      <View style={styles.episodeInfo}>
        <ThemedText style={[styles.episodeTitle, isActive && styles.episodeTitleActive]} numberOfLines={1}>
          {episode.episode_num}. {episode.title}
        </ThemedText>
        {episode.info?.duration ? (
          <ThemedText style={styles.episodeMeta}>{episode.info.duration}</ThemedText>
        ) : null}
        {episode.info?.plot ? (
          <ThemedText style={styles.episodePlot} numberOfLines={2}>{episode.info.plot}</ThemedText>
        ) : null}
      </View>
      <Feather name="play-circle" size={24} color={isActive ? Colors.dark.accent : Colors.dark.border} style={styles.playIcon} />
      {isActive ? <View style={styles.activeBar} /> : null}
    </Pressable>
  );
}

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

  const padH = Math.max(insets.left + Spacing.xs, Spacing.md);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.sm);

  useEffect(() => { loadSeriesInfo(); }, [seriesId]);

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

  const handleEpisodePress = (ep: Episode) => {
    navigation.navigate("Player", {
      streamUrl: xtreamApi.getSeriesStreamUrl(ep.id, ep.container_extension),
      title: `${seriesName} - ${ep.title}`,
      type: "series",
      thumbnail: ep.info?.movie_image ?? cover ?? undefined,
      streamId: String(ep.id),
      seriesId: String(seriesId),
      seriesName,
    });
  };

  const seasons = seriesInfo ? Object.keys(seriesInfo.episodes || {}) : [];
  const currentEpisodes = selectedSeason && seriesInfo ? seriesInfo.episodes[selectedSeason] || [] : [];

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={styles.loadingText}>Loading...</ThemedText>
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
          <Pressable style={styles.retryBtn} onPress={loadSeriesInfo}>
            <ThemedText style={styles.retryBtnText}>Retry</ThemedText>
          </Pressable>
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
        <ThemedText style={styles.headerTitle} numberOfLines={1}>{seriesName}</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      <View style={[styles.body, { paddingHorizontal: padH, flexDirection: isLandscape ? "row" : "column" }]}>
        {/* Sidebar */}
        <View style={[styles.sidebar, isLandscape ? styles.sidebarLandscape : styles.sidebarPortrait]}>
          <View style={styles.cover}>
            {cover ? (
              <Image source={{ uri: cover }} style={styles.coverImg} contentFit="cover" transition={200} />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Feather name="grid" size={36} color={Colors.dark.border} />
              </View>
            )}
          </View>
          {seriesInfo?.info?.genre ? (
            <View style={styles.genreBadge}>
              <ThemedText style={styles.genreText} numberOfLines={1}>{seriesInfo.info.genre}</ThemedText>
            </View>
          ) : null}
          {seriesInfo?.info?.plot && isLandscape ? (
            <ThemedText style={styles.plotText} numberOfLines={6}>{seriesInfo.info.plot}</ThemedText>
          ) : null}
        </View>

        {/* Episodes section */}
        <View style={styles.episodesSection}>
          {seasons.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.seasonsRow}
              style={styles.seasonsBar}
            >
              {seasons.map((s) => (
                <Pressable
                  key={s}
                  style={[styles.seasonBtn, selectedSeason === s && styles.seasonBtnActive]}
                  onPress={() => setSelectedSeason(s)}
                >
                  <ThemedText style={[styles.seasonText, selectedSeason === s && styles.seasonTextActive]}>
                    S{s}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <FlatList
            data={currentEpisodes}
            keyExtractor={(ep) => String(ep.id)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: padB, gap: Spacing.sm }}
            renderItem={({ item }) => (
              <EpisodeCard episode={item} onPress={() => handleEpisodePress(item)} />
            )}
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
  divider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginBottom: Spacing.md,
  },
  body: {
    flex: 1,
    gap: Spacing.md,
  },
  sidebar: {},
  sidebarPortrait: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  sidebarLandscape: {
    width: 150,
    alignItems: "center",
    gap: Spacing.sm,
  },
  cover: {
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.3)",
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  coverImg: {
    width: 100,
    height: 140,
  },
  coverPlaceholder: {
    width: 100,
    height: 140,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  genreBadge: {
    backgroundColor: Colors.dark.accentDim,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.3)",
  },
  genreText: {
    color: Colors.dark.accent,
    fontSize: 11,
    fontWeight: "600",
  },
  plotText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  episodesSection: {
    flex: 1,
    gap: Spacing.sm,
  },
  seasonsBar: {
    flexGrow: 0,
    flexShrink: 0,
  },
  seasonsRow: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  seasonBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  seasonBtnActive: {
    backgroundColor: Colors.dark.accentDim,
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  seasonText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  seasonTextActive: {
    color: Colors.dark.accent,
  },
  episodeCard: {
    flexDirection: "row",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
    alignItems: "center",
  },
  episodeCardActive: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
    elevation: 8,
  },
  episodeThumb: {
    width: 112,
    height: 63,
    flexShrink: 0,
  },
  episodeImg: {
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
  episodeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,102,0,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  episodeInfo: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  episodeTitle: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 2,
  },
  episodeTitleActive: {
    color: Colors.dark.text,
  },
  episodeMeta: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
    marginBottom: 2,
  },
  episodePlot: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  playIcon: {
    paddingHorizontal: Spacing.md,
  },
  activeBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
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
  },
  loadingText: { color: Colors.dark.textSecondary, fontSize: 14 },
  errorText: { color: Colors.dark.error, textAlign: "center", fontSize: 14 },
  retryBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.accent,
    borderRadius: BorderRadius.sm,
  },
  retryBtnText: { color: "#fff", fontWeight: "700" },
});
