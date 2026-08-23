import React, { useEffect, useState } from "react";
import AgeRatingBadge from "@/components/AgeRatingBadge";
import SideMenuButton from "@/components/SideMenuButton";
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
import { useFavourites } from "@/contexts/FavouritesContext";
import { useData } from "@/contexts/DataContext";
import { useDownloads } from "@/contexts/DownloadsContext";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { useWatchHistory, getWatchState } from "@/contexts/WatchHistoryContext";
import type { RecentlyWatched } from "@/components/RecentlyWatchedCard";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback } from "react";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type SeriesDetailRouteProp = RouteProp<RootStackParamList, "SeriesDetail">;

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
      {isActive ? <View style={styles.backBtnOverlay} /> : null}
      <Feather name="arrow-left" size={20} color={isActive ? Colors.dark.accent : Colors.dark.text} />
    </Pressable>
  );
}

function SeasonBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = active || focused || pressed;
  return (
    <Pressable
      style={[styles.seasonBtn, isActive && styles.seasonBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      <ThemedText style={[styles.seasonText, isActive && styles.seasonTextActive]}>{label}</ThemedText>
    </Pressable>
  );
}

function DownloadAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const active = focused || pressed || hovered;
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[styles.downloadAction, active && styles.downloadActionActive]}
    >
      {active ? <View style={styles.downloadActionOverlay} /> : null}
      <Feather name={icon} size={15} color={active ? "#000" : Colors.dark.accent} />
      <ThemedText style={[styles.downloadActionText, active && styles.downloadActionTextActive]}>{label}</ThemedText>
    </Pressable>
  );
}

function EpisodeCard({
  episode,
  onPress,
  onDownload,
  watchEntry,
  downloadStatus,
  folderReady,
}: {
  episode: Episode;
  onPress: () => void;
  onDownload: () => void;
  watchEntry?: RecentlyWatched;
  downloadStatus?: string;
  folderReady: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [downloadFocused, setDownloadFocused] = useState(false);
  const isActive = focused || pressed;
  const ws = getWatchState(watchEntry);

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
        {ws.hasProgress && !ws.isCompleted ? (
          <View style={styles.epProgressTrack}>
            <View style={[styles.epProgressFill, { width: `${ws.progress * 100}%` }]} />
          </View>
        ) : null}
      </View>
      <View style={styles.episodeInfo}>
        <View style={styles.epTitleRow}>
          <ThemedText style={[styles.episodeTitle, isActive && styles.episodeTitleActive]} numberOfLines={1}>
            {episode.episode_num}. {episode.title}
          </ThemedText>
          {ws.isCompleted ? (
            <View style={styles.epWatchedPill}>
              <Feather name="check" size={9} color="#7CFF7C" />
              <ThemedText style={styles.epWatchedText}>WATCHED</ThemedText>
            </View>
          ) : ws.hasProgress ? (
            <View style={styles.epContinuePill}>
              <Feather name="play" size={9} color={Colors.dark.accent} />
              <ThemedText style={styles.epContinueText}>CONTINUE</ThemedText>
            </View>
          ) : null}
        </View>
        {episode.info?.duration ? (
          <ThemedText style={styles.episodeMeta}>{episode.info.duration}</ThemedText>
        ) : null}
        {episode.info?.plot ? (
          <ThemedText style={styles.episodePlot} numberOfLines={2}>{episode.info.plot}</ThemedText>
        ) : null}
      </View>
      <View style={styles.episodeActions}>
        <Pressable
          accessibilityLabel={folderReady ? `Download ${episode.title}` : "Set download folder"}
          onPress={(event) => {
            event.stopPropagation();
            onDownload();
          }}
          onFocus={() => setDownloadFocused(true)}
          onBlur={() => setDownloadFocused(false)}
          onHoverIn={() => setDownloadFocused(true)}
          onHoverOut={() => setDownloadFocused(false)}
          style={({ pressed }) => [
            styles.episodeDownloadButton,
            (pressed || downloadFocused) && styles.episodeDownloadButtonActive,
          ]}
        >
          {downloadFocused ? <View style={styles.episodeDownloadOverlay} /> : null}
          <Feather
            name={
              downloadStatus === "completed"
                ? "check"
                : downloadStatus === "downloading" || downloadStatus === "queued"
                  ? "clock"
                  : downloadStatus === "paused"
                    ? "pause"
                    : folderReady
                      ? "download"
                      : "folder"
            }
            size={17}
            color={downloadFocused ? "#000" : Colors.dark.accent}
          />
        </Pressable>
        <Feather name="play-circle" size={24} color={isActive ? Colors.dark.accent : Colors.dark.border} />
      </View>
      {isActive ? <View style={styles.activeBar} /> : null}
    </Pressable>
  );
}

