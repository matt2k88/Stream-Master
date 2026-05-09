import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
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
  overview?: string | null;
  release_date?: string | null;
  first_air_date?: string | null;
  media_type?: "movie" | "tv" | string;
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

const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

function getTitle(d: ContentDetails | null | undefined): string {
  if (!d) return "Untitled request";
  return d.title || d.name || "Untitled request";
}

function getPoster(d: ContentDetails | null | undefined): string | null {
  if (!d?.poster_path) return null;
  const p = d.poster_path.startsWith("/") ? d.poster_path : `/${d.poster_path}`;
  return `${TMDB_IMG}${p}`;
}

function getYear(d: ContentDetails | null | undefined): string | null {
  const raw = d?.release_date || d?.first_air_date || null;
  if (!raw) return null;
  return raw.slice(0, 4);
}

function statusColor(status: string | null | undefined): { bg: string; text: string; label: string } {
  const s = (status || "pending").toLowerCase();
  if (s === "available" || s === "added" || s === "completed" || s === "approved") {
    return { bg: "rgba(46,204,113,0.18)", text: "#2ECC71", label: status || "Available" };
  }
  if (s === "unavailable" || s === "rejected" || s === "denied") {
    return { bg: "rgba(231,76,60,0.18)", text: "#E74C3C", label: status || "Unavailable" };
  }
  if (s === "in_progress" || s === "processing" || s === "working") {
    return { bg: "rgba(52,152,219,0.18)", text: "#3498DB", label: status || "In Progress" };
  }
  return { bg: "rgba(255,102,0,0.18)", text: Colors.dark.accent, label: status || "Pending" };
}

function BackBtn({ onPress }: { onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[styles.iconBtn, isActive && styles.iconBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
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

function RequestCard({
  item,
  width,
  height,
  scaleFont,
}: {
  item: ContentRequest;
  width: number;
  height: number;
  scaleFont: (n: number) => number;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
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
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      <View style={[styles.posterWrap, { height: posterH }]}>
        {poster ? (
          <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.posterPlaceholder]}>
            <Feather name="film" size={36} color={Colors.dark.textSecondary} />
          </View>
        )}
        <View style={[styles.statusPill, { backgroundColor: sc.bg, borderColor: sc.text }]}>
          <ThemedText style={[styles.statusText, { color: sc.text, fontSize: scaleFont(10) }]} numberOfLines={1}>
            {sc.label.toUpperCase()}
          </ThemedText>
        </View>
        {year ? (
          <View style={styles.yearPill}>
            <ThemedText style={[styles.yearText, { fontSize: scaleFont(10) }]}>{year}</ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.cardBody}>
        <ThemedText style={[styles.cardTitle, { fontSize: scaleFont(13) }]} numberOfLines={2}>
          {title}
        </ThemedText>
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

export default function ContentRequestsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { userInfo } = useAuth();
  const { scaleFont } = useUISettings();

  const username = userInfo?.user_info?.username ?? null;

  const padH = Math.max(insets.left + Spacing.xs, Spacing.md);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.sm);
  const gap = Spacing.sm;

  const numCols = Math.max(3, Math.floor(width / 170));
  const cardWidth = Math.floor((width - padH * 2 - gap * (numCols - 1)) / numCols);
  const cardHeight = Math.round(cardWidth * 1.5) + 70;

  const queryKey = useMemo(
    () => [`/api/content-requests?username=${encodeURIComponent(username ?? "")}`],
    [username],
  );
  const { data, isLoading, isFetching, refetch, error } = useQuery<{ requests: ContentRequest[] }>({
    queryKey,
    enabled: !!username,
  });

  const requests = data?.requests ?? [];

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const renderItem = useCallback(
    ({ item }: { item: ContentRequest }) => (
      <RequestCard item={item} width={cardWidth} height={cardHeight} scaleFont={scaleFont} />
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
          <Pressable onPress={handleRefresh} style={styles.retryBtn}>
            <ThemedText style={styles.retryText}>Try again</ThemedText>
          </Pressable>
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
  },
  retryText: { color: Colors.dark.accent, fontWeight: "700" },
  card: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardActive: { borderColor: Colors.dark.accent, backgroundColor: "rgba(255,102,0,0.06)" },
  posterWrap: { width: "100%", backgroundColor: "#111", position: "relative" },
  posterPlaceholder: { alignItems: "center", justifyContent: "center" },
  statusPill: {
    position: "absolute",
    top: 6,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: "90%",
  },
  statusText: { fontWeight: "800", letterSpacing: 0.5 },
  yearPill: {
    position: "absolute",
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  yearText: { color: "#fff", fontWeight: "700" },
  cardBody: { padding: Spacing.sm, gap: Spacing.xs },
  cardTitle: { color: Colors.dark.text, fontWeight: "700" },
  notesWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    paddingTop: 2,
  },
  notesText: { color: Colors.dark.textSecondary, flex: 1, lineHeight: 15 },
});
