import React, { useState, useCallback, useRef } from "react";
import { View, StyleSheet, Pressable, TextInput, FlatList, ActivityIndicator } from "react-native";
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
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import AddToPlaylistModal from "@/components/AddToPlaylistModal";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function MusicSearchScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { playQueue, current } = useMusic();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [addTrack, setAddTrack] = useState<MusicTrack | null>(null);
  const tokenRef = useRef(0);

  const doSearch = useCallback(async (q: string) => {
    const myToken = ++tokenRef.current;
    if (!q.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    try {
      const url = new URL("/api/music/search", getApiUrl());
      url.searchParams.set("q", q.trim());
      const res = await fetch(url.toString());
      if (res.ok) {
        const json = await res.json();
        if (tokenRef.current === myToken) setResults(json.results ?? []);
      }
    } catch {}
    if (tokenRef.current === myToken) setLoading(false);
  }, []);

  const onChange = (text: string) => {
    setQuery(text);
    // Debounce
    const myToken = ++tokenRef.current;
    setTimeout(() => {
      if (tokenRef.current === myToken) doSearch(text);
    }, 350);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={Colors.dark.text} />
        </Pressable>
        <View style={styles.searchBox}>
          <Feather name="search" size={18} color={Colors.dark.textSecondary} />
          <TextInput
            value={query}
            onChangeText={onChange}
            placeholder="Search songs, artists…"
            placeholderTextColor={Colors.dark.textSecondary}
            style={styles.input}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={() => doSearch(query)}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator color={Colors.dark.accent} /></View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(t) => t.itunes_track_id}
          contentContainerStyle={{
            paddingHorizontal: Spacing.lg,
            paddingBottom: (current ? 96 : 0) + insets.bottom + Spacing.xl,
          }}
          renderItem={({ item, index }) => (
            <TrackRow
              track={item}
              onPress={() => playQueue(results, index)}
              onAdd={() => setAddTrack(item)}
            />
          )}
          ListEmptyComponent={
            !query ? (
              <ThemedText style={styles.hint}>Type to search Apple Music's catalog.</ThemedText>
            ) : (
              <ThemedText style={styles.hint}>No results.</ThemedText>
            )
          }
        />
      )}

      <AddToPlaylistModal track={addTrack} onClose={() => setAddTrack(null)} />
    </ThemedView>
  );
}

function TrackRow({ track, onPress, onAdd }: { track: MusicTrack; onPress: () => void; onAdd: () => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.rowOuter}>
      <Pressable
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.row, focused && styles.rowFocused]}
      >
        {track.artwork_url ? (
          <Image source={{ uri: track.artwork_url }} style={styles.rowArt} contentFit="cover" />
        ) : (
          <View style={[styles.rowArt, styles.rowArtFallback]}><Feather name="music" size={18} color={Colors.dark.accent} /></View>
        )}
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.rowTitle} numberOfLines={1}>{track.title}</ThemedText>
          <ThemedText style={styles.rowArtist} numberOfLines={1}>{track.artist}</ThemedText>
        </View>
      </Pressable>
      <Pressable onPress={onAdd} style={styles.addBtn}>
        <Feather name="plus" size={18} color={Colors.dark.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.md,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.full, backgroundColor: Colors.dark.backgroundDefault, borderWidth: 1, borderColor: Colors.dark.border },
  searchBox: { flex: 1, flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingHorizontal: Spacing.md, height: 44, backgroundColor: Colors.dark.backgroundDefault, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.dark.border },
  input: { flex: 1, color: Colors.dark.text, fontSize: 15 },
  loadingWrap: { padding: Spacing.xl, alignItems: "center" },
  hint: { color: Colors.dark.textSecondary, padding: Spacing.xl, textAlign: "center" },
  rowOuter: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  row: { flex: 1, flexDirection: "row", alignItems: "center", gap: Spacing.md, paddingVertical: 8 },
  rowFocused: { backgroundColor: "rgba(255,102,0,0.08)", borderRadius: BorderRadius.sm },
  rowArt: { width: 48, height: 48, borderRadius: 6, backgroundColor: "#1A1A1A" },
  rowArtFallback: { alignItems: "center", justifyContent: "center" },
  rowTitle: { color: Colors.dark.text, fontSize: 14, fontWeight: "600" },
  rowArtist: { color: Colors.dark.textSecondary, fontSize: 12, marginTop: 2 },
  addBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.dark.border, backgroundColor: Colors.dark.backgroundDefault },
});
