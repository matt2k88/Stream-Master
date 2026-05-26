import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, Pressable, Modal, FlatList, ActivityIndicator, TextInput, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { useProfile } from "@/contexts/ProfileContext";
import type { MusicTrack } from "@/contexts/MusicContext";

interface Playlist { id: string; name: string; track_count: number; }

export default function AddToPlaylistModal({ track, onClose }: { track: MusicTrack | null; onClose: () => void }) {
  const { activeProfile } = useProfile();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const reload = useCallback(async () => {
    if (!activeProfile) return;
    setLoading(true);
    try {
      const url = new URL("/api/music/playlists", getApiUrl());
      url.searchParams.set("profile_id", activeProfile.id);
      const res = await fetch(url.toString());
      if (res.ok) {
        const json = await res.json();
        setPlaylists(json.playlists ?? []);
      }
    } catch {}
    setLoading(false);
  }, [activeProfile]);

  useEffect(() => { if (track) reload(); }, [track, reload]);

  const addToPlaylist = async (playlistId: string) => {
    if (!track || !activeProfile) return;
    try {
      const res = await fetch(new URL(`/api/music/playlists/${playlistId}/tracks`, getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: activeProfile.id,
          itunes_track_id: track.itunes_track_id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          artwork_url: track.artwork_url,
          duration_sec: track.duration_sec,
        }),
      });
      if (res.ok) {
        onClose();
      } else {
        Alert.alert("Couldn't add", "Please try again.");
      }
    } catch {
      Alert.alert("Couldn't add", "Please try again.");
    }
  };

  const createAndAdd = async () => {
    if (!activeProfile || !newName.trim() || !track) return;
    try {
      const res = await fetch(new URL("/api/music/playlists", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: activeProfile.id, name: newName.trim() }),
      });
      if (res.ok) {
        const pl = await res.json();
        await addToPlaylist(pl.id);
        setCreating(false);
        setNewName("");
      }
    } catch {}
  };

  return (
    <Modal visible={!!track} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.headerRow}>
            <ThemedText style={styles.title}>Add to playlist</ThemedText>
            <Pressable onPress={onClose}><Feather name="x" size={20} color={Colors.dark.text} /></Pressable>
          </View>
          {track ? (
            <ThemedText style={styles.trackName} numberOfLines={1}>{track.title} — {track.artist}</ThemedText>
          ) : null}

          {creating ? (
            <View style={{ gap: Spacing.sm }}>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="Playlist name"
                placeholderTextColor={Colors.dark.textSecondary}
                style={styles.input}
                autoFocus
              />
              <View style={{ flexDirection: "row", gap: Spacing.sm }}>
                <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => { setCreating(false); setNewName(""); }}>
                  <ThemedText style={styles.btnText}>Cancel</ThemedText>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnPrimary]} onPress={createAndAdd}>
                  <ThemedText style={[styles.btnText, { color: "#fff" }]}>Create & Add</ThemedText>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              <Pressable style={styles.createRow} onPress={() => setCreating(true)}>
                <Feather name="plus" size={18} color={Colors.dark.accent} />
                <ThemedText style={[styles.rowText, { color: Colors.dark.accent }]}>New playlist…</ThemedText>
              </Pressable>
              {loading ? (
                <ActivityIndicator color={Colors.dark.accent} style={{ marginVertical: Spacing.lg }} />
              ) : (
                <FlatList
                  data={playlists}
                  keyExtractor={(p) => p.id}
                  style={{ maxHeight: 280 }}
                  renderItem={({ item }) => (
                    <Pressable style={styles.plRow} onPress={() => addToPlaylist(item.id)}>
                      <Feather name="list" size={16} color={Colors.dark.textSecondary} />
                      <ThemedText style={styles.rowText} numberOfLines={1}>{item.name}</ThemedText>
                      <ThemedText style={styles.countText}>{item.track_count}</ThemedText>
                    </Pressable>
                  )}
                  ListEmptyComponent={<ThemedText style={styles.empty}>No playlists yet.</ThemedText>}
                />
              )}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: Spacing.xl },
  card: { width: "100%", maxWidth: 420, backgroundColor: Colors.dark.backgroundDefault, borderRadius: BorderRadius.md, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.dark.border, gap: Spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: Colors.dark.text, fontSize: 18, fontWeight: "700" },
  trackName: { color: Colors.dark.textSecondary, fontSize: 12, marginBottom: Spacing.sm },
  createRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.dark.border },
  plRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.dark.border },
  rowText: { color: Colors.dark.text, fontSize: 14, fontWeight: "600", flex: 1 },
  countText: { color: Colors.dark.textSecondary, fontSize: 12 },
  empty: { color: Colors.dark.textSecondary, padding: Spacing.lg, textAlign: "center" },
  input: { backgroundColor: Colors.dark.backgroundSecondary, color: Colors.dark.text, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.dark.border },
  btn: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.sm, alignItems: "center", justifyContent: "center" },
  btnGhost: { borderWidth: 1, borderColor: Colors.dark.border },
  btnPrimary: { backgroundColor: Colors.dark.accent },
  btnText: { color: Colors.dark.text, fontWeight: "700", fontSize: 14 },
});
