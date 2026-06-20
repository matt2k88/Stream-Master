import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  Image,
  Modal,
  Alert,
} from "react-native";
import { useNavigation, useRoute, RouteProp, useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import type { MusicPlaylistTrack, MusicTrack } from "@/lib/music-types";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type RouteParams = RouteProp<RootStackParamList, "PlaylistDetail">;

function fmtTime(sec: number) {
  if (!sec || isNaN(sec) || sec < 0) return "--:--";
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

function TrackItem({
  track,
  index,
  onRemove,
  onPlay,
  isLikedSongs,
}: {
  track: MusicPlaylistTrack;
  index: number;
  onRemove: () => void;
  onPlay: () => void;
  isLikedSongs: boolean;
}) {
  return (
    <Pressable style={styles.trackRow} onPress={onPlay}>
      <View style={styles.trackIndex}>
        <ThemedText style={styles.trackIndexText}>{index + 1}</ThemedText>
      </View>
      {track.thumbnail ? (
        <Image source={{ uri: track.thumbnail }} style={styles.trackThumb} />
      ) : (
        <View style={[styles.trackThumb, styles.trackThumbPlaceholder]}>
          <Feather name="music" size={14} color={Colors.dark.textSecondary} />
        </View>
      )}
      <View style={styles.trackMeta}>
        <ThemedText style={styles.trackTitle} numberOfLines={1}>{track.title}</ThemedText>
        <ThemedText style={styles.trackArtist} numberOfLines={1}>
          {track.artist}{track.album ? ` · ${track.album}` : ""}
        </ThemedText>
      </View>
      <ThemedText style={styles.trackDuration}>{fmtTime(track.duration_sec)}</ThemedText>
      {!isLikedSongs ? null : null}
      <Pressable style={styles.removeBtn} onPress={onRemove} hitSlop={8}>
        <Feather name="trash-2" size={16} color="rgba(239,68,68,0.7)" />
      </Pressable>
    </Pressable>
  );
}

export default function PlaylistDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteParams>();
  const { playlistId, playlistName, isLikedSongs } = route.params;
  const insets = useSafeAreaInsets();

  const [tracks, setTracks] = useState<MusicPlaylistTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(playlistName);
  const [nameInput, setNameInput] = useState(playlistName);
  const [removing, setRemoving] = useState<string | null>(null);

  const fetchTracks = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${getApiUrl()}/api/music/playlists/${playlistId}/tracks`);
      const data = await r.json();
      if (r.ok) setTracks(data ?? []);
    } catch {}
    setLoading(false);
  }, [playlistId]);

  // Re-fetch every time this screen comes into focus (e.g. after adding from player)
  useFocusEffect(useCallback(() => { fetchTracks(); }, [fetchTracks]));

  const handleRemove = useCallback(async (trackId: string) => {
    setRemoving(trackId);
    try {
      await fetch(`${getApiUrl()}/api/music/playlists/${playlistId}/tracks/${trackId}`, { method: "DELETE" });
      setTracks((prev) => prev.filter((t) => t.id !== trackId));
    } catch {}
    setRemoving(null);
  }, [playlistId]);

  const handleRename = useCallback(async () => {
    const name = nameInput.trim();
    if (!name || name === newName) { setRenaming(false); return; }
    try {
      const r = await fetch(`${getApiUrl()}/api/music/playlists/${playlistId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (r.ok) { setNewName(name); }
    } catch {}
    setRenaming(false);
  }, [nameInput, newName, playlistId]);

  const handlePlayAll = useCallback((startIndex = 0) => {
    if (!tracks.length) return;
    const queue: MusicTrack[] = tracks.map((t) => ({
      videoId: "",
      title: t.title,
      artist: t.artist,
      album: t.album,
      duration: t.duration_sec,
      thumbnail: t.thumbnail,
      searchKey: t.search_key,
    }));
    navigation.navigate("MusicPlayer", {
      queue,
      startIndex,
      contextName: newName,
    });
  }, [tracks, newName, navigation]);

  const padTop = insets.top + 8;

  return (
    <ThemedView style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: padTop }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={Colors.dark.text} />
        </Pressable>

        {renaming && !isLikedSongs ? (
          <TextInput
            style={styles.renameInput}
            value={nameInput}
            onChangeText={setNameInput}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleRename}
            onBlur={handleRename}
            selectTextOnFocus
          />
        ) : (
          <Pressable
            style={styles.titleWrap}
            onPress={() => { if (!isLikedSongs) { setRenaming(true); setNameInput(newName); } }}
            hitSlop={4}
          >
            {isLikedSongs ? (
              <Feather name="heart" size={18} color={Colors.dark.accent} style={{ marginRight: 8 }} />
            ) : null}
            <ThemedText style={styles.headerTitle} numberOfLines={1}>{newName}</ThemedText>
            {!isLikedSongs ? (
              <Feather name="edit-2" size={13} color={Colors.dark.textSecondary} style={{ marginLeft: 6 }} />
            ) : null}
          </Pressable>
        )}

        <Pressable
          style={[styles.playAllBtn, !tracks.length && { opacity: 0.4 }]}
          onPress={() => handlePlayAll(0)}
          disabled={!tracks.length}
          hitSlop={8}
        >
          <Feather name="play" size={14} color="#fff" />
          <ThemedText style={styles.playAllText}>Play All</ThemedText>
        </Pressable>
      </View>

      {/* Track count */}
      <View style={styles.subHeader}>
        <ThemedText style={styles.trackCount}>
          {tracks.length} {tracks.length === 1 ? "song" : "songs"}
        </ThemedText>
        {tracks.length > 1 ? (
          <Pressable
            style={styles.shuffleBtn}
            onPress={() => handlePlayAll(Math.floor(Math.random() * tracks.length))}
            hitSlop={8}
          >
            <Feather name="shuffle" size={13} color={Colors.dark.accent} />
            <ThemedText style={styles.shuffleBtnText}>Shuffle</ThemedText>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.centred}>
          <ActivityIndicator color={Colors.dark.accent} size="large" />
        </View>
      ) : tracks.length === 0 ? (
        <View style={styles.centred}>
          <Feather name="music" size={52} color="rgba(255,102,0,0.2)" />
          <ThemedText style={styles.emptyTitle}>No songs yet</ThemedText>
          <ThemedText style={styles.emptySubtitle}>
            {isLikedSongs
              ? "Tap the heart on any track to add it here"
              : "Tap + on any track to add it to this playlist"}
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          renderItem={({ item, index }) =>
            removing === item.id ? (
              <View style={[styles.trackRow, { opacity: 0.4 }]}>
                <ActivityIndicator color={Colors.dark.accent} size="small" style={{ flex: 1 }} />
              </View>
            ) : (
              <TrackItem
                track={item}
                index={index}
                isLikedSongs={!!isLikedSongs}
                onRemove={() => handleRemove(item.id)}
                onPlay={() => handlePlayAll(index)}
              />
            )
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },

  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.sm,
  },
  backBtn: { padding: 6, borderRadius: BorderRadius.sm },
  titleWrap: { flex: 1, flexDirection: "row", alignItems: "center" },
  headerTitle: { fontSize: 19, fontWeight: "700", color: Colors.dark.text, flexShrink: 1 },
  renameInput: {
    flex: 1, fontSize: 19, fontWeight: "700",
    color: Colors.dark.text, borderBottomWidth: 2,
    borderBottomColor: Colors.dark.accent, paddingVertical: 2,
  },
  playAllBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: Colors.dark.accent, borderRadius: BorderRadius.md,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  playAllText: { fontSize: 13, fontWeight: "700", color: "#fff" },

  subHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.md,
  },
  trackCount: { fontSize: 13, color: Colors.dark.textSecondary },
  shuffleBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  shuffleBtnText: { fontSize: 13, color: Colors.dark.accent, fontWeight: "600" },

  trackRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)",
  },
  trackIndex: { width: 22, alignItems: "center" },
  trackIndexText: { fontSize: 12, color: Colors.dark.textSecondary },
  trackThumb: { width: 46, height: 46, borderRadius: BorderRadius.sm },
  trackThumbPlaceholder: {
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center", alignItems: "center",
  },
  trackMeta: { flex: 1, gap: 2 },
  trackTitle: { fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  trackArtist: { fontSize: 12, color: Colors.dark.textSecondary },
  trackDuration: { fontSize: 11, color: Colors.dark.textSecondary, minWidth: 34, textAlign: "right" },
  removeBtn: { padding: 6 },

  centred: { flex: 1, justifyContent: "center", alignItems: "center", gap: Spacing.md, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: Colors.dark.text },
  emptySubtitle: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center", lineHeight: 19 },
});
