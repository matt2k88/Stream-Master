import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { getApiUrl } from "@/lib/query-client";
import { useData } from "@/contexts/DataContext";
import { useProfile } from "@/contexts/ProfileContext";
import SideMenuButton from "@/components/SideMenuButton";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const TMDB_BASE = "https://image.tmdb.org/t/p/w500";
const CARD_GAP = 10;

interface TopPick {
  id: number;
  tmdb_id: number;
  media_type: string;
  title: string;
  poster_path: string;
  overview: string;
  release_date: string;
  position: number;
  popularity_score: number; // 0–5, used directly as flame count
}

interface MatchedPick extends TopPick {
  matchedId: number | null;
  matchedCover: string | null;
  isRestricted: boolean;
}

function normaliseTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}


function FlameRating({ count }: { count: number }) {
  return (
    <View style={fr.row}>
      {Array.from({ length: 5 }).map((_, i) => (
        <MaterialCommunityIcons
          key={i}
          name="fire"
          size={15}
          color={i < count ? Colors.dark.accent : "rgba(255,102,0,0.18)"}
          style={i < count ? fr.lit : undefined}
        />
      ))}
    </View>
  );
}
const fr = StyleSheet.create({
  row: { flexDirection: "row", gap: 1 },
  lit: {
    textShadowColor: Colors.dark.accent,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
});

function PickCard({
  pick,
  flames,
  onPress,
  style,
}: {
  pick: MatchedPick;
  flames: number;
  onPress: () => void;
  style?: any;
}) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isActive = focused || hovered;
  const canNav = pick.matchedId !== null && !pick.isRestricted;
  const isMovie = pick.media_type === "movie";
  const year = pick.release_date ? pick.release_date.slice(0, 4) : "";
  const posterUri = pick.poster_path ? `${TMDB_BASE}${pick.poster_path}` : "";

  return (
    <Pressable
      focusable
      style={[
        styles.card,
        isActive && styles.cardActive,
        !canNav && styles.cardDim,
        style,
      ]}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={canNav ? onPress : undefined}
    >
      {/* Poster */}
      {posterUri ? (
        <Image
          source={{ uri: posterUri }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          transition={{ duration: 250, effect: "cross-dissolve" }}
        />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, styles.posterPlaceholder]}>
          <Feather name={isMovie ? "film" : "tv"} size={32} color="rgba(255,102,0,0.2)" />
        </View>
      )}

      {/* Top gradient + flames */}
      <LinearGradient
        colors={["rgba(0,0,0,0.72)", "rgba(0,0,0,0.0)"]}
        style={styles.topGradient}
        pointerEvents="none"
      >
        <View style={styles.topBar}>
          <FlameRating count={flames} />
          {isActive && canNav ? (
            <View style={styles.playHint}>
              <Feather name="chevron-right" size={11} color={Colors.dark.accent} />
            </View>
          ) : null}
        </View>
      </LinearGradient>

      {/* Bottom gradient + info */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.6)", "rgba(0,0,0,0.97)"]}
        style={styles.bottomGradient}
        pointerEvents="none"
      >
        <View style={styles.badgeRow}>
          <View style={[styles.typeBadge, isMovie ? styles.movieBadge : styles.seriesBadge]}>
            <Feather name={isMovie ? "film" : "tv"} size={9} color="#fff" />
            <ThemedText style={styles.badgeText}>{isMovie ? "Movie" : "Series"}</ThemedText>
          </View>
          {year ? <ThemedText style={styles.yearText}>{year}</ThemedText> : null}
        </View>
        <ThemedText style={styles.cardTitle} numberOfLines={2}>
          {pick.title}
        </ThemedText>
        <ThemedText style={styles.cardOverview} numberOfLines={2}>
          {pick.overview}
        </ThemedText>
      </LinearGradient>

      {/* Active glow overlay */}
      {isActive ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.10)", "transparent", "rgba(255,102,0,0.05)"]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
      ) : null}

      {/* Unavailable indicator */}
      {!canNav ? (
        <View style={styles.unavailableOverlay} pointerEvents="none">
          <Feather name="lock" size={16} color="rgba(255,255,255,0.2)" />
        </View>
      ) : null}
    </Pressable>
  );
}

