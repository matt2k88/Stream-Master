import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, Pressable, FlatList, ActivityIndicator, Alert, Modal, TextInput } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { useProfile } from "@/contexts/ProfileContext";
import { useMusic } from "@/contexts/MusicContext";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Playlist {
  id: string;
  name: string;
  track_count: number;
  cover_url: string | null;
  updated_at: string;
}

export default function MusicPlaylistsScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { activeProfile } = useProfile();
  const { current } = useMusic();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renameTarget, setRenameTarget] = useState<Playlist | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const reload = useCallback(async () => {
    if (!activeProfile) return;
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

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const createPlaylist = async () => {
    if (!activeProfile || !newName.trim()) return;
    try {
      const res = await fetch(new URL("/api/music/playlists", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: activeProfile.id, name: newName.trim() }),
      });
      if (res.ok) {
        setCreateOpen(false);
        setNewName("");
        reload();
        return;
      }
      const body = await res.json().catch(() => ({} as any));
      const msg = String(body?.error ?? "Unknown error");
      const hint = /music_playlists|relation .* does not exist|schema cache/i.test(msg)
        ? "\n\nThe music tables haven't been created yet. Run migrations/012_music_playlists.sql in your Supabase SQL editor."
        : "";
      Alert.alert("Couldn't create playlist", msg + hint);
    } catch (e: any) {
      Alert.alert("Couldn't create playlist", String(e?.message ?? e));
    }
  };

  const deletePlaylist = (p: Playlist) => {
    Alert.alert("Delete playlist?", `"${p.name}" will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          if (!activeProfile) return;
          const url = new URL(`/api/music/playlists/${p.id}`, getApiUrl());
          url.searchParams.set("profile_id", activeProfile.id);
          await fetch(url.toString(), { method: "DELETE" });
          reload();
        }
      }
    ]);
  };

  const openRowMenu = (p: Playlist) => {
    Alert.alert(p.name, undefined, [
      { text: "Rename", onPress: () => { setRenameTarget(p); setRenameValue(p.name); } },
      { text: "Delete", style: "destructive", onPress: () => deletePlaylist(p) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const submitRename = async () => {
    if (!renameTarget || !activeProfile || !renameValue.trim()) return;
    try {
      await fetch(new URL(`/api/music/playlists/${renameTarget.id}`, getApiUrl()).toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: activeProfile.id, name: renameValue.trim() }),
      });
    } catch {}
    setRenameTarget(null);
    setRenameValue("");
    reload();
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={Colors.dark.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Playlists</ThemedText>
        <Pressable onPress={() => setCreateOpen(true)} style={styles.iconBtn}>
          <Feather name="plus" size={20} color={Colors.dark.text} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator color={Colors.dark.accent} /></View>
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{
            paddingHorizontal: Spacing.lg,
            paddingBottom: (current ? 96 : 0) + insets.bottom + Spacing.xl,
          }}
          ListEmptyComponent={
            <ThemedText style={styles.hint}>No playlists yet. Tap + to create one, then add songs from search.</ThemedText>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => navigation.navigate("MusicPlaylistDetail", { playlistId: item.id, name: item.name })}
              onLongPress={() => openRowMenu(item)}
            >
              {item.cover_url ? (
                <Image source={{ uri: item.cover_url }} style={styles.cover} contentFit="cover" />
              ) : (
                <View style={[styles.cover, styles.coverFallback]}>
                  <Feather name="music" size={24} color={Colors.dark.accent} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.rowTitle} numberOfLines={1}>{item.name}</ThemedText>
                <ThemedText style={styles.rowSub}>{item.track_count} {item.track_count === 1 ? "song" : "songs"}</ThemedText>
              </View>
              <Pressable onPress={() => openRowMenu(item)} style={styles.iconBtn}>
                <Feather name="more-vertical" size={18} color={Colors.dark.textSecondary} />
              </Pressable>
            </Pressable>
          )}
        />
      )}

      <Modal visible={!!renameTarget} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setRenameTarget(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <ThemedText style={styles.modalTitle}>Rename Playlist</ThemedText>
            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Playlist name"
              placeholderTextColor={Colors.dark.textSecondary}
              style={styles.modalInput}
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: Spacing.sm }}>
              <Pressable style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => setRenameTarget(null)}>
                <ThemedText style={styles.modalBtnText}>Cancel</ThemedText>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={submitRename}>
                <ThemedText style={[styles.modalBtnText, { color: "#fff" }]}>Save</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCreateOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <ThemedText style={styles.modalTitle}>New Playlist</ThemedText>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Playlist name"
              placeholderTextColor={Colors.dark.textSecondary}
              style={styles.modalInput}
              autoFocus
            />
            <View style={{ flexDirection: "row", gap: Spacing.sm }}>
              <Pressable style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => setCreateOpen(false)}>
                <ThemedText style={styles.modalBtnText}>Cancel</ThemedText>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={createPlaylist}>
                <ThemedText style={[styles.modalBtnText, { color: "#fff" }]}>Create</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.md },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.full, backgroundColor: Colors.dark.backgroundDefault, borderWidth: 1, borderColor: Colors.dark.border },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: "700", color: Colors.dark.text },
  loadingWrap: { padding: Spacing.xl, alignItems: "center" },
  hint: { color: Colors.dark.textSecondary, padding: Spacing.xl, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.md, paddingVertical: Spacing.sm },
  cover: { width: 60, height: 60, borderRadius: 6, backgroundColor: "#1A1A1A" },
  coverFallback: { alignItems: "center", justifyContent: "center" },
  rowTitle: { color: Colors.dark.text, fontSize: 15, fontWeight: "700" },
  rowSub: { color: Colors.dark.textSecondary, fontSize: 12, marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: Spacing.xl },
  modalCard: { width: "100%", maxWidth: 380, backgroundColor: Colors.dark.backgroundDefault, borderRadius: BorderRadius.md, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.dark.border },
  modalTitle: { color: Colors.dark.text, fontSize: 18, fontWeight: "700", marginBottom: Spacing.md },
  modalInput: { backgroundColor: Colors.dark.backgroundSecondary, color: Colors.dark.text, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.dark.border, marginBottom: Spacing.md },
  modalBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.sm, alignItems: "center", justifyContent: "center" },
  modalBtnGhost: { borderWidth: 1, borderColor: Colors.dark.border },
  modalBtnPrimary: { backgroundColor: Colors.dark.accent },
  modalBtnText: { color: Colors.dark.text, fontWeight: "700", fontSize: 14 },
});
