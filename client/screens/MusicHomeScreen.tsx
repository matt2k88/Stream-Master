import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  ScrollView,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  Platform,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useAppTheme } from "@/contexts/ThemeContext";
import { getApiUrl } from "@/lib/query-client";
import { useProfile, GUEST_PROFILE_ID } from "@/contexts/ProfileContext";
import type { MusicTrack, MusicPlaylist } from "@/lib/music-types";

// ── Browse categories ─────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "top-hits",      label: "Top Hits",          query: "top hits 2025",             color: ["#FF6600", "#cc3300"] as const },
  { id: "new-releases",  label: "New Releases",       query: "new releases 2025",         color: ["#7c3aed", "#4c1d95"] as const },
  { id: "pop",           label: "Pop",                query: "pop hits 2025",             color: ["#db2777", "#9d174d"] as const },
  { id: "hip-hop",       label: "Hip-Hop & Rap",      query: "hip hop rap 2025",          color: ["#d97706", "#92400e"] as const },
  { id: "rb",            label: "R&B & Soul",         query: "r&b soul hits",             color: ["#0891b2", "#164e63"] as const },
  { id: "rock",          label: "Rock",               query: "rock hits classic rock",    color: ["#4b5563", "#1f2937"] as const },
  { id: "dance",         label: "Dance & Electronic", query: "dance electronic edm 2025", color: ["#059669", "#064e3b"] as const },
  { id: "country",       label: "Country",            query: "country hits 2025",         color: ["#b45309", "#78350f"] as const },
];

// Module-level category cache (1h TTL, survives tab switches)
const _catCache = new Map<string, { tracks: MusicTrack[]; ts: number }>();
const CAT_TTL = 60 * 60_000;

function fmtTime(sec: number) {
  if (!sec || sec < 0) return "";
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

// ── Small components ──────────────────────────────────────────────────────────

function PlaylistCard({
  playlist,
  onPress,
}: {
  playlist: MusicPlaylist;
  onPress: () => void;
}) {
  const isLiked = playlist.isLikedSongs;
  return (
    <Pressable style={styles.playlistCard} onPress={onPress}>
      <LinearGradient
        colors={isLiked ? ["#e11d48", "#9f1239"] : ["#FF6600", "#cc3300"]}
        style={styles.playlistCardGrad}
      >
        <Feather name={isLiked ? "heart" : "music"} size={26} color="rgba(255,255,255,0.9)" />
      </LinearGradient>
      <ThemedText style={styles.playlistCardName} numberOfLines={2}>{playlist.name}</ThemedText>
      <ThemedText style={styles.playlistCardCount}>
        {playlist.trackCount ?? 0} {(playlist.trackCount ?? 0) === 1 ? "song" : "songs"}
      </ThemedText>
    </Pressable>
  );
}

function NewPlaylistCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.newPlaylistCard} onPress={onPress}>
      <View style={styles.newPlaylistIcon}>
        <Feather name="plus" size={28} color={Colors.dark.accent} />
      </View>
      <ThemedText style={styles.playlistCardName}>New{"\n"}Playlist</ThemedText>
    </Pressable>
  );
}

// Shared TV-focusable pressable (same pattern as MusicPlayerScreen)
function FocusPressable({
  style, children, onFocus, onBlur, onHoverIn, onHoverOut, ...rest
}: React.ComponentProps<typeof Pressable>) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      {...rest}
      style={[style, focused && focusBtnStyle]}
      onFocus={(e) => { setFocused(true); onFocus?.(e as any); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e as any); }}
      onHoverIn={(e) => { setFocused(true); onHoverIn?.(e as any); }}
      onHoverOut={(e) => { setFocused(false); onHoverOut?.(e as any); }}
    >
      {children}
    </Pressable>
  );
}
const focusBtnStyle = { borderWidth: 1.5, borderColor: Colors.dark.accent, backgroundColor: "rgba(255,102,0,0.1)", borderRadius: 6 } as const;