function FavBtn({ active, onPress }: { active: boolean; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isInteracting = focused || pressed || hovered;
  return (
    <Pressable
      style={[styles.backBtn, (isInteracting || active) && styles.backBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      {isInteracting ? <View style={styles.backBtnOverlay} /> : null}
      <Feather
        name="star"
        size={20}
        color={active ? "#FFD700" : isInteracting ? Colors.dark.accent : Colors.dark.text}
      />
    </Pressable>
  );
}

function WatchlistBtn({ active, onPress }: { active: boolean; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isInteracting = focused || pressed || hovered;
  return (
    <Pressable
      style={[styles.backBtn, (isInteracting || active) && styles.backBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      {isInteracting ? <View style={styles.backBtnOverlay} /> : null}
      <Feather
        name="bookmark"
        size={20}
        color={active ? Colors.dark.accent : isInteracting ? Colors.dark.accent : Colors.dark.text}
      />
    </Pressable>
  );
}

export default function SeriesDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<SeriesDetailRouteProp>();
  const { seriesId, seriesName, cover, initialSeason } = route.params;
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [seriesInfo, setSeriesInfo] = useState<SeriesInfo | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const { isFavourite, toggleFavourite } = useFavourites();
  const { isInWatchlist, toggleByStream: toggleWatchlistByStream } = useWatchlist();
  const { getByStreamId, refetch: refetchHistory } = useWatchHistory();
  const { enqueue, enqueueMany, getByStreamId: getDownloadByStreamId, storage } = useDownloads();
  const isFav = isFavourite(seriesId, "series");
  const tmdbSeriesId = (seriesInfo?.info as any)?.tmdb ?? (seriesInfo?.info as any)?.tmdb_id ?? null;
  const tmdbSeriesIdNum = tmdbSeriesId ? Number(tmdbSeriesId) : null;
  // Age cert from the pre-loaded stream ratings map
  const { streamRatings } = useData();
  const ageRating = streamRatings.get(seriesId);
  const watchlistContentId = tmdbSeriesId ? String(tmdbSeriesId) : `xt_${seriesId}`;
  const inWatchlist = isInWatchlist(seriesId, "series") || isInWatchlist(watchlistContentId, "series");
  const handleToggleWatchlist = () => {
    toggleWatchlistByStream({
      contentId: watchlistContentId,
      contentType: "series",
      contentData: {
        series_id: seriesId,
        stream_id: seriesId,
        name: seriesName,
        poster: cover ?? null,
        source: "app",
      },
    });
  };

  useFocusEffect(
    useCallback(() => {
      refetchHistory();
    }, [refetchHistory])
  );

  const handleToggleFav = () => {
    toggleFavourite({
      streamId: Number(seriesId),
      streamType: "series",
      streamName: seriesName,
      streamIcon: cover ?? null,
      categoryId: null,
    });
  };

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
      if (seasons.length > 0) {
        const target = initialSeason != null ? String(initialSeason) : null;
        if (target && seasons.includes(target)) {
          setSelectedSeason(target);
        } else {
          setSelectedSeason(seasons[0]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load series info");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEpisodePress = (ep: Episode) => {
    const seasonNum = Number(ep.season ?? selectedSeason ?? 1) || 1;
    const watch = getByStreamId(ep.id);
    const resume = watch && !watch.is_completed ? (watch.current_time ?? 0) : 0;
    navigation.navigate("Player", {
      streamUrl: xtreamApi.getSeriesStreamUrl(ep.id, ep.container_extension),
      title: `${seriesName} - ${ep.title}`,
      type: "series",
      thumbnail: ep.info?.movie_image ?? cover ?? undefined,
      streamId: String(ep.id),
      seriesId: String(seriesId),
      seriesName,
      seasonNum,
      episodeNum: Number(ep.episode_num),
      resumeTime: resume,
    });
  };

  const seasons = seriesInfo ? Object.keys(seriesInfo.episodes || {}) : [];
  const currentEpisodes = selectedSeason && seriesInfo ? seriesInfo.episodes[selectedSeason] || [] : [];
  const toDownloadRequest = (ep: Episode) => ({
    kind: "episode" as const,
    streamId: String(ep.id),
    extension: ep.container_extension || "mp4",
    title: `${seriesName} — ${ep.title}`,
    thumbnail: ep.info?.movie_image ?? cover ?? undefined,
    seriesId: String(seriesId),
    seriesName,
    seasonNum: Number(ep.season ?? selectedSeason ?? 1) || 1,
    episodeNum: Number(ep.episode_num) || undefined,
  });
  const handleEpisodeDownload = (ep: Episode) => {
    if (storage.isPrivateFallback) {
      navigation.navigate("Downloads");
      return;
    }
    void enqueue(toDownloadRequest(ep));
  };
  const handleSeasonDownload = () => {
    if (storage.isPrivateFallback) {
      navigation.navigate("Downloads");
      return;
    }
    void enqueueMany(currentEpisodes.map(toDownloadRequest));
  };
  const handleSeriesDownload = () => {
    if (storage.isPrivateFallback) {
      navigation.navigate("Downloads");
      return;
    }
    const allEpisodes = Object.values(seriesInfo?.episodes ?? {}).flat();
    void enqueueMany(allEpisodes.map(toDownloadRequest));
  };
  const allSeriesEpisodes = Object.values(seriesInfo?.episodes ?? {}).flat();
  const seasonDownloadCount = currentEpisodes.filter((episode) => getDownloadByStreamId(String(episode.id))?.status === "completed").length;
  const seriesDownloadCount = allSeriesEpisodes.filter((episode) => getDownloadByStreamId(String(episode.id))?.status === "completed").length;
  const seasonLabel = storage.isPrivateFallback
    ? "SET DOWNLOAD FOLDER"
    : seasonDownloadCount === currentEpisodes.length && currentEpisodes.length > 0
      ? "SEASON DOWNLOADED"
      : seasonDownloadCount > 0
        ? `DOWNLOAD SEASON (${seasonDownloadCount}/${currentEpisodes.length})`
        : "DOWNLOAD SEASON";
  const seriesLabel = storage.isPrivateFallback
    ? "SET DOWNLOAD FOLDER"
    : seriesDownloadCount === allSeriesEpisodes.length && allSeriesEpisodes.length > 0
      ? "SERIES DOWNLOADED"
      : seriesDownloadCount > 0
        ? `DOWNLOAD SERIES (${seriesDownloadCount}/${allSeriesEpisodes.length})`
        : "DOWNLOAD FULL SERIES";

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
        <SideMenuButton />
        <BackBtn onPress={() => navigation.goBack()} />
        <ThemedText style={styles.headerTitle} numberOfLines={1}>{seriesName}</ThemedText>
        <WatchlistBtn active={inWatchlist} onPress={handleToggleWatchlist} />
        <FavBtn active={isFav} onPress={handleToggleFav} />
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      <View style={[styles.body, { paddingHorizontal: padH, flexDirection: isLandscape ? "row" : "column" }]}>
        {/* Sidebar — landscape: vertical column with cover, genre, scrollable plot + cast.
            Portrait: top block with cover next to text (genre + truncated plot preview). */}
        {isLandscape ? (
          <View style={[styles.sidebar, styles.sidebarLandscape]}>
            <View style={styles.cover}>
              {cover ? (
                <Image source={{ uri: cover }} style={styles.coverImg} contentFit="cover" transition={200} />
              ) : (
                <View style={styles.coverPlaceholder}>
                  <Feather name="grid" size={36} color={Colors.dark.border} />
                </View>
              )}
            </View>
            <View style={styles.badgeRow}>
              {seriesInfo?.info?.genre ? (
                <View style={styles.genreBadge}>
                  <ThemedText style={styles.genreText} numberOfLines={1}>{seriesInfo.info.genre}</ThemedText>
                </View>
              ) : null}
              <AgeRatingBadge certification={ageRating?.certification} size="sm" />
            </View>
            <ScrollView
              style={styles.sidebarScroll}
              contentContainerStyle={styles.sidebarScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {seriesInfo?.info?.plot ? (
                <ThemedText style={styles.plotText}>{seriesInfo.info.plot}</ThemedText>
              ) : null}
              {seriesInfo?.info?.cast ? (
                <View style={styles.metaSection}>
                  <ThemedText style={styles.metaLabel}>CAST</ThemedText>
                  <ThemedText style={styles.metaValue}>{seriesInfo.info.cast}</ThemedText>
                </View>
              ) : null}
              {seriesInfo?.info?.director ? (
                <View style={styles.metaSection}>
                  <ThemedText style={styles.metaLabel}>DIRECTOR</ThemedText>
                  <ThemedText style={styles.metaValue}>{seriesInfo.info.director}</ThemedText>
                </View>
              ) : null}
              {seriesInfo?.info?.releaseDate ? (
                <View style={styles.metaSection}>
                  <ThemedText style={styles.metaLabel}>RELEASED</ThemedText>
                  <ThemedText style={styles.metaValue}>{seriesInfo.info.releaseDate}</ThemedText>
                </View>
              ) : null}
            </ScrollView>
          </View>
        ) : (
          <View style={styles.portraitTop}>
            <View style={styles.portraitTopRow}>
              <View style={styles.cover}>
                {cover ? (
                  <Image source={{ uri: cover }} style={styles.coverImg} contentFit="cover" transition={200} />
                ) : (
                  <View style={styles.coverPlaceholder}>
                    <Feather name="grid" size={36} color={Colors.dark.border} />
                  </View>
                )}
              </View>
              <View style={styles.portraitMeta}>
                <View style={styles.badgeRow}>
                  {seriesInfo?.info?.genre ? (
                    <View style={[styles.genreBadge, { alignSelf: "flex-start" }]}>
                      <ThemedText style={styles.genreText} numberOfLines={1}>{seriesInfo.info.genre}</ThemedText>
                    </View>
                  ) : null}
                  <AgeRatingBadge certification={ageRating?.certification} size="sm" />
                </View>
                {seriesInfo?.info?.plot ? (
                  <ThemedText style={styles.plotText} numberOfLines={5}>
                    {seriesInfo.info.plot}
                  </ThemedText>
                ) : null}
                {seriesInfo?.info?.cast ? (
                  <ThemedText style={styles.portraitCast} numberOfLines={2}>
                    <ThemedText style={styles.portraitCastLabel}>Cast: </ThemedText>
                    {seriesInfo.info.cast}
                  </ThemedText>
                ) : null}
              </View>
            </View>
          </View>
        )}

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
                <SeasonBtn
                  key={s}
                  label={`S${s}`}
                  active={selectedSeason === s}
                  onPress={() => setSelectedSeason(s)}
                />
              ))}
            </ScrollView>
          ) : null}
          <View style={styles.downloadActions}>
            <DownloadAction icon={storage.isPrivateFallback ? "folder" : "download"} label={seasonLabel} onPress={handleSeasonDownload} />
            <DownloadAction icon={storage.isPrivateFallback ? "folder" : "layers"} label={seriesLabel} onPress={handleSeriesDownload} />
          </View>

          <FlatList
            data={currentEpisodes}
            keyExtractor={(ep) => String(ep.id)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: padB, gap: Spacing.sm }}
            renderItem={({ item }) => (
              <EpisodeCard
                episode={item}
                onPress={() => handleEpisodePress(item)}
                onDownload={() => handleEpisodeDownload(item)}
                watchEntry={getByStreamId(item.id)}
                downloadStatus={getDownloadByStreamId(String(item.id))?.status}
                folderReady={!storage.isPrivateFallback}
              />
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
    overflow: "hidden",
  },
  backBtnActive: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
  backBtnOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,102,0,0.18)",
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
  sidebarLandscape: {
    width: 200,
    alignItems: "center",
    gap: Spacing.sm,
  },
  sidebarScroll: {
    width: "100%",
    flex: 1,
  },
  sidebarScrollContent: {
    gap: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  metaSection: {
    gap: 2,
    marginTop: Spacing.xs,
  },
  metaLabel: {
    color: Colors.dark.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  metaValue: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  portraitTop: {
    gap: Spacing.sm,
  },
  portraitTopRow: {
    flexDirection: "row",
    gap: Spacing.md,
    alignItems: "flex-start",
  },
  portraitMeta: {
    flex: 1,
    gap: Spacing.xs,
  },
  portraitCast: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  portraitCastLabel: {
    color: Colors.dark.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
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
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    alignSelf: "stretch",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  genreBadge: {
    flexShrink: 1,
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
  episodeActions: {
    alignItems: "center",
    gap: Spacing.sm,
  },
  episodeDownloadButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,102,0,0.11)",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.35)",
  },
  episodeDownloadButtonActive: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 7,
  },
  episodeDownloadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  downloadActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  downloadAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
    backgroundColor: "rgba(255,102,0,0.08)",
    overflow: "hidden",
  },
  downloadActionActive: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 9,
  },
  downloadActionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  downloadActionText: {
    color: Colors.dark.text,
    fontSize: 11,
    fontWeight: "800",
  },
  downloadActionTextActive: {
    color: "#000",
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
  epTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: 2,
  },
  epWatchedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: BorderRadius.xs,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: "rgba(120,255,120,0.5)",
  },
  epWatchedText: { color: "#7CFF7C", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  epContinuePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: BorderRadius.xs,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.55)",
  },
  epContinueText: { color: Colors.dark.accent, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  epProgressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  epProgressFill: {
    height: "100%",
    backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
});
