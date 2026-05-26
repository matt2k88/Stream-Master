import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { useMusic, MusicTrack } from "@/contexts/MusicContext";
import { useMusicLayout } from "@/components/MusicHost";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface BrowseRow {
  id: string;
  title: string;
  tracks: MusicTrack[];
}

export default function MusicHomeScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { playQueue } = useMusic();
  const { rightInset, bottomInset } = useMusicLayout();
  const [rows, setRows] = useState<BrowseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(new URL("/api/music/browse", getApiUrl()).toString());
        if (res.ok) {
          const json = await res.json();
          setRows(json.rows ?? []);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const onTrackPress = useCallback(
    (rowTracks: MusicTrack[], index: number) => {
      playQueue(rowTracks, index);
    },
    [playQueue],
  );

  return (
    <ThemedView style={[styles.container, { paddingRight: rightInset }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={Colors.dark.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Music</ThemedText>
        <View style={styles.headerActions}>
          <Pressable onPress={() => navigation.navigate("MusicPlaylists")} style={styles.iconBtn}>
            <Feather name="list" size={20} color={Colors.dark.text} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate("MusicSearch")} style={styles.iconBtn}>
            <Feather name="search" size={20} color={Colors.dark.text} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: bottomInset + insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.md,
        }}
      >
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Colors.dark.accent} />
          </View>
        ) : (
          rows.map((row) => (
            <View key={row.id} style={styles.row}>
              <ThemedText style={styles.rowTitle}>{row.title}</ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.md, paddingRight: Spacing.lg }}>
                {row.tracks.map((t, i) => (
                  <TrackTile key={t.itunes_track_id} track={t} onPress={() => onTrackPress(row.tracks, i)} />
                ))}
              </ScrollView>
            </View>
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

function TrackTile({ track, onPress }: { track: MusicTrack; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.tile, focused && styles.tileFocused]}
    >
      {track.artwork_url ? (
        <Image source={{ uri: track.artwork_url }} style={styles.tileArt} contentFit="cover" />
      ) : (
        <View style={[styles.tileArt, styles.tileArtFallback]}>
          <Feather name="music" size={28} color={Colors.dark.accent} />
        </View>
      )}
      <ThemedText style={styles.tileTitle} numberOfLines={1}>{track.title}</ThemedText>
      <ThemedText style={styles.tileArtist} numberOfLines={1}>{track.artist}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.md,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.full, backgroundColor: Colors.dark.backgroundDefault, borderWidth: 1, borderColor: Colors.dark.border },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: "700", color: Colors.dark.text },
  headerActions: { flexDirection: "row", gap: Spacing.sm },
  loadingWrap: { padding: Spacing.xl, alignItems: "center" },
  row: { marginBottom: Spacing.xl },
  rowTitle: { fontSize: 16, fontWeight: "700", color: Colors.dark.text, marginBottom: Spacing.sm },
  tile: { width: 140 },
  tileFocused: { transform: [{ scale: 1.04 }] },
  tileArt: { width: 140, height: 140, borderRadius: BorderRadius.sm, backgroundColor: "#1A1A1A" },
  tileArtFallback: { alignItems: "center", justifyContent: "center" },
  tileTitle: { color: Colors.dark.text, fontSize: 13, fontWeight: "600", marginTop: 6 },
  tileArtist: { color: Colors.dark.textSecondary, fontSize: 11, marginTop: 2 },
});