function BrowseTrackCard({
  track,
  onPress,
  onAdd,
  onLike,
  isLiked,
}: {
  track: MusicTrack;
  onPress: () => void;
  onAdd: () => void;
  onLike: () => void;
  isLiked: boolean;
}) {
  return (
    <Pressable style={styles.browseCard} onPress={onPress}>
      {track.thumbnail ? (
        <Image source={{ uri: track.thumbnail }} style={styles.browseCardArt} resizeMode="cover" />
      ) : (
        <View style={[styles.browseCardArt, styles.browseCardArtPlaceholder]}>
          <Feather name="music" size={22} color={Colors.dark.textSecondary} />
        </View>
      )}
      <ThemedText style={styles.browseCardTitle} numberOfLines={2}>{track.title}</ThemedText>
      <ThemedText style={styles.browseCardArtist} numberOfLines={1}>{track.artist}</ThemedText>
      <View style={styles.browseCardActions}>
        <FocusPressable onPress={onLike} hitSlop={10} style={styles.browseCardBtn}>
          <Feather name="heart" size={18} color={isLiked ? "#e11d48" : Colors.dark.textSecondary} />
        </FocusPressable>
        <FocusPressable onPress={onAdd} hitSlop={10} style={styles.browseCardBtn}>
          <Feather name="plus-circle" size={18} color={Colors.dark.textSecondary} />
        </FocusPressable>
      </View>
    </Pressable>
  );
}

function SearchResultRow({
  track,
  onPress,
  onAdd,
  onLike,
  isLiked,
}: {
  track: MusicTrack;
  onPress: () => void;
  onAdd: () => void;
  onLike: () => void;
  isLiked: boolean;
}) {
  return (
    <Pressable style={styles.searchRow} onPress={onPress}>
      {track.thumbnail ? (
        <Image source={{ uri: track.thumbnail }} style={styles.searchRowThumb} resizeMode="cover" />
      ) : (
        <View style={[styles.searchRowThumb, styles.searchRowThumbPh]}>
          <Feather name="music" size={14} color={Colors.dark.textSecondary} />
        </View>
      )}
      <View style={styles.searchRowMeta}>
        <ThemedText style={styles.searchRowTitle} numberOfLines={1}>{track.title}</ThemedText>
        <ThemedText style={styles.searchRowArtist} numberOfLines={1}>
          {track.artist}{track.album ? ` · ${track.album}` : ""}{track.duration ? `  ${fmtTime(track.duration)}` : ""}
        </ThemedText>
      </View>
      <FocusPressable onPress={onLike} hitSlop={10} style={styles.searchRowBtn}>
        <Feather name="heart" size={20} color={isLiked ? "#e11d48" : Colors.dark.textSecondary} />
      </FocusPressable>
      <FocusPressable onPress={onAdd} hitSlop={10} style={styles.searchRowBtn}>
        <Feather name="plus-circle" size={20} color={Colors.dark.textSecondary} />
      </FocusPressable>
    </Pressable>
  );
}

// ── Rich-search types & sub-components ───────────────────────────────────────

interface ArtistResult { artistId: number; artistName: string; primaryGenreName: string; }
interface AlbumResult  { collectionId: number; collectionName: string; artistName: string; artwork: string; trackCount: number; releaseYear: number | null; }

const ACCENT = Colors.dark.accent;

function ArtistCard({ artist, onPress }: { artist: ArtistResult; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      style={[styles.artistCard, focused && styles.artistCardFocused]}
      onPress={onPress}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onHoverIn={() => setFocused(true)} onHoverOut={() => setFocused(false)}
    >
      <View style={[styles.artistAvatar, focused && styles.artistAvatarFocused]}>
        <Feather name="user" size={26} color="rgba(255,102,0,0.6)" />
      </View>
      <ThemedText style={styles.artistCardName} numberOfLines={2}>{artist.artistName}</ThemedText>
      {artist.primaryGenreName ? (
        <ThemedText style={styles.artistCardGenre} numberOfLines={1}>{artist.primaryGenreName}</ThemedText>
      ) : null}
    </Pressable>
  );
}

function AlbumCard({ album, onPress }: { album: AlbumResult; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      style={[styles.albumCard, focused && styles.albumCardFocused]}
      onPress={onPress}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onHoverIn={() => setFocused(true)} onHoverOut={() => setFocused(false)}
    >
      {album.artwork ? (
        <Image source={{ uri: album.artwork }} style={styles.albumCardArt} resizeMode="cover" />
      ) : (
        <View style={[styles.albumCardArt, styles.albumCardArtPh]}>
          <Feather name="disc" size={24} color={Colors.dark.textSecondary} />
        </View>
      )}
      <ThemedText style={styles.albumCardName} numberOfLines={1}>{album.collectionName}</ThemedText>
      <ThemedText style={styles.albumCardMeta} numberOfLines={1}>
        {album.artistName}{album.releaseYear ? ` · ${album.releaseYear}` : ""}
      </ThemedText>
    </Pressable>
  );
}

// ── Add-to-playlist modal ─────────────────────────────────────────────────────

