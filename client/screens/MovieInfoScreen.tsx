import React, { useEffect, useMemo, useState } from "react";
import SideMenuButton from "@/components/SideMenuButton";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { xtreamApi, VodInfo } from "@/lib/xtream-api";
import { useFavourites } from "@/contexts/FavouritesContext";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { useWatchHistory, getWatchState } from "@/contexts/WatchHistoryContext";
import { useData } from "@/contexts/DataContext";
import { getApiUrl } from "@/lib/query-client";
import AgeRatingBadge from "@/components/AgeRatingBadge";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type MovieInfoRouteProp = RouteProp<RootStackParamList, "MovieInfo">;

const TMDB_IMG_W500 = "https://image.tmdb.org/t/p/w500";
const TMDB_IMG_ORIG = "https://image.tmdb.org/t/p/original";

interface TmdbDetails {
  id?: number;
  overview?: string;
  tagline?: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  runtime?: number;
  vote_average?: number;
  vote_count?: number;
  genres?: { id: number; name: string }[];
  production_countries?: { iso_3166_1: string; name: string }[];
}

function HeaderBtn({
  icon,
  active,
  onPress,
  iconColor,
}: {
  icon: keyof typeof Feather.glyphMap;
  active?: boolean;
  onPress: () => void;
  iconColor?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isInteracting = focused || pressed || hovered;
  return (
    <Pressable
      style={[styles.headerBtn, (isInteracting || active) && styles.headerBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      {isInteracting ? <View style={styles.headerBtnOverlay} /> : null}
      <Feather
        name={icon}
        size={20}
        color={iconColor ?? (isInteracting ? Colors.dark.accent : Colors.dark.text)}
      />
    </Pressable>
  );
}

function PlayBtn({
  label,
  icon,
  primary,
  autoFocus,
  onPress,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  primary?: boolean;
  autoFocus?: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[
        styles.playBtn,
        primary ? styles.playBtnPrimary : styles.playBtnSecondary,
        isActive && (primary ? styles.playBtnPrimaryActive : styles.playBtnSecondaryActive),
      ]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hasTVPreferredFocus={autoFocus}
    >
      {/* Visible hover/focus tint overlay — makes the focus state obvious
          on TV instead of relying on a subtle outer shadow glow. */}
      {isActive ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            primary ? styles.playBtnPrimaryOverlay : styles.playBtnSecondaryOverlay,
          ]}
          pointerEvents="none"
        />
      ) : null}
      <Feather
        name={icon}
        size={18}
        color={primary ? "#000" : Colors.dark.text}
      />
      <ThemedText
        style={[
          styles.playBtnText,
          { color: primary ? "#000" : Colors.dark.text },
        ]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.metaChip}>
      <ThemedText style={styles.metaChipText}>{children}</ThemedText>
    </View>
  );
}

