import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
  Modal,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useAuth } from "@/contexts/AuthContext";
import { useUISettings } from "@/contexts/UISettingsContext";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type ContentDetails = {
  id?: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string | null;
  release_date?: string | null;
  first_air_date?: string | null;
  media_type?: "movie" | "tv" | string;
  vote_average?: number;
  runtime?: number;
  number_of_seasons?: number;
  number_of_episodes?: number;
  genres?: { id: number; name: string }[];
  tagline?: string;
  original_language?: string;
  status?: string;
};

type ContentRequest = {
  id: number | string;
  status: string | null;
  admin_notes: string | null;
  comments: string | null;
  content_details: ContentDetails | null;
  created_at: string;
  requester_username: string;
};

const TMDB_IMG_W500 = "https://image.tmdb.org/t/p/w500";
const TMDB_IMG_ORIG = "https://image.tmdb.org/t/p/original";

function getTitle(d: ContentDetails | null | undefined): string {
  if (!d) return "Untitled request";
  return d.title || d.name || "Untitled request";
}

function getPoster(d: ContentDetails | null | undefined, size: "w500" | "original" = "w500"): string | null {
  if (!d?.poster_path) return null;
  const p = d.poster_path.startsWith("/") ? d.poster_path : `/${d.poster_path}`;
  return `${size === "original" ? TMDB_IMG_ORIG : TMDB_IMG_W500}${p}`;
}

function getBackdrop(d: ContentDetails | null | undefined): string | null {
  if (!d?.backdrop_path) return null;
  const p = d.backdrop_path.startsWith("/") ? d.backdrop_path : `/${d.backdrop_path}`;
  return `${TMDB_IMG_ORIG}${p}`;
}

function getYear(d: ContentDetails | null | undefined): string | null {
  const raw = d?.release_date || d?.first_air_date || null;
  if (!raw) return null;
  return raw.slice(0, 4);
}

function getMediaType(d: ContentDetails | null | undefined): "movie" | "tv" {
  if (d?.media_type === "tv" || d?.media_type === "movie") return d.media_type;
  if (d?.name && !d?.title) return "tv";
  return "movie";
}

function statusColor(status: string | null | undefined): { bg: string; text: string; label: string } {
  const s = (status || "pending").toLowerCase();
  if (s === "available" || s === "added" || s === "completed" || s === "approved") {
    return { bg: "#2ECC71", text: "#08210F", label: status || "Available" };
  }
  if (s === "unavailable" || s === "rejected" || s === "denied") {
    return { bg: "#E74C3C", text: "#2A0A07", label: status || "Unavailable" };
  }
  if (s === "in_progress" || s === "processing" || s === "working") {
    return { bg: "#3498DB", text: "#06182A", label: status || "In Progress" };
  }
  return { bg: Colors.dark.accent, text: "#1A0E00", label: status || "Pending" };
}

function RetryBtn({ onPress }: { onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isActive = focused || pressed || hovered;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.retryBtn, isActive && styles.retryBtnActive]}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      {isActive ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.22)", "rgba(255,102,0,0.06)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}
      <ThemedText style={styles.retryText}>Try again</ThemedText>
    </Pressable>
  );
}