function AddToPlaylistModal({
  visible,
  track,
  playlists,
  onClose,
  onAdd,
  onCreateNew,
}: {
  visible: boolean;
  track: MusicTrack | null;
  playlists: MusicPlaylist[];
  onClose: () => void;
  onAdd: (playlistId: string) => void;
  onCreateNew: () => void;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  // Reset checkmarks every time the modal opens for a new track
  useEffect(() => {
    if (visible) { setAdded(new Set()); setAdding(null); }
  }, [visible, track?.searchKey]);

  const handleAdd = async (playlistId: string) => {
    setAdding(playlistId);
    await onAdd(playlistId);
    setAdded((prev) => new Set([...prev, playlistId]));
    setAdding(null);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <ThemedText style={styles.modalTitle}>Add to Playlist</ThemedText>
          {track ? (
            <ThemedText style={styles.modalTrackName} numberOfLines={1}>
              {track.title} — {track.artist}
            </ThemedText>
          ) : null}

          <FlatList
            data={playlists}
            keyExtractor={(p) => p.id}
            style={styles.modalList}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.modalPlaylistRow, added.has(item.id) && styles.modalPlaylistRowAdded]}
                onPress={() => !added.has(item.id) && handleAdd(item.id)}
              >
                <View style={[styles.modalPlaylistIcon, item.isLikedSongs && styles.modalPlaylistIconLiked]}>
                  <Feather name={item.isLikedSongs ? "heart" : "music"} size={14} color="#fff" />
                </View>
                <ThemedText style={styles.modalPlaylistName} numberOfLines={1}>{item.name}</ThemedText>
                <ThemedText style={styles.modalPlaylistCount}>{item.trackCount} songs</ThemedText>
                {adding === item.id ? (
                  <ActivityIndicator size="small" color={Colors.dark.accent} />
                ) : added.has(item.id) ? (
                  <Feather name="check" size={16} color="#22c55e" />
                ) : (
                  <Feather name="plus" size={16} color={Colors.dark.textSecondary} />
                )}
              </Pressable>
            )}
            ListFooterComponent={
              <Pressable style={styles.modalNewPlaylist} onPress={onCreateNew}>
                <Feather name="plus-circle" size={18} color={Colors.dark.accent} />
                <ThemedText style={styles.modalNewPlaylistText}>Create New Playlist</ThemedText>
              </Pressable>
            }
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Create playlist modal ─────────────────────────────────────────────────────