export default function TopPicksScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { vodStreams, seriesList, streamRatings } = useData();
  const { activeProfile } = useProfile();
  const [picks, setPicks] = useState<TopPick[]>([]);
  const [loading, setLoading] = useState(true);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;

  // Parental-control filter — same logic as HomeScreen/ContentListScreen.
  const parentalFilter = useMemo(() => {
    const pc = activeProfile?.parental_controls;
    if (!pc?.enabled) return null;
    const showUnclassified = pc.show_unclassified ?? false;
    let maxAge: number;
    if (pc.max_age != null) {
      maxAge = pc.max_age;
    } else {
      const CERT_AGE: Record<string, number> = {
        U: 0, G: 0, PG: 8, "12A": 12, "12": 12, "15": 15, "18": 18, R18: 18,
        "PG-13": 13, R: 17, "NC-17": 18, "TV-MA": 18, "TV-14": 14, "TV-G": 0, "TV-PG": 8,
        "16": 16, "17": 17,
      };
      const allowed = pc.allowed_ratings ?? [];
      maxAge = allowed.length === 0 ? -1 : Math.max(...allowed.map((r) => CERT_AGE[r] ?? 0));
    }
    const allow18Plus = maxAge >= 18;
    return (streamId: number | null, name: string): boolean => {
      if (!allow18Plus && /xxx/i.test(name)) return false;
      if (streamId == null) return showUnclassified;
      const r = streamRatings.get(streamId);
      if (!r) return showUnclassified;
      return r.age_int <= maxAge;
    };
  }, [activeProfile?.parental_controls, streamRatings]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      (async () => {
        try {
          const url = new URL("/api/top-picks", getApiUrl());
          const res = await fetch(url.toString());
          if (res.ok && !cancelled) setPicks(await res.json());
        } catch {}
        finally { if (!cancelled) setLoading(false); }
      })();
      return () => { cancelled = true; };
    }, [])
  );

  const matchedPicks = useMemo<MatchedPick[]>(() => {
    return picks.map((pick) => {
      const t = normaliseTitle(pick.title);
      let matchedId: number | null = null;
      let matchedCover: string | null = null;
      if (pick.media_type === "movie") {
        const match =
          vodStreams.find((v) => normaliseTitle(v.name) === t) ??
          vodStreams.find((v) => {
            const n = normaliseTitle(v.name);
            return n.includes(t) || t.includes(n);
          });
        matchedId = match?.stream_id ?? null;
        matchedCover = match?.stream_icon ?? null;
      } else {
        const match =
          seriesList.find((s) => normaliseTitle(s.name) === t) ??
          seriesList.find((s) => {
            const n = normaliseTitle(s.name);
            return n.includes(t) || t.includes(n);
          });
        matchedId = match?.series_id ?? null;
        matchedCover = match?.cover ?? null;
      }
      const isRestricted = parentalFilter !== null
        ? !parentalFilter(matchedId, pick.title)
        : false;
      return { ...pick, matchedId, matchedCover, isRestricted };
    });
  }, [picks, vodStreams, seriesList, parentalFilter]);

  const handlePress = (pick: MatchedPick) => {
    if (pick.matchedId === null) return;
    if (pick.media_type === "movie") {
      navigation.navigate("MovieInfo", {
        streamId: pick.matchedId,
        name: pick.title,
        streamIcon: pick.matchedCover ?? undefined,
      });
    } else {
      navigation.navigate("SeriesDetail", {
        seriesId: pick.matchedId,
        seriesName: pick.title,
        cover: pick.matchedCover ?? "",
      });
    }
  };

  const padTop = insets.top + Spacing.sm;
  const padSide = Spacing.lg;

  // Landscape: 4 cols × 2 rows in a fixed-size grid (no scroll)
  // Portrait:  2 cols scrollable
  const numCols = isLandscape ? 4 : 2;
  const rows: MatchedPick[][] = [];
  for (let i = 0; i < matchedPicks.length; i += numCols) {
    rows.push(matchedPicks.slice(i, i + numCols));
  }

  return (
    <ThemedView style={styles.root}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: padTop, paddingHorizontal: padSide }]}>
        <View style={styles.headerLeft}>
          <SideMenuButton />
          <View style={styles.headerTitle}>
            <MaterialCommunityIcons name="fire" size={24} color={Colors.dark.accent} style={styles.headerIcon} />
            <ThemedText style={styles.headerText}>Top Picks</ThemedText>
          </View>
        </View>
        <ThemedText style={styles.headerSub}>
          Hand-picked — chosen just for you
        </ThemedText>
      </View>

      {/* ── Body ── */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={styles.loadingText}>Loading picks...</ThemedText>
        </View>
      ) : matchedPicks.length === 0 ? (
        <View style={styles.centered}>
          <MaterialCommunityIcons name="fire-off" size={48} color="rgba(255,102,0,0.25)" />
          <ThemedText style={styles.emptyTitle}>No picks yet</ThemedText>
          <ThemedText style={styles.emptySub}>Check back soon — new picks are added regularly.</ThemedText>
        </View>
      ) : isLandscape ? (
        /* Landscape: fixed grid, no scroll */
        <View
          style={[
            styles.landscapeGrid,
            {
              paddingHorizontal: padSide,
              paddingBottom: insets.bottom + Spacing.md,
            },
          ]}
        >
          {rows.map((row, ri) => (
            <View key={ri} style={styles.landscapeRow}>
              {row.map((pick) => (
                <PickCard
                  key={pick.id}
                  pick={pick}
                  flames={pick.popularity_score ?? 5}
                  onPress={() => handlePress(pick)}
                  style={styles.landscapeCard}
                />
              ))}
              {/* Fill empty slots if last row is short */}
              {row.length < numCols
                ? Array.from({ length: numCols - row.length }).map((_, i) => (
                    <View key={`empty-${i}`} style={styles.landscapeCard} />
                  ))
                : null}
            </View>
          ))}
        </View>
      ) : (
        /* Portrait: 2-col scrollable */
        <ScrollView
          contentContainerStyle={[
            styles.portraitGrid,
            {
              paddingHorizontal: padSide,
              paddingBottom: insets.bottom + Spacing.xl,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {rows.map((row, ri) => (
            <View key={ri} style={styles.portraitRow}>
              {row.map((pick) => (
                <PickCard
                  key={pick.id}
                  pick={pick}
                  flames={pick.popularity_score ?? 5}
                  onPress={() => handlePress(pick)}
                  style={styles.portraitCard}
                />
              ))}
              {row.length < numCols ? (
                <View style={styles.portraitCard} />
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },

  header: {
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: 4,
  },
  headerTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIcon: {
    textShadowColor: Colors.dark.accent,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  headerText: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 0.3,
  },
  headerSub: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginLeft: 40,
  },

  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  loadingText: { fontSize: 14, color: Colors.dark.textSecondary },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: Colors.dark.text },
  emptySub: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 19,
  },

  /* Landscape grid */
  landscapeGrid: {
    flex: 1,
    gap: CARD_GAP,
    paddingTop: CARD_GAP,
  },
  landscapeRow: {
    flex: 1,
    flexDirection: "row",
    gap: CARD_GAP,
  },
  landscapeCard: {
    flex: 1,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },

  /* Portrait grid */
  portraitGrid: {
    gap: CARD_GAP,
    paddingTop: CARD_GAP,
  },
  portraitRow: {
    flexDirection: "row",
    gap: CARD_GAP,
    height: 280,
  },
  portraitCard: {
    flex: 1,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },

  /* Card */
  card: {
    flex: 1,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.18)",
  },
  cardActive: {
    borderColor: Colors.dark.accent,
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 14,
    elevation: 20,
  },
  cardDim: {
    opacity: 0.55,
  },
  posterPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
  },
  topGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 8,
    paddingHorizontal: 8,
    paddingBottom: 24,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playHint: {
    backgroundColor: "rgba(255,102,0,0.85)",
    borderRadius: BorderRadius.full,
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 40,
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 4,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  movieBadge: { backgroundColor: "rgba(255,102,0,0.88)" },
  seriesBadge: { backgroundColor: "rgba(99,102,241,0.88)" },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  yearText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    fontWeight: "600",
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.dark.text,
    lineHeight: 17,
  },
  cardOverview: {
    fontSize: 10,
    color: "rgba(255,255,255,0.6)",
    lineHeight: 14,
    marginTop: 2,
  },
  unavailableOverlay: {
    position: "absolute",
    top: 8,
    right: 8,
  },
});