function BackBtn({ onPress }: { onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isActive = focused || pressed || hovered;
  return (
    <Pressable
      style={[styles.iconBtn, isActive && styles.iconBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      {isActive ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.18)", "rgba(255,102,0,0.06)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}
      <Feather name="arrow-left" size={20} color={isActive ? Colors.dark.accent : Colors.dark.text} />
    </Pressable>
  );
}

function CloseBtn({ onPress }: { onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isActive = focused || pressed || hovered;
  return (
    <Pressable
      style={[styles.iconBtn, isActive && styles.iconBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      hasTVPreferredFocus
    >
      {isActive ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.22)", "rgba(255,102,0,0.06)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}
      <Feather name="x" size={20} color={isActive ? Colors.dark.accent : Colors.dark.text} />
    </Pressable>
  );
}

function RequestCard({
  item,
  width,
  height,
  scaleFont,
  onPress,
}: {
  item: ContentRequest;
  width: number;
  height: number;
  scaleFont: (n: number) => number;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isActive = focused || pressed || hovered;
  const poster = getPoster(item.content_details);
  const title = getTitle(item.content_details);
  const year = getYear(item.content_details);
  const sc = statusColor(item.status);
  const note = (item.admin_notes || "").trim();

  const posterH = Math.round(width * 1.5);

  return (
    <Pressable
      style={[
        styles.card,
        { width, minHeight: height },
        isActive && styles.cardActive,
      ]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <View style={[styles.posterWrap, { height: posterH }]}>
        {poster ? (
          <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.posterPlaceholder]}>
            <Feather name="film" size={36} color={Colors.dark.textSecondary} />
          </View>
        )}
        {isActive ? (
          <LinearGradient
            colors={["rgba(255,102,0,0.35)", "rgba(255,102,0,0.05)"]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            pointerEvents="none"
          />
        ) : null}
        <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
          <ThemedText style={[styles.statusText, { color: sc.text, fontSize: scaleFont(10) }]} numberOfLines={1}>
            {sc.label.toUpperCase()}
          </ThemedText>
        </View>
      </View>
      <View style={styles.cardBody}>
        <ThemedText style={[styles.cardTitle, { fontSize: scaleFont(13) }]} numberOfLines={2}>
          {title}
        </ThemedText>
        {year ? (
          <ThemedText style={[styles.cardYear, { fontSize: scaleFont(11) }]}>{year}</ThemedText>
        ) : null}
        {note ? (
          <View style={styles.notesWrap}>
            <Feather name="message-square" size={11} color={Colors.dark.accent} style={{ marginTop: 2 }} />
            <ThemedText style={[styles.notesText, { fontSize: scaleFont(11) }]} numberOfLines={3}>
              {note}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function fmtRuntime(min?: number): string | null {
  if (!min || min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function DetailModal({
  visible,
  request,
  onClose,
  scaleFont,
}: {
  visible: boolean;
  request: ContentRequest | null;
  onClose: () => void;
  scaleFont: (n: number) => number;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const tmdbId = request?.content_details?.id;
  const mediaType = getMediaType(request?.content_details);

  const detailKey = useMemo(
    () => [`/api/tmdb/${mediaType}/${tmdbId ?? ""}`],
    [mediaType, tmdbId],
  );
  const { data: tmdb, isLoading: tmdbLoading } = useQuery<ContentDetails>({
    queryKey: detailKey,
    enabled: visible && !!tmdbId,
    staleTime: 1000 * 60 * 60,
  });

  if (!request) return null;

  // Merge stored content_details with fresh TMDB response, preferring fresh.
  const merged: ContentDetails = { ...(request.content_details ?? {}), ...(tmdb ?? {}) };
  const title = getTitle(merged);
  const year = getYear(merged);
  const poster = getPoster(merged, "w500");
  const backdrop = getBackdrop(merged) ?? poster;
  const sc = statusColor(request.status);
  const note = (request.admin_notes || "").trim();
  const userComment = (request.comments || "").trim();

  const isLandscape = width > height;
  const posterW = isLandscape ? Math.min(260, width * 0.22) : Math.min(180, width * 0.4);
  const posterH = Math.round(posterW * 1.5);

  const runtime = fmtRuntime(merged.runtime);
  const seasons = merged.number_of_seasons ? `${merged.number_of_seasons} season${merged.number_of_seasons === 1 ? "" : "s"}` : null;
  const episodes = merged.number_of_episodes ? `${merged.number_of_episodes} episode${merged.number_of_episodes === 1 ? "" : "s"}` : null;
  const rating = typeof merged.vote_average === "number" && merged.vote_average > 0
    ? merged.vote_average.toFixed(1)
    : null;
  const genres = (merged.genres || []).map((g) => g.name).filter(Boolean);

  const sheetMaxW = isLandscape ? Math.min(960, width - 48) : width - 24;
  const sheetMaxH = height - insets.top - insets.bottom - 24;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={modalStyles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            modalStyles.sheet,
            {
              width: sheetMaxW,
              height: sheetMaxH,
              marginTop: insets.top + 12,
              marginBottom: insets.bottom + 12,
            },
          ]}
        >
          {backdrop ? (
            <View style={modalStyles.heroWrap} pointerEvents="none">
              <Image source={{ uri: backdrop }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <LinearGradient
                colors={["rgba(8,8,8,0.35)", "rgba(8,8,8,0.92)", "rgba(8,8,8,1)"]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
              />
            </View>
          ) : null}

          <View style={modalStyles.headerRow}>
            <ThemedText style={[modalStyles.modalTitle, { fontSize: scaleFont(18) }]} numberOfLines={1}>
              Request Details
            </ThemedText>
            <CloseBtn onPress={onClose} />
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg }}
            showsVerticalScrollIndicator={false}
          >
            <View style={[modalStyles.heroBody, isLandscape ? { flexDirection: "row", gap: Spacing.lg } : { gap: Spacing.md, alignItems: "center" }]}>
              <View style={[modalStyles.posterCard, { width: posterW, height: posterH }]}>
                {poster ? (
                  <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <View style={[StyleSheet.absoluteFill, styles.posterPlaceholder]}>
                    <Feather name="film" size={48} color={Colors.dark.textSecondary} />
                  </View>
                )}
              </View>

              <View style={{ flex: 1, gap: Spacing.xs, minWidth: 0 }}>
                <View style={[modalStyles.statusPillSolid, { backgroundColor: sc.bg, alignSelf: "flex-start" }]}>
                  <ThemedText style={{ color: sc.text, fontSize: scaleFont(11), fontWeight: "800", letterSpacing: 0.5 }}>
                    {sc.label.toUpperCase()}
                  </ThemedText>
                </View>
                <ThemedText style={[modalStyles.heroTitle, { fontSize: scaleFont(22) }]}>
                  {title}
                </ThemedText>
                {merged.tagline ? (
                  <ThemedText style={[modalStyles.tagline, { fontSize: scaleFont(13) }]}>
                    {merged.tagline}
                  </ThemedText>
                ) : null}
                <View style={modalStyles.metaRow}>
                  {year ? <MetaPill icon="calendar" text={year} scaleFont={scaleFont} /> : null}
                  {rating ? <MetaPill icon="star" text={rating} scaleFont={scaleFont} /> : null}
                  {runtime ? <MetaPill icon="clock" text={runtime} scaleFont={scaleFont} /> : null}
                  {seasons ? <MetaPill icon="layers" text={seasons} scaleFont={scaleFont} /> : null}
                  {episodes ? <MetaPill icon="play-circle" text={episodes} scaleFont={scaleFont} /> : null}
                  <MetaPill icon={mediaType === "tv" ? "tv" : "film"} text={mediaType === "tv" ? "TV Series" : "Movie"} scaleFont={scaleFont} />
                </View>
                {genres.length ? (
                  <View style={modalStyles.genreRow}>
                    {genres.map((g) => (
                      <View key={g} style={modalStyles.genreChip}>
                        <ThemedText style={{ color: Colors.dark.text, fontSize: scaleFont(11) }}>{g}</ThemedText>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>

            {tmdbLoading && !merged.overview ? (
              <View style={{ alignItems: "center", paddingVertical: Spacing.md }}>
                <ActivityIndicator color={Colors.dark.accent} />
              </View>
            ) : null}

            {merged.overview ? (
              <View style={modalStyles.section}>
                <SectionTitle icon="align-left" text="Overview" scaleFont={scaleFont} />
                <ThemedText style={[modalStyles.bodyText, { fontSize: scaleFont(13) }]}>
                  {merged.overview}
                </ThemedText>
              </View>
            ) : null}

            <View style={[modalStyles.section, modalStyles.adminBox]}>
              <SectionTitle icon="message-square" text="Admin notes" scaleFont={scaleFont} accent />
              {note ? (
                <ThemedText style={[modalStyles.bodyText, { fontSize: scaleFont(13) }]} selectable>
                  {note}
                </ThemedText>
              ) : (
                <ThemedText style={[modalStyles.muted, { fontSize: scaleFont(12) }]}>
                  No admin notes yet.
                </ThemedText>
              )}
            </View>

            {userComment ? (
              <View style={modalStyles.section}>
                <SectionTitle icon="user" text="Your comment" scaleFont={scaleFont} />
                <ThemedText style={[modalStyles.bodyText, { fontSize: scaleFont(13) }]} selectable>
                  {userComment}
                </ThemedText>
              </View>
            ) : null}

            <View style={modalStyles.section}>
              <SectionTitle icon="info" text="Request info" scaleFont={scaleFont} />
              <InfoRow label="Submitted" value={new Date(request.created_at).toLocaleString()} scaleFont={scaleFont} />
              {tmdbId ? <InfoRow label="TMDB ID" value={String(tmdbId)} scaleFont={scaleFont} /> : null}
              {merged.original_language ? (
                <InfoRow label="Language" value={merged.original_language.toUpperCase()} scaleFont={scaleFont} />
              ) : null}
              {merged.status ? <InfoRow label="TMDB status" value={merged.status} scaleFont={scaleFont} /> : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function MetaPill({ icon, text, scaleFont }: { icon: keyof typeof Feather.glyphMap; text: string; scaleFont: (n: number) => number }) {
  return (
    <View style={modalStyles.metaPill}>
      <Feather name={icon} size={11} color={Colors.dark.accent} />
      <ThemedText style={{ color: Colors.dark.text, fontSize: scaleFont(11), fontWeight: "600" }}>{text}</ThemedText>
    </View>
  );
}

function SectionTitle({ icon, text, scaleFont, accent }: { icon: keyof typeof Feather.glyphMap; text: string; scaleFont: (n: number) => number; accent?: boolean }) {
  return (
    <View style={modalStyles.sectionTitle}>
      <Feather name={icon} size={14} color={Colors.dark.accent} />
      <ThemedText style={{ color: accent ? Colors.dark.accent : Colors.dark.text, fontSize: scaleFont(14), fontWeight: "700" }}>
        {text}
      </ThemedText>
    </View>
  );
}

function InfoRow({ label, value, scaleFont }: { label: string; value: string; scaleFont: (n: number) => number }) {
  return (
    <View style={modalStyles.infoRow}>
      <ThemedText style={{ color: Colors.dark.textSecondary, fontSize: scaleFont(12), flex: 1 }}>{label}</ThemedText>
      <ThemedText style={{ color: Colors.dark.text, fontSize: scaleFont(12), fontWeight: "600", flex: 2, textAlign: "right" }}>
        {value}
      </ThemedText>
    </View>
  );
}

export default function ContentRequestsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { userInfo } = useAuth();
  const { scaleFont } = useUISettings();
  const queryClient = useQueryClient();

  const username = userInfo?.user_info?.username ?? null;

  const [selectedId, setSelectedId] = useState<string | number | null>(null);

  const padH = Math.max(insets.left + Spacing.xs, Spacing.md);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.sm);
  const gap = Spacing.sm;

  const numCols = Math.max(3, Math.floor(width / 170));
  const cardWidth = Math.floor((width - padH * 2 - gap * (numCols - 1)) / numCols);
  const cardHeight = Math.round(cardWidth * 1.5) + 88;

  const queryKey = useMemo(
    () => [`/api/content-requests?username=${encodeURIComponent(username ?? "")}`],
    [username],
  );
  const { data, isLoading, isFetching, refetch, error } = useQuery<{ requests: ContentRequest[] }>({
    queryKey,
    enabled: !!username,
    // Always pull fresh data — admin can change status/notes any time.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  // Refetch every time the screen regains focus (e.g. user navigates back to it).
  useFocusEffect(
    useCallback(() => {
      if (username) {
        queryClient.invalidateQueries({ queryKey });
      }
    }, [username, queryClient, queryKey]),
  );

  const requests = data?.requests ?? [];
  const selected = useMemo(
    () => requests.find((r) => String(r.id) === String(selectedId)) ?? null,
    [requests, selectedId],
  );

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const renderItem = useCallback(
    ({ item }: { item: ContentRequest }) => (
      <RequestCard
        item={item}
        width={cardWidth}
        height={cardHeight}
        scaleFont={scaleFont}
        onPress={() => setSelectedId(item.id)}
      />
    ),
    [cardWidth, cardHeight, scaleFont],
  );

  const keyExtractor = useCallback((item: ContentRequest) => String(item.id), []);

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <BackBtn onPress={() => navigation.goBack()} />
        <ThemedText style={[styles.headerTitle, { fontSize: scaleFont(18) }]} numberOfLines={1}>
          Content Requests
        </ThemedText>
        <View style={styles.countBadge}>
          <ThemedText style={[styles.countText, { fontSize: scaleFont(12) }]}>
            {requests.length}
          </ThemedText>
        </View>
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      <View style={[styles.banner, { marginHorizontal: padH }]}>
        <Feather name="info" size={16} color={Colors.dark.accent} />
        <ThemedText style={[styles.bannerText, { fontSize: scaleFont(13) }]} numberOfLines={2}>
          To make content requests head to{" "}
          <ThemedText style={[styles.bannerLink, { fontSize: scaleFont(13) }]}>ultracast.co.uk</ThemedText>
        </ThemedText>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={[styles.muted, { marginTop: Spacing.md }]}>Loading your requests…</ThemedText>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Feather name="alert-circle" size={36} color={Colors.dark.accent} />
          <ThemedText style={[styles.muted, { marginTop: Spacing.md }]}>
            Couldn't load content requests.
          </ThemedText>
          <RetryBtn onPress={handleRefresh} />
        </View>
      ) : requests.length === 0 ? (
        <View style={styles.centered}>
          <Feather name="inbox" size={48} color={Colors.dark.textSecondary} />
          <ThemedText style={[styles.emptyTitle, { fontSize: scaleFont(16) }]}>
            No content requests have been made
          </ThemedText>
          <ThemedText style={[styles.muted, { marginTop: Spacing.xs, fontSize: scaleFont(12) }]}>
            Visit ultracast.co.uk to submit one.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={requests}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          numColumns={numCols}
          key={`cols-${numCols}`}
          columnWrapperStyle={{ gap }}
          contentContainerStyle={{
            paddingHorizontal: padH,
            paddingBottom: padB + Spacing.lg,
            paddingTop: Spacing.sm,
            gap,
          }}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={handleRefresh}
              tintColor={Colors.dark.accent}
              colors={[Colors.dark.accent]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <DetailModal
        visible={!!selected}
        request={selected}
        onClose={() => setSelectedId(null)}
        scaleFont={scaleFont}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  headerTitle: { flex: 1, fontWeight: "700", color: Colors.dark.text },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  iconBtnActive: { borderColor: Colors.dark.accent },
  countBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,102,0,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.45)",
  },
  countText: { color: Colors.dark.accent, fontWeight: "700" },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)" },
  banner: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.35)",
    backgroundColor: "rgba(255,102,0,0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  bannerText: { color: Colors.dark.text, flex: 1 },
  bannerLink: { color: Colors.dark.accent, fontWeight: "700" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.lg },
  muted: { color: Colors.dark.textSecondary, textAlign: "center" },
  emptyTitle: { color: Colors.dark.text, fontWeight: "700", marginTop: Spacing.md },
  retryBtn: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.accent,
    overflow: "hidden",
    backgroundColor: "rgba(255,102,0,0.04)",
  },
  retryBtnActive: {
    borderColor: "#FFD700",
    backgroundColor: "rgba(255,102,0,0.12)",
  },
  retryText: { color: Colors.dark.accent, fontWeight: "700" },
  card: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardActive: { borderColor: Colors.dark.accent, backgroundColor: "rgba(255,102,0,0.08)" },
  posterWrap: { width: "100%", backgroundColor: "#111", position: "relative" },
  posterPlaceholder: { alignItems: "center", justifyContent: "center" },
  statusPill: {
    position: "absolute",
    top: 6,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    maxWidth: "92%",
  },
  statusText: { fontWeight: "800", letterSpacing: 0.5 },
  cardBody: { padding: Spacing.sm, gap: 4 },
  cardTitle: { color: Colors.dark.text, fontWeight: "700" },
  cardYear: { color: Colors.dark.textSecondary, fontWeight: "600" },
  notesWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    paddingTop: 4,
  },
  notesText: { color: Colors.dark.textSecondary, flex: 1, lineHeight: 15 },
});

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheet: {
    borderRadius: BorderRadius.lg,
    backgroundColor: "#0E0E0E",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
    overflow: "hidden",
  },
  heroWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 240,
    opacity: 0.75,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(8,8,8,0.6)",
  },
  modalTitle: { flex: 1, color: Colors.dark.text, fontWeight: "700" },
  heroBody: {},
  posterCard: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.3)",
  },
  statusPillSolid: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  heroTitle: { color: Colors.dark.text, fontWeight: "800", marginTop: 4 },
  tagline: { color: Colors.dark.textSecondary, fontStyle: "italic" },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  genreRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  genreChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(255,102,0,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.35)",
  },
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bodyText: { color: Colors.dark.text, lineHeight: 20 },
  muted: { color: Colors.dark.textSecondary, fontStyle: "italic" },
  adminBox: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.4)",
    backgroundColor: "rgba(255,102,0,0.06)",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
});