function CreatePlaylistModal({
  visible,
  onCreate,
  onClose,
}: {
  visible: boolean;
  onCreate: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    const n = name.trim();
    if (!n) return;
    setCreating(true);
    await onCreate(n);
    setName("");
    setCreating(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.createCard} onPress={() => {}}>
          <ThemedText style={styles.createTitle}>New Playlist</ThemedText>
          <TextInput
            style={styles.createInput}
            placeholder="Playlist name…"
            placeholderTextColor={Colors.dark.border}
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
            maxLength={80}
          />
          <View style={styles.createActions}>
            <Pressable style={styles.createCancelBtn} onPress={onClose}>
              <ThemedText style={styles.createCancelText}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.createConfirmBtn, (!name.trim() || creating) && { opacity: 0.5 }]}
              onPress={handleCreate}
              disabled={!name.trim() || creating}
            >
              {creating
                ? <ActivityIndicator size="small" color="#fff" />
                : <ThemedText style={styles.createConfirmText}>Create</ThemedText>
              }
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function MusicHomeScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { showMusicBetaBadge } = useAppTheme();
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id ?? null;
  const isGuest = !profileId || profileId === GUEST_PROFILE_ID;

  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(true);
  const [likedKeys, setLikedKeys] = useState<Set<string>>(new Set());
  const [categoryTracks, setCategoryTracks] = useState<Record<string, MusicTrack[]>>({});
  const [loadingCats, setLoadingCats] = useState<Record<string, boolean>>({});

  const [query, setQuery] = useState("");
  const [richResults, setRichResults] = useState<{ songs: MusicTrack[]; artists: ArtistResult[]; albums: AlbumResult[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [drill, setDrill] = useState<{ type: "artist" | "album"; id: number; name: string; artwork?: string } | null>(null);
  const [drillSongs, setDrillSongs] = useState<MusicTrack[]>([]);
  const [drillAlbums, setDrillAlbums] = useState<AlbumResult[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState("");

  const [addModal, setAddModal] = useState<{ track: MusicTrack; visible: boolean } | null>(null);
  const addModalRef = useRef<{ track: MusicTrack; visible: boolean } | null>(null);
  addModalRef.current = addModal;
  const [createModal, setCreateModal] = useState(false);
  const inputRef = useRef<TextInput>(null);
  // Prevent stale 700ms close timer from killing a freshly-opened modal
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch playlists ───────────────────────────────────────────────────────
  const fetchPlaylists = useCallback(async () => {
    if (isGuest || !profileId) { setPlaylistsLoading(false); return; }
    setPlaylistsLoading(true);
    try {
      const r = await fetch(`${getApiUrl()}/api/music/playlists?profile_id=${profileId}`);
      const data = await r.json();
      if (r.ok) {
        const list: MusicPlaylist[] = (data ?? []).map((p: any) => ({
          id: p.id,
          profileId: p.profile_id,
          name: p.name,
          isLikedSongs: p.is_liked_songs,
          trackCount: p.trackCount ?? 0,
          updatedAt: p.updated_at ?? "",
        }));
        setPlaylists(list);

        // Fetch liked songs keys for heart indicators
        const liked = list.find((p) => p.isLikedSongs);
        if (liked) {
          try {
            const tr = await fetch(`${getApiUrl()}/api/music/playlists/${liked.id}/tracks`);
            const tData = await tr.json();
            if (tr.ok) {
              setLikedKeys(new Set((tData ?? []).map((t: any) => t.search_key as string)));
            }
          } catch {}
        }
      }
    } catch {}
    setPlaylistsLoading(false);
  }, [profileId, isGuest]);

  useEffect(() => { fetchPlaylists(); }, [fetchPlaylists]);

  // Re-fetch playlists whenever this screen comes back into focus (e.g. after deleting a track in PlaylistDetail)
  useFocusEffect(useCallback(() => { fetchPlaylists(); }, [fetchPlaylists]));

  // ── Fetch browse categories (parallel, module-level cache) ────────────────
  useEffect(() => {
    CATEGORIES.forEach(async (cat) => {
      const cached = _catCache.get(cat.id);
      if (cached && Date.now() - cached.ts < CAT_TTL) {
        setCategoryTracks((prev) => ({ ...prev, [cat.id]: cached.tracks }));
        return;
      }
      setLoadingCats((prev) => ({ ...prev, [cat.id]: true }));
      try {
        const r = await fetch(`${getApiUrl()}/api/music/search?q=${encodeURIComponent(cat.query)}`);
        const data = await r.json();
        const tracks = Array.isArray(data) ? data : (data.songs ?? []);
        if (r.ok && tracks.length >= 0) {
          _catCache.set(cat.id, { tracks, ts: Date.now() });
          setCategoryTracks((prev) => ({ ...prev, [cat.id]: tracks }));
        }
      } catch {}
      setLoadingCats((prev) => ({ ...prev, [cat.id]: false }));
    });
  }, []);

  // ── Search ────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async (q = query) => {
    const term = q.trim();
    if (!term) return;
    setSearching(true);
    setSearchError("");
    setRichResults(null);
    setDrill(null);
    setDrillSongs([]); setDrillAlbums([]);
    inputRef.current?.blur();
    try {
      const r = await fetch(`${getApiUrl()}/api/music/search?q=${encodeURIComponent(term)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Search failed");
      setRichResults(data);
    } catch (err: any) {
      setSearchError(err.message ?? "Search failed");
    }
    setSearching(false);
  }, [query]);

  // ── Artist drill ──────────────────────────────────────────────────────────
  const handleArtistDrill = useCallback(async (artist: ArtistResult) => {
    setDrill({ type: "artist", id: artist.artistId, name: artist.artistName });
    setDrillLoading(true); setDrillError(""); setDrillSongs([]); setDrillAlbums([]);
    try {
      const r = await fetch(`${getApiUrl()}/api/music/artist/${artist.artistId}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      setDrillSongs(data.songs ?? []);
      setDrillAlbums(data.albums ?? []);
    } catch (err: any) { setDrillError(err.message ?? "Failed"); }
    setDrillLoading(false);
  }, []);

  // ── Navigate to player with album context ─────────────────────────────────
  const playWithAlbum = useCallback((track: MusicTrack, albumId: number, albumName: string) => {
    navigation.navigate("MusicPlayer", {
      queue: [track],
      startIndex: 0,
      contextName: albumName,
      albumId,
    });
  }, [navigation]);

  const openAlbum = useCallback((albumId: number, albumName: string) => {
    navigation.navigate("MusicPlayer", {
      contextName: albumName,
      albumId,
    });
  }, [navigation]);

  // ── Play track (browse / playlist) ────────────────────────────────────────
  const playTrack = useCallback((track: MusicTrack, queue: MusicTrack[], contextName?: string) => {
    const startIndex = queue.findIndex((t) => t.searchKey === track.searchKey);
    navigation.navigate("MusicPlayer", {
      queue,
      startIndex: startIndex >= 0 ? startIndex : 0,
      contextName,
    });
  }, [navigation]);

  // ── Like track ────────────────────────────────────────────────────────────
  const handleLike = useCallback(async (track: MusicTrack) => {
    if (isGuest) return;
    const liked = playlists.find((p) => p.isLikedSongs);
    if (!liked) return;

    const alreadyLiked = likedKeys.has(track.searchKey);

    if (alreadyLiked) {
      // Unlike: remove from Liked Songs
      setLikedKeys((prev) => { const n = new Set(prev); n.delete(track.searchKey); return n; });
      try {
        await fetch(
          `${getApiUrl()}/api/music/playlists/${liked.id}/tracks/by-key?search_key=${encodeURIComponent(track.searchKey)}`,
          { method: "DELETE" }
        );
        setPlaylists((prev) =>
          prev.map((p) => p.id === liked.id ? { ...p, trackCount: Math.max(0, p.trackCount - 1) } : p)
        );
      } catch {
        setLikedKeys((prev) => new Set([...prev, track.searchKey]));
      }
      return;
    }

    setLikedKeys((prev) => new Set([...prev, track.searchKey]));
    try {
      await fetch(`${getApiUrl()}/api/music/playlists/${liked.id}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: track.title,
          artist: track.artist,
          album: track.album,
          duration_sec: track.duration,
          thumbnail: track.thumbnail,
          search_key: track.searchKey,
        }),
      });
      setPlaylists((prev) =>
        prev.map((p) => p.id === liked.id ? { ...p, trackCount: p.trackCount + 1 } : p)
      );
    } catch {
      setLikedKeys((prev) => { const n = new Set(prev); n.delete(track.searchKey); return n; });
    }
  }, [isGuest, playlists, likedKeys]);

  // ── Add to playlist ───────────────────────────────────────────────────────
  const handleAddToPlaylist = useCallback(async (playlistId: string) => {
    const track = addModalRef.current?.track;
    if (!track) return;
    try {
      await fetch(`${getApiUrl()}/api/music/playlists/${playlistId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: track.title,
          artist: track.artist,
          album: track.album,
          duration_sec: track.duration,
          thumbnail: track.thumbnail,
          search_key: track.searchKey,
        }),
      });
      setPlaylists((prev) =>
        prev.map((p) => p.id === playlistId ? { ...p, trackCount: p.trackCount + 1 } : p)
      );
      // Clear any stale timer before scheduling a new close — prevents killing a different song's modal
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => { closeTimerRef.current = null; setAddModal(null); }, 700);
    } catch {}
  }, []);

  const handleCreatePlaylist = useCallback(async (name: string) => {
    if (!profileId) return;
    try {
      const r = await fetch(`${getApiUrl()}/api/music/playlists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: profileId, name }),
      });
      if (r.ok) {
        const data = await r.json();
        setPlaylists((prev) => [...prev, {
          id: data.id,
          profileId: data.profile_id,
          name: data.name,
          isLikedSongs: false,
          trackCount: 0,
          updatedAt: data.updated_at ?? "",
        }]);
      }
    } catch {}
  }, [profileId]);

  const isSearching = query.length > 0;
  const padTop = insets.top + 8;

  return (
    <ThemedView style={styles.root}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: padTop }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={Colors.dark.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Music</ThemedText>
        {showMusicBetaBadge ? (
          <View style={styles.betaBadge}>
            <ThemedText style={styles.betaBadgeText}>BETA</ThemedText>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
      </View>

      {/* ── Search bar ── */}
      <View style={styles.searchWrap}>
        <Feather name="search" size={16} color={Colors.dark.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          ref={inputRef}
          style={styles.searchInput}
          placeholder="Search songs, artists, albums…"
          placeholderTextColor={Colors.dark.border}
          value={query}
          onChangeText={(t) => { setQuery(t); if (!t) { setRichResults(null); setDrill(null); setDrillSongs([]); setDrillAlbums([]); } }}
          returnKeyType="search"
          onSubmitEditing={() => handleSearch(query)}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable hitSlop={8} onPress={() => { setQuery(""); setRichResults(null); setDrill(null); setDrillSongs([]); setDrillAlbums([]); setSearchError(""); }}>
            <Feather name="x" size={15} color={Colors.dark.textSecondary} />
          </Pressable>
        )}
        {query.length > 0 && (
          <Pressable
            style={styles.searchGoBtn}
            onPress={() => handleSearch(query)}
            disabled={searching}
          >
            {searching
              ? <ActivityIndicator size="small" color="#fff" />
              : <ThemedText style={styles.searchGoBtnText}>Go</ThemedText>
            }
          </Pressable>
        )}
      </View>

      {/* ── Content ── */}
      {isSearching ? (
        // ── Rich search results ──
        searching ? (
          <View style={styles.centred}><ActivityIndicator color={ACCENT} size="large" /></View>
        ) : searchError ? (
          <View style={styles.centred}><ThemedText style={styles.errorText}>{searchError}</ThemedText></View>
        ) : drill ? (
          /* Drill view */
          <View style={{ flex: 1 }}>
            <Pressable
              style={styles.drillBack}
              onPress={() => { setDrill(null); setDrillSongs([]); setDrillAlbums([]); }}
            >
              <Feather name="arrow-left" size={15} color={ACCENT} />
              <ThemedText style={styles.drillBackText} numberOfLines={1}>{drill.name}</ThemedText>
            </Pressable>
            {drillLoading ? (
              <View style={styles.centred}><ActivityIndicator color={ACCENT} size="large" /></View>
            ) : drillError ? (
              <View style={styles.centred}><ThemedText style={styles.errorText}>{drillError}</ThemedText></View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
                {drillSongs.length > 0 && (
                  <View>
                    <ThemedText style={styles.richSectionLabel}>TOP SONGS</ThemedText>
                    {drillSongs.map((item, i) => (
                      <SearchResultRow
                        key={`${item.searchKey}-${i}`}
                        track={item}
                        isLiked={likedKeys.has(item.searchKey)}
                        onPress={() => item.collectionId ? playWithAlbum(item, item.collectionId, item.album) : playTrack(item, drillSongs, drill.name)}
                        onLike={() => handleLike(item)}
                        onAdd={() => { if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; } setAddModal({ track: item, visible: true }); }}
                      />
                    ))}
                  </View>
                )}
                {drill.type === "artist" && drillAlbums.length > 0 && (
                  <View>
                    <ThemedText style={styles.richSectionLabel}>ALBUMS</ThemedText>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hChips}>
                      {drillAlbums.map((a) => (
                        <AlbumCard key={String(a.collectionId)} album={a} onPress={() => openAlbum(a.collectionId, a.collectionName)} />
                      ))}
                    </ScrollView>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        ) : richResults ? (
          /* Rich results */
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
            {richResults.artists.length > 0 && (
              <View>
                <ThemedText style={styles.richSectionLabel}>ARTISTS</ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hChips}>
                  {richResults.artists.map((a) => (
                    <ArtistCard key={String(a.artistId)} artist={a} onPress={() => handleArtistDrill(a)} />
                  ))}
                </ScrollView>
              </View>
            )}
            {richResults.albums.length > 0 && (
              <View>
                <ThemedText style={styles.richSectionLabel}>ALBUMS</ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hChips}>
                  {richResults.albums.map((a) => (
                    <AlbumCard key={String(a.collectionId)} album={a} onPress={() => openAlbum(a.collectionId, a.collectionName)} />
                  ))}
                </ScrollView>
              </View>
            )}
            {richResults.songs.length > 0 && (
              <View>
                <ThemedText style={styles.richSectionLabel}>SONGS</ThemedText>
                {richResults.songs.map((item, i) => (
                  <SearchResultRow
                    key={`${item.searchKey}-${i}`}
                    track={item}
                    isLiked={likedKeys.has(item.searchKey)}
                    onPress={() => item.collectionId ? playWithAlbum(item, item.collectionId, item.album) : playTrack(item, richResults.songs, `Search: ${query}`)}
                    onLike={() => handleLike(item)}
                    onAdd={() => { if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; } setAddModal({ track: item, visible: true }); }}
                  />
                ))}
              </View>
            )}
            {richResults.artists.length === 0 && richResults.albums.length === 0 && richResults.songs.length === 0 && (
              <View style={styles.centred}><ThemedText style={styles.emptyHint}>No results for "{query}"</ThemedText></View>
            )}
          </ScrollView>
        ) : (
          <View style={styles.centred}>
            <ThemedText style={styles.emptyHint}>Press Go or Enter to search</ThemedText>
          </View>
        )
      ) : (
        // Browse mode
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          {/* My Playlists */}
          {!isGuest ? (
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <ThemedText style={styles.sectionTitle}>MY PLAYLISTS</ThemedText>
              </View>
              {playlistsLoading ? (
                <ActivityIndicator color={Colors.dark.accent} style={{ marginLeft: Spacing.lg }} />
              ) : (
                <FlatList
                  horizontal
                  data={playlists}
                  keyExtractor={(p) => p.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.hScrollContent}
                  renderItem={({ item }) => (
                    <PlaylistCard
                      playlist={item}
                      onPress={() =>
                        navigation.navigate("PlaylistDetail", {
                          playlistId: item.id,
                          playlistName: item.name,
                          isLikedSongs: item.isLikedSongs,
                        })
                      }
                    />
                  )}
                  ListFooterComponent={
                    <NewPlaylistCard onPress={() => setCreateModal(true)} />
                  }
                />
              )}
            </View>
          ) : null}

          {/* Browse categories */}
          {CATEGORIES.map((cat) => {
            const tracks = categoryTracks[cat.id] ?? [];
            const isLoading = loadingCats[cat.id];
            return (
              <View key={cat.id} style={styles.section}>
                <View style={styles.sectionRow}>
                  <View style={[styles.sectionDot, { backgroundColor: cat.color[0] }]} />
                  <ThemedText style={styles.sectionTitle}>{cat.label.toUpperCase()}</ThemedText>
                </View>
                {isLoading || (!tracks.length && !loadingCats[cat.id] && tracks.length === 0) ? (
                  isLoading ? (
                    <ActivityIndicator color={Colors.dark.accent} style={{ marginLeft: Spacing.lg }} />
                  ) : null
                ) : (
                  <FlatList
                    horizontal
                    data={tracks}
                    keyExtractor={(t, i) => `${cat.id}-${i}`}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.hScrollContent}
                    renderItem={({ item }) => (
                      <BrowseTrackCard
                        track={item}
                        isLiked={likedKeys.has(item.searchKey)}
                        onPress={() => playTrack(item, tracks, cat.label)}
                        onLike={() => handleLike(item)}
                        onAdd={() => {
                          if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
                          setAddModal({ track: item, visible: true });
                        }}
                      />
                    )}
                  />
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Modals */}
      <AddToPlaylistModal
        visible={!!addModal?.visible}
        track={addModal?.track ?? null}
        playlists={playlists}
        onClose={() => setAddModal(null)}
        onAdd={handleAddToPlaylist}
        onCreateNew={() => { setAddModal(null); setCreateModal(true); }}
      />
      <CreatePlaylistModal
        visible={createModal}
        onCreate={handleCreatePlaylist}
        onClose={() => setCreateModal(false)}
      />
    </ThemedView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },

  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, gap: Spacing.sm,
  },
  backBtn: { padding: 6, borderRadius: BorderRadius.sm },
  headerTitle: { fontSize: 22, fontWeight: "800", color: Colors.dark.text },
  betaBadge: {
    backgroundColor: "rgba(255,102,0,0.18)",
    borderWidth: 1, borderColor: "rgba(255,102,0,0.45)",
    borderRadius: BorderRadius.xs,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  betaBadgeText: { fontSize: 9, fontWeight: "800", color: Colors.dark.accent, letterSpacing: 0.8 },

  searchWrap: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: Spacing.lg, marginBottom: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md, borderWidth: 1,
    borderColor: Colors.dark.border, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, color: Colors.dark.text, fontSize: 14 },
  searchGoBtn: {
    backgroundColor: Colors.dark.accent, borderRadius: BorderRadius.sm,
    paddingHorizontal: 12, paddingVertical: 5, marginLeft: 8,
  },
  searchGoBtnText: { fontSize: 12, fontWeight: "700", color: "#fff" },

  section: { marginBottom: Spacing.lg },
  sectionRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.lg, marginBottom: 10, gap: 8 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 11, fontWeight: "800", color: Colors.dark.textSecondary, letterSpacing: 1.2 },
  hScrollContent: { paddingHorizontal: Spacing.lg, gap: 12 },

  // Playlist cards
  playlistCard: { width: 130 },
  playlistCardGrad: {
    width: 130, height: 130, borderRadius: BorderRadius.md,
    justifyContent: "center", alignItems: "center", marginBottom: 8,
  },
  playlistCardName: { fontSize: 13, fontWeight: "700", color: Colors.dark.text, lineHeight: 17 },
  playlistCardCount: { fontSize: 11, color: Colors.dark.textSecondary, marginTop: 2 },
  newPlaylistCard: { width: 130, alignItems: "flex-start" },
  newPlaylistIcon: {
    width: 130, height: 130, borderRadius: BorderRadius.md,
    borderWidth: 2, borderColor: "rgba(255,102,0,0.35)",
    borderStyle: "dashed", justifyContent: "center", alignItems: "center",
    backgroundColor: "rgba(255,102,0,0.05)", marginBottom: 8,
  },

  // Browse track cards
  browseCard: { width: 130 },
  browseCardArt: { width: 130, height: 130, borderRadius: BorderRadius.md, marginBottom: 6 },
  browseCardArtPlaceholder: {
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center", alignItems: "center",
  },
  browseCardTitle: { fontSize: 12, fontWeight: "600", color: Colors.dark.text, lineHeight: 16 },
  browseCardArtist: { fontSize: 11, color: Colors.dark.textSecondary, marginTop: 2 },
  browseCardActions: { flexDirection: "row", marginTop: 4, gap: 8 },
  browseCardBtn: { padding: 3 },

  // Rich search
  richSectionLabel: {
    fontSize: 10, fontWeight: "800", color: Colors.dark.textSecondary, letterSpacing: 1.2,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.xs,
  },
  hChips: { paddingHorizontal: Spacing.lg, gap: 10, paddingBottom: Spacing.sm },
  drillBack: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)",
  },
  drillBackText: { fontSize: 14, fontWeight: "700", color: ACCENT, flex: 1 },

  artistCard: { width: 90, alignItems: "center", gap: 5 },
  artistCardFocused: { backgroundColor: "rgba(255,102,0,0.08)", borderRadius: BorderRadius.md, padding: 4 },
  artistAvatar: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: "rgba(255,102,0,0.10)", borderWidth: 1.5,
    borderColor: "rgba(255,102,0,0.35)", justifyContent: "center", alignItems: "center",
  },
  artistAvatarFocused: { borderColor: ACCENT },
  artistCardName: { fontSize: 11, fontWeight: "600", color: Colors.dark.text, textAlign: "center" },
  artistCardGenre: { fontSize: 10, color: Colors.dark.textSecondary, textAlign: "center" },

  albumCard: { width: 100 },
  albumCardFocused: { opacity: 0.8 },
  albumCardArt: { width: 100, height: 100, borderRadius: BorderRadius.md, marginBottom: 5 },
  albumCardArtPh: { backgroundColor: Colors.dark.backgroundSecondary, justifyContent: "center", alignItems: "center" },
  albumCardName: { fontSize: 11, fontWeight: "600", color: Colors.dark.text },
  albumCardMeta: { fontSize: 10, color: Colors.dark.textSecondary },

  // Search result rows
  searchRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: Spacing.lg, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)",
  },
  searchRowThumb: { width: 46, height: 46, borderRadius: BorderRadius.sm, marginRight: 12 },
  searchRowThumbPh: { backgroundColor: Colors.dark.backgroundSecondary, justifyContent: "center", alignItems: "center" },
  searchRowMeta: { flex: 1 },
  searchRowTitle: { fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  searchRowArtist: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: 2 },
  searchRowBtn: { padding: 8 },

  // Add-to-playlist modal
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#141414",
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
    maxHeight: "75%",
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center", marginTop: 12, marginBottom: 16,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: Colors.dark.text, paddingHorizontal: 20, marginBottom: 4 },
  modalTrackName: { fontSize: 13, color: Colors.dark.textSecondary, paddingHorizontal: 20, marginBottom: 16 },
  modalList: { flexGrow: 0 },
  modalPlaylistRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)",
    gap: 12,
  },
  modalPlaylistRowAdded: { opacity: 0.7 },
  modalPlaylistIcon: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: Colors.dark.accent,
    justifyContent: "center", alignItems: "center",
  },
  modalPlaylistIconLiked: { backgroundColor: "#e11d48" },
  modalPlaylistName: { flex: 1, fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  modalPlaylistCount: { fontSize: 12, color: Colors.dark.textSecondary },
  modalNewPlaylist: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 14, gap: 12,
  },
  modalNewPlaylistText: { fontSize: 14, color: Colors.dark.accent, fontWeight: "600" },

  // Create playlist modal
  createCard: {
    backgroundColor: "#161616", borderRadius: 16,
    padding: 24, margin: 24, gap: 16,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  createTitle: { fontSize: 17, fontWeight: "700", color: Colors.dark.text },
  createInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.dark.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.dark.text,
  },
  createActions: { flexDirection: "row", gap: 12, justifyContent: "flex-end" },
  createCancelBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  createCancelText: { fontSize: 14, color: Colors.dark.textSecondary },
  createConfirmBtn: {
    backgroundColor: Colors.dark.accent, borderRadius: BorderRadius.md,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  createConfirmText: { fontSize: 14, fontWeight: "700", color: "#fff" },

  centred: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  errorText: { fontSize: 14, color: "#ef4444", textAlign: "center" },
  emptyHint: { fontSize: 14, color: Colors.dark.textSecondary, textAlign: "center" },
});
