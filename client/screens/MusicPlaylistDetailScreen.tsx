import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, Pressable, FlatList, ActivityIndicator, Alert } from "react-native";
import { useNavigation, useRoute, useFocusEffect, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { useMusic, MusicTrack } from "@/contexts/MusicContext";
import { useProfile } from "@/contexts/ProfileContext";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface PlaylistTrack extends MusicTrack {
  id: string;
  position: number;
}

export default function MusicPlaylistDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, "MusicPlaylistDetail">>();
  const insets = useSafeAreaInsets();
  const { playQueue, current } = useMusic();
  const { activeProfile } = useProfile();
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [loading, setLoading] = useState(true);

  const { playlistId, name } = route.params;

  const reload = useCallback(async () => {
    if (!activeProfile) return;
    try {
      const url = new URL(`/api/music/playlists/${playlistId}/tracks`, getApiUrl());
      url.searchParams.set("profile_id", activeProfile.id);
      const res = await fetch(url.toString());
      if (res.ok) {
        const json = await res.json();
        setTracks(json.tracks ?? []);
      }
    } catch {}
    setLoading(false);
  }, [playlistId, activeProfile]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const playAll = () => {
    if (tracks.length === 0) return;
    const queue: MusicTrack[] = tracks.map((t) => ({
      itunes_track_id: t.itunes_track_id, title: t.title, artist: t.artist,
      album: t.album, artwork_url: t.artwork_url, duration_sec: t.duration_sec,
    }));
    playQueue(queue, 0);
  };

  const playFrom = (index: number) => {
    const queue: MusicTrack[] = tracks.map((t) => ({
      itunes_track_id: t.itunes_track_id, title: t.title, artist: t.artist,
      album: t.album, artwork_url: t.artwork_url, duration_sec: t.duration_sec,
    }));
    playQueue(queue, index);
  };

  const moveTrack = async (index: number, delta: number) => {
    if (!activeProfile) return;
    const target = index + delta;
    if (target < 0 || target >= tracks.length) return;
    const next = [...tracks];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setTracks(next);
    try {
      await fetch(new URL(`/api/music/playlists/${playlistId}/tracks/order`, getApiUrl()).toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: activeProfile.id, track_ids: next.map(t => t.id) }),
      });
    } catch {}
  };

  const removeTrack = (t: PlaylistTrack) => {
    Alert.alert("Remove from playlist?", t.title, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        if (!activeProfile) return;
        const url = new URL(`/api/music/playlist-tracks/${t.id}`, getApiUrl());
        url.searchParams.set("profile_id", activeProfile.id);
        await fetch(url.toString(), { method: "DELETE" });
        reload();
      }},
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={Colors.dark.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle} numberOfLines={1}>{name}</ThemedText>
        <Pressable onPress={playAll} style={[styles.iconBtn, { backgroundColor: Colors.dark.accent, borderColor: Colors.dark.accent }]}>
          <Feather name="play" size={18} color="#fff" />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator color={Colors.dark.accent} /></View>
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{
            paddingHorizontal: Spacing.lg,
            paddingBottom: (current ? 96 : 0) + insets.bottom + Spacing.xl,
          }}
          ListEmptyComponent={
            <ThemedText style={styles.hint}>This playlist is empty. Add songs from search.</ThemedText>
          }
          renderItem={({ item, index }) => (
            <Pressable
              style={styles.row}
              onPress={() => playFrom(index)}
              onLongPress={() => removeTrack(item)}
            >
              {item.artwork_url ? (
                <Image source={{ uri: item.artwork_url }} style={styles.art} contentFit="cover" />
              ) : (
                <View style={[styles.art, styles.artFallback]}><Feather name="music" size={18} color={Colors.dark.accent} /></View>
              )}
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.rowTitle} numberOfLines={1}>{item.title}</ThemedText>
                <ThemedText style={styles.rowSub} numberOfLines={1}>{item.artist}</ThemedText>
              </View>
              <Pressable onPress={() => moveTrack(index, -1)} disabled={index === 0} style={[styles.removeBtn, index === 0 && { opacity: 0.3 }]}>
                <Feather name="chevron-up" size={18} color={Colors.dark.textSecondary} />
              </Pressable>
              <Pressable onPress={() => moveTrack(index, +1)} disabled={index === tracks.length - 1} style={[styles.removeBtn, index === tracks.length - 1 && { opacity: 0.3 }]}>
                <Feather name="chevron-down" size={18} color={Colors.dark.textSecondary} />
              </Pressable>
              <Pressable onPress={() => removeTrack(item)} style={styles.removeBtn}>
                <Feather name="x" size={18} color={Colors.dark.textSecondary} />
              </Pressable>
            </Pressable>
          )}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.md },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.full, backgroundColor: Colors.dark.backgroundDefault, borderWidth: 1, borderColor: Colors.dark.border },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: "700", color: Colors.dark.text },
  loadingWrap: { padding: Spacing.xl, alignItems: "center" },
  hint: { color: Colors.dark.textSecondary, padding: Spacing.xl, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.md, paddingVertical: 8 },
  art: { width: 48, height: 48, borderRadius: 6, backgroundColor: "#1A1A1A" },
  artFallback: { alignItems: "center", justifyContent: "center" },
  rowTitle: { color: Colors.dark.text, fontSize: 14, fontWeight: "600" },
  rowSub: { color: Colors.dark.textSecondary, fontSize: 12, marginTop: 2 },
  removeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
});