function formatRuntime(mins?: number): string | null {
  if (!mins || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function parseRuntimeFromDuration(d?: string): number | null {
  if (!d) return null;
  // Xtream formats vary: "1:42:00" or "01:42:00" (HH:MM:SS) or "102 min"
  const minMatch = d.match(/(\d+)\s*min/i);
  if (minMatch) return parseInt(minMatch[1], 10);
  const hms = d.split(":").map((x) => parseInt(x, 10));
  if (hms.length === 3 && hms.every((n) => !isNaN(n))) {
    return hms[0] * 60 + hms[1];
  }
  return null;
}

function getYear(d?: string): string | null {
  if (!d) return null;
  const m = d.match(/(\d{4})/);
  return m ? m[1] : null;
}

export default function MovieInfoScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<MovieInfoRouteProp>();
  const { streamId, name, streamIcon, containerExtension, categoryId } = route.params;
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const { vodStreams } = useData();
  const cachedVod = useMemo(
    () => vodStreams.find((v) => v.stream_id === streamId),
    [vodStreams, streamId]
  );

  const { isFavourite, toggleFavourite } = useFavourites();
  const { isInWatchlist, toggleByStream: toggleWatchlistByStream } = useWatchlist();
  const { getByStreamId, refetch: refetchHistory } = useWatchHistory();
  const isFav = isFavourite(streamId, "movies");
  const watch = getByStreamId(streamId);
  const ws = getWatchState(watch);
  const resumeSecs = watch && !watch.is_completed ? (watch.current_time ?? 0) : 0;

  useFocusEffect(
    React.useCallback(() => {
      refetchHistory();
    }, [refetchHistory])
  );

  // ── Xtream VOD info ──────────────────────────────────────────────────────
  const [vodInfo, setVodInfo] = useState<VodInfo | null>(null);
  const [loadingVod, setLoadingVod] = useState(true);
  const [vodError, setVodError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setLoadingVod(true);
    setVodError("");
    xtreamApi
      .getVodInfo(streamId)
      .then((info) => {
        if (cancelled) return;
        setVodInfo(info);
      })
      .catch((e) => {
        if (cancelled) return;
        setVodError(e?.message ?? "Failed to load movie info");
      })
      .finally(() => {
        if (!cancelled) setLoadingVod(false);
      });
    return () => {
      cancelled = true;
    };
  }, [streamId]);

  // ── TMDB enrichment ──────────────────────────────────────────────────────
  const tmdbId = vodInfo?.info?.tmdb_id ? String(vodInfo.info.tmdb_id) : null;
  const { data: tmdb } = useQuery<TmdbDetails>({
    queryKey: [`/api/tmdb/movie/${tmdbId ?? ""}`],
    enabled: !!tmdbId,
    queryFn: async () => {
      const r = await fetch(new URL(`/api/tmdb/movie/${tmdbId}`, getApiUrl()).toString());
      if (!r.ok) throw new Error(`tmdb ${r.status}`);
      return r.json();
    },
    staleTime: 1000 * 60 * 60,
  });

  // ── Merged display fields (TMDB > Xtream > route) ────────────────────────
  const xt = vodInfo?.info ?? {};

  // Age cert from the pre-loaded stream ratings map (no per-title fetch needed)
  const { streamRatings } = useData();
  const ageRating = streamRatings.get(streamId);
  const title = (tmdb as any)?.title ?? xt.name ?? name;
  const tagline = (tmdb as any)?.tagline as string | undefined;
  const overview =
    (tmdb?.overview && tmdb.overview.length > 20 ? tmdb.overview : null) ??
    xt.description ??
    xt.plot ??
    null;
  const releaseDateStr = tmdb?.release_date ?? xt.releasedate ?? xt.release_date ?? undefined;
  const year = getYear(releaseDateStr);
  const runtime =
    (tmdb?.runtime && tmdb.runtime > 0 ? tmdb.runtime : null) ??
    parseRuntimeFromDuration(xt.duration) ??
    (typeof xt.episode_run_time === "string" ? parseInt(xt.episode_run_time, 10) || null : null);
  const runtimeStr = formatRuntime(runtime ?? undefined);
  const ratingNum =
    typeof tmdb?.vote_average === "number"
      ? tmdb.vote_average
      : typeof xt.rating === "string"
        ? parseFloat(xt.rating) || null
        : typeof xt.rating === "number"
          ? xt.rating
          : null;
  const genres: string[] =
    (tmdb?.genres && tmdb.genres.map((g) => g.name)) ??
    (xt.genre ? xt.genre.split(/[,|/]/).map((s) => s.trim()).filter(Boolean) : []);
  const cast = xt.cast || xt.actors || null;
  const director = xt.director || null;
  const country = xt.country || (tmdb?.production_countries?.map((c) => c.name).join(", ")) || null;

  const posterUrl =
    xt.cover_big ||
    xt.movie_image ||
    streamIcon ||
    cachedVod?.stream_icon ||
    (tmdb?.poster_path ? `${TMDB_IMG_W500}${tmdb.poster_path}` : null);

  const backdropUrl: string | null = useMemo(() => {
    if (tmdb?.backdrop_path) return `${TMDB_IMG_ORIG}${tmdb.backdrop_path}`;
    const bp = xt.backdrop_path;
    if (Array.isArray(bp) && bp.length > 0) return bp[0];
    if (typeof bp === "string" && bp) return bp;
    return null;
  }, [tmdb, xt.backdrop_path]);

  const handleToggleFav = () => {
    toggleFavourite({
      streamId,
      streamType: "movies",
      streamName: name,
      streamIcon: streamIcon ?? null,
      categoryId: categoryId ?? cachedVod?.category_id ?? null,
    });
  };

  const watchlistContentId = String(tmdbId ?? `xt_${streamId}`);
  // inWatchlist checks BOTH content_id (TMDB) and embedded stream_id, so a
  // row added externally via the TMDB page (no stream_id) still lights up
  // the bookmark and a tap will remove it (rather than "toggle-add").
  const inWatchlist = isInWatchlist(streamId, "movie") || isInWatchlist(watchlistContentId, "movie");
  const handleToggleWatchlist = () => {
    toggleWatchlistByStream({
      contentId: watchlistContentId,
      contentType: "movie",
      contentData: {
        stream_id: streamId,
        name: title ?? name,
        poster: posterUrl ?? null,
        poster_path: tmdb?.poster_path ?? null,
        backdrop_path: tmdb?.backdrop_path ?? null,
        overview: overview ?? null,
        release_date: releaseDateStr ?? null,
        vote_average: typeof ratingNum === "number" ? ratingNum : undefined,
        source: "app",
      },
    });
  };

  const handlePlay = (fromStart: boolean) => {
    const ext = containerExtension ?? cachedVod?.container_extension ?? vodInfo?.movie_data?.container_extension ?? "mp4";
    const url = xtreamApi.getVodStreamUrl(streamId, ext);
    navigation.navigate("Player", {
      streamUrl: url,
      title: name,
      type: "vod",
      thumbnail: posterUrl ?? undefined,
      streamId: String(streamId),
      resumeTime: fromStart ? 0 : resumeSecs,
    });
  };

  const padH = Math.max(insets.left + Spacing.md, Spacing.lg);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.lg, Spacing.xl);

  const initialLoading = loadingVod && !vodInfo;

  // ── Render ───────────────────────────────────────────────────────────────
  const Header = (
    <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
      <SideMenuButton />
      <HeaderBtn icon="arrow-left" onPress={() => navigation.goBack()} />
      <ThemedText style={styles.headerTitle} numberOfLines={1}>
        {title}
      </ThemedText>
      <HeaderBtn
        icon="bookmark"
        active={inWatchlist}
        onPress={handleToggleWatchlist}
        iconColor={inWatchlist ? Colors.dark.accent : undefined}
      />
      <HeaderBtn
        icon="star"
        active={isFav}
        onPress={handleToggleFav}
        iconColor={isFav ? "#FFD700" : undefined}
      />
    </View>
  );

  if (initialLoading && !cachedVod) {
    return (
      <ThemedView style={styles.container}>
        {Header}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={styles.loadingText}>Loading movie info...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  // ── Main info block (poster + title/meta + play buttons + description + cast)
  const InfoBlock = (
    <View style={[styles.infoBlock, isLandscape ? styles.infoBlockLandscape : styles.infoBlockPortrait]}>
      {/* Poster + play column */}
      <View style={[styles.posterCol, isLandscape ? styles.posterColLandscape : styles.posterColPortrait]}>
        <View style={styles.posterWrap}>
          {posterUrl ? (
            <Image source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.poster, styles.posterPlaceholder]}>
              <Feather name="film" size={42} color={Colors.dark.border} />
            </View>
          )}
          {ws.hasProgress && !ws.isCompleted ? (
            <View style={styles.posterProgressTrack}>
              <View style={[styles.posterProgressFill, { width: `${ws.progress * 100}%` }]} />
            </View>
          ) : null}
        </View>
        {ageRating?.certification ? (
          <View style={styles.posterBadgeRow}>
            <AgeRatingBadge certification={ageRating.certification} size="md" />
          </View>
        ) : null}
      </View>

      {/* Right column — title, meta, play, description, cast */}
      <View style={styles.detailsCol}>
        {tagline ? (
          <ThemedText style={styles.tagline} numberOfLines={2}>
            {tagline}
          </ThemedText>
        ) : null}

        {/* Meta chips row */}
        <View style={styles.metaRow}>
          {year ? <MetaChip>{year}</MetaChip> : null}
          {runtimeStr ? <MetaChip>{runtimeStr}</MetaChip> : null}
          {ratingNum != null ? (
            <View style={[styles.metaChip, styles.ratingChip]}>
              <Feather name="star" size={11} color="#FFD700" />
              <ThemedText style={[styles.metaChipText, { color: "#FFD700" }]}>
                {ratingNum.toFixed(1)}
              </ThemedText>
            </View>
          ) : null}
          {country ? <MetaChip>{country}</MetaChip> : null}
        </View>

        {/* Genre chips */}
        {genres.length > 0 ? (
          <View style={styles.genreRow}>
            {genres.slice(0, 6).map((g, i) => (
              <View key={`${g}-${i}`} style={styles.genreChip}>
                <ThemedText style={styles.genreChipText}>{g}</ThemedText>
              </View>
            ))}
          </View>
        ) : null}

        {/* Play buttons */}
        <View style={styles.playRow}>
          {resumeSecs > 0 && !ws.isCompleted ? (
            <>
              <PlayBtn label="RESUME" icon="play" primary autoFocus onPress={() => handlePlay(false)} />
              <PlayBtn label="START OVER" icon="rotate-ccw" onPress={() => handlePlay(true)} />
            </>
          ) : (
            <PlayBtn label="PLAY MOVIE" icon="play" primary autoFocus onPress={() => handlePlay(true)} />
          )}
        </View>

        {/* Description */}
        {overview ? (
          <View style={styles.section}>
            <ThemedText style={styles.sectionLabel}>OVERVIEW</ThemedText>
            <ThemedText style={styles.overview}>{overview}</ThemedText>
          </View>
        ) : null}

        {/* Cast */}
        {cast ? (
          <View style={styles.section}>
            <ThemedText style={styles.sectionLabel}>CAST</ThemedText>
            <ThemedText style={styles.castText}>{cast}</ThemedText>
          </View>
        ) : null}

        {/* Director */}
        {director ? (
          <View style={styles.section}>
            <ThemedText style={styles.sectionLabel}>DIRECTOR</ThemedText>
            <ThemedText style={styles.castText}>{director}</ThemedText>
          </View>
        ) : null}

        {vodError ? (
          <ThemedText style={styles.errorHint}>
            Couldn't load extra details — you can still play the movie.
          </ThemedText>
        ) : null}
      </View>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: padB }}
        showsVerticalScrollIndicator={false}
      >
        {/* Backdrop */}
        <View style={styles.backdropWrap}>
          {backdropUrl ? (
            <Image source={{ uri: backdropUrl }} style={styles.backdrop} contentFit="cover" transition={250} />
          ) : posterUrl ? (
            <Image source={{ uri: posterUrl }} style={styles.backdrop} contentFit="cover" transition={250} blurRadius={12} />
          ) : (
            <View style={[styles.backdrop, styles.backdropPlaceholder]} />
          )}
          <LinearGradient
            colors={["rgba(8,8,8,0)", "rgba(8,8,8,0.7)", "rgba(8,8,8,1)"]}
            style={StyleSheet.absoluteFill}
          />
        </View>

        {/* Floating header on top of backdrop */}
        <View pointerEvents="box-none" style={styles.headerOverlay}>
          {Header}
        </View>

        <View style={[styles.content, { paddingHorizontal: padH, marginTop: -90 }]}>
          {InfoBlock}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const BACKDROP_HEIGHT = 260;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  scroll: { flex: 1 },
  backdropWrap: {
    width: "100%",
    height: BACKDROP_HEIGHT,
    backgroundColor: Colors.dark.backgroundDefault,
    overflow: "hidden",
  },
  backdrop: {
    width: "100%",
    height: "100%",
  },
  backdropPlaceholder: {
    backgroundColor: "#101010",
  },
  headerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(8,8,8,0.6)",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  headerBtnActive: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
  headerBtnOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,102,0,0.18)",
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  content: {
    flex: 1,
  },
  infoBlock: {
    gap: Spacing.lg,
  },
  infoBlockLandscape: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  infoBlockPortrait: {
    flexDirection: "column",
  },
  posterCol: {},
  posterColLandscape: {
    width: 180,
    flexShrink: 0,
  },
  posterColPortrait: {
    alignSelf: "flex-start",
  },
  posterWrap: {
    width: 160,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.35)",
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 10,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  poster: {
    width: 160,
    height: 230,
  },
  posterPlaceholder: {
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  posterProgressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  posterProgressFill: {
    height: "100%",
    backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  posterBadgeRow: {
    marginTop: Spacing.sm,
    alignItems: "center",
  },
  detailsCol: {
    flex: 1,
    gap: Spacing.md,
  },
  tagline: {
    color: Colors.dark.accentLight,
    fontSize: 14,
    fontStyle: "italic",
    fontWeight: "500",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    alignItems: "center",
  },
  metaChip: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaChipText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  ratingChip: {
    backgroundColor: "rgba(255,215,0,0.08)",
    borderColor: "rgba(255,215,0,0.45)",
  },
  genreRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  genreChip: {
    backgroundColor: "rgba(255,102,0,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.45)",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  genreChipText: {
    color: Colors.dark.accentLight,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  playRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    overflow: "hidden",
  },
  playBtnPrimary: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  playBtnPrimaryActive: {
    borderColor: "#fff",
    borderWidth: 2,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 14,
    elevation: 12,
  },
  playBtnPrimaryOverlay: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  playBtnSecondary: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderColor: Colors.dark.border,
  },
  playBtnSecondaryActive: {
    borderColor: Colors.dark.accent,
    borderWidth: 2,
    backgroundColor: "rgba(255,102,0,0.12)",
  },
  playBtnSecondaryOverlay: {
    backgroundColor: "rgba(255,102,0,0.18)",
  },
  playBtnText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  section: {
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  sectionLabel: {
    color: Colors.dark.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  overview: {
    color: Colors.dark.text,
    fontSize: 14,
    lineHeight: 20,
  },
  castText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  errorHint: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontStyle: "italic",
    marginTop: Spacing.sm,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: { color: Colors.dark.textSecondary, fontSize: 14 },
});
