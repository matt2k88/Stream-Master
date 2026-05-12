import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import {
  SPOTIFY_SCOPES,
  clearPendingAuth,
  clearTokens,
  exchangeCodeForTokens,
  getSpotifyClientId,
  getValidAccessToken,
  loadPendingAuth,
  savePendingAuth,
  spotifyFetch,
  type SpotifyPlaylist,
  type SpotifyProfile,
  type SpotifyTrack,
} from "@/lib/spotify";

WebBrowser.maybeCompleteAuthSession();

const SPOTIFY_GREEN = "#1DB954";

const discovery = {
  authorizationEndpoint: "https://accounts.spotify.com/authorize",
  tokenEndpoint: "https://accounts.spotify.com/api/token",
};

type View_ = "playlists" | "tracks";

export default function SpotifyScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [clientId, setClientId] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<SpotifyProfile | null>(null);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View_>("playlists");
  const [activePlaylist, setActivePlaylist] = useState<SpotifyPlaylist | null>(null);
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: "iptvplayer",
    path: "spotify-callback",
  });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: clientId ?? "",
      scopes: SPOTIFY_SCOPES,
      usePKCE: true,
      redirectUri,
    },
    discovery,
  );

  const padH = Math.max(insets.left + Spacing.sm, Spacing.lg);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.md);

  // Resume an interrupted auth flow when a callback URL arrives. Used both for
  // an in-flight redirect and for a cold start where Android killed the app
  // while the Spotify login page was open.
  const completeFromUrl = useCallback(async (url: string | null) => {
    if (!url) return;
    if (!url.includes("spotify-callback")) return;
    try {
      const parsed = new URL(url);
      const code = parsed.searchParams.get("code");
      if (!code) return;
      const pending = await loadPendingAuth();
      if (!pending) return;
      setBusy(true);
      try {
        await exchangeCodeForTokens({
          code,
          redirectUri: pending.redirectUri,
          codeVerifier: pending.codeVerifier,
        });
        await clearPendingAuth();
        setAuthed(true);
      } catch (err: any) {
        Alert.alert("Spotify sign-in failed", err?.message ?? "Unknown error");
      } finally {
        setBusy(false);
      }
    } catch {
      // ignore malformed urls
    }
  }, []);

  // Bootstrap: client id + check existing auth + resume any pending auth
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cid = await getSpotifyClientId();
        if (!mounted) return;
        setClientId(cid);
        const tok = await getValidAccessToken();
        if (!mounted) return;
        setAuthed(!!tok);
        // Cold-start case: app was killed during Spotify login and just
        // re-launched via the iptvplayer://spotify-callback deep link.
        if (!tok) {
          const initial = await Linking.getInitialURL();
          if (mounted) await completeFromUrl(initial);
        }
      } catch {
        if (mounted) setAuthed(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [completeFromUrl]);

  // Warm-resume: app stayed alive but the redirect deep link arrived while we
  // were sitting on this screen.
  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      completeFromUrl(url);
    });
    return () => sub.remove();
  }, [completeFromUrl]);

  const loadProfileAndPlaylists = useCallback(async () => {
    setLoading(true);
    try {
      const [me, pls] = await Promise.all([
        spotifyFetch<SpotifyProfile>("/me"),
        spotifyFetch<{ items: SpotifyPlaylist[] }>("/me/playlists?limit=50"),
      ]);
      setProfile(me);
      setPlaylists(pls.items ?? []);
    } catch (err: any) {
      Alert.alert("Spotify error", err?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) loadProfileAndPlaylists();
  }, [authed, loadProfileAndPlaylists]);

  // Happy path: app stayed alive through the auth flow and useAuthRequest
  // delivered the response in-memory. We still go through the persisted
  // pending-auth (saved at handleLogin time) so the exchange path is identical
  // whether the app survived or was killed.
  useEffect(() => {
    if (!response) return;
    if (response.type !== "success") {
      if (response.type === "error") {
        Alert.alert("Spotify login failed", response.error?.message ?? "Unknown error");
      }
      return;
    }
    const code = response.params.code;
    if (!code) return;
    (async () => {
      setBusy(true);
      try {
        // Prefer the persisted verifier (handles app-killed case).
        const pending = await loadPendingAuth();
        const verifier = pending?.codeVerifier ?? request?.codeVerifier;
        const usedRedirect = pending?.redirectUri ?? redirectUri;
        if (!verifier) throw new Error("Missing PKCE verifier");
        await exchangeCodeForTokens({ code, redirectUri: usedRedirect, codeVerifier: verifier });
        await clearPendingAuth();
        setAuthed(true);
      } catch (err: any) {
        Alert.alert("Spotify sign-in failed", err?.message ?? "Unknown error");
      } finally {
        setBusy(false);
      }
    })();
  }, [response, request, redirectUri]);

  const handleLogin = useCallback(async () => {
    if (!clientId) {
      Alert.alert("Spotify not configured", "Spotify Client ID is missing.");
      return;
    }
    if (!request) return;
    // Persist the PKCE verifier BEFORE launching the browser. On Android TV
    // the OS often kills our process while the user is on the Spotify login
    // page; without this, the in-memory verifier is lost on relaunch and the
    // token exchange fails.
    if (request.codeVerifier) {
      await savePendingAuth({
        codeVerifier: request.codeVerifier,
        redirectUri,
        createdAt: Date.now(),
      });
    }
    await promptAsync();
  }, [clientId, request, promptAsync, redirectUri]);

  const handleLogout = useCallback(async () => {
    await clearTokens();
    setAuthed(false);
    setProfile(null);
    setPlaylists([]);
    setTracks([]);
    setActivePlaylist(null);
    setView("playlists");
  }, []);

  const openPlaylist = useCallback(async (pl: SpotifyPlaylist) => {
    setActivePlaylist(pl);
    setView("tracks");
    setLoading(true);
    setTracks([]);
    try {
      const data = await spotifyFetch<{ items: { track: SpotifyTrack | null }[] }>(
        `/playlists/${pl.id}/tracks?limit=100`,
      );
      const items = (data.items ?? [])
        .map((it) => it.track)
        .filter((t): t is SpotifyTrack => !!t && !!t.id);
      setTracks(items);
    } catch (err: any) {
      Alert.alert("Spotify error", err?.message ?? "Failed to load tracks");
    } finally {
      setLoading(false);
    }
  }, []);

  const openInSpotify = useCallback(async (kind: "track" | "playlist", id: string) => {
    const appUrl = `spotify:${kind}:${id}`;
    const webUrl = `https://open.spotify.com/${kind}/${id}`;
    try {
      const can = await Linking.canOpenURL(appUrl);
      await Linking.openURL(can ? appUrl : webUrl);
    } catch {
      try {
        await Linking.openURL(webUrl);
      } catch {
        Alert.alert("Couldn't open Spotify", webUrl);
      }
    }
  }, []);

  const goBack = () => {
    if (view === "tracks") {
      setView("playlists");
      setActivePlaylist(null);
      setTracks([]);
      return;
    }
    navigation.goBack();
  };

  // ── Header ────────────────────────────────────────────────────────────────
  const Header = (
    <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
      <Pressable style={styles.iconBtn} onPress={goBack}>
        <Feather name="arrow-left" size={20} color={Colors.dark.text} />
      </Pressable>
      <View style={styles.brand}>
        <View style={[styles.brandDot, { backgroundColor: SPOTIFY_GREEN }]} />
        <ThemedText style={styles.brandText}>Spotify</ThemedText>
        {view === "tracks" && activePlaylist ? (
          <ThemedText style={styles.brandSub} numberOfLines={1}>
            / {activePlaylist.name}
          </ThemedText>
        ) : null}
      </View>
      {authed ? (
        <Pressable style={styles.iconBtn} onPress={handleLogout}>
          <Feather name="log-out" size={18} color={Colors.dark.textSecondary} />
        </Pressable>
      ) : (
        <View style={styles.iconBtn} />
      )}
    </View>
  );

  // ── Bootstrapping ─────────────────────────────────────────────────────────
  if (authed === null || clientId === null) {
    return (
      <ThemedView style={styles.container}>
        {Header}
        <View style={styles.center}>
          <ActivityIndicator color={SPOTIFY_GREEN} />
        </View>
      </ThemedView>
    );
  }

  // ── Logged out ────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <ThemedView style={styles.container}>
        {Header}
        <View style={styles.center}>
          <View style={[styles.brandDot, styles.bigDot, { backgroundColor: SPOTIFY_GREEN }]} />
          <ThemedText style={styles.bigTitle}>Connect Spotify</ThemedText>
          <ThemedText style={styles.bigSub}>
            Sign in with your Spotify account to browse your playlists and library inside Ultra Cast.
          </ThemedText>
          <ThemedText style={styles.note}>
            Tip: Spotify Premium is required for full-track playback. Tapping a track opens it in the
            Spotify app.
          </ThemedText>
          <Pressable
            style={[styles.bigBtn, (busy || !request) && styles.bigBtnDisabled]}
            onPress={handleLogin}
            disabled={busy || !request}
          >
            {busy ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Feather name="log-in" size={18} color="#000" />
                <ThemedText style={styles.bigBtnText}>Sign in with Spotify</ThemedText>
              </>
            )}
          </Pressable>
          {Platform.OS === "web" ? (
            <ThemedText style={[styles.note, { marginTop: Spacing.sm }]}>
              On web, make sure your browser allows the Spotify popup.
            </ThemedText>
          ) : null}
        </View>
      </ThemedView>
    );
  }

  // ── Logged in ─────────────────────────────────────────────────────────────
  const renderPlaylist = ({ item }: { item: SpotifyPlaylist }) => {
    const cover = item.images?.[0]?.url;
    return (
      <Pressable style={styles.card} onPress={() => openPlaylist(item)}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.cardCover} />
        ) : (
          <View style={[styles.cardCover, styles.cardCoverFallback]}>
            <Feather name="music" size={28} color={Colors.dark.textSecondary} />
          </View>
        )}
        <ThemedText style={styles.cardTitle} numberOfLines={2}>
          {item.name}
        </ThemedText>
        <ThemedText style={styles.cardSub} numberOfLines={1}>
          {item.tracks.total} tracks · {item.owner.display_name}
        </ThemedText>
      </Pressable>
    );
  };

  const renderTrack = ({ item, index }: { item: SpotifyTrack; index: number }) => {
    const cover = item.album.images?.[item.album.images.length - 1]?.url;
    const mins = Math.floor(item.duration_ms / 60000);
    const secs = Math.floor((item.duration_ms % 60000) / 1000)
      .toString()
      .padStart(2, "0");
    return (
      <Pressable style={styles.trackRow} onPress={() => openInSpotify("track", item.id)}>
        <ThemedText style={styles.trackIdx}>{index + 1}</ThemedText>
        {cover ? <Image source={{ uri: cover }} style={styles.trackCover} /> : null}
        <View style={styles.trackMeta}>
          <ThemedText style={styles.trackTitle} numberOfLines={1}>
            {item.name}
          </ThemedText>
          <ThemedText style={styles.trackSub} numberOfLines={1}>
            {item.artists.map((a) => a.name).join(", ")} · {item.album.name}
          </ThemedText>
        </View>
        <ThemedText style={styles.trackDur}>
          {mins}:{secs}
        </ThemedText>
        <Feather name="external-link" size={16} color={Colors.dark.textSecondary} />
      </Pressable>
    );
  };

  return (
    <ThemedView style={styles.container}>
      {Header}

      {view === "playlists" ? (
        <>
          {profile ? (
            <View style={[styles.profileBar, { paddingHorizontal: padH }]}>
              {profile.images?.[0]?.url ? (
                <Image source={{ uri: profile.images[0].url }} style={styles.profileAvatar} />
              ) : (
                <View style={[styles.profileAvatar, styles.profileAvatarFallback]}>
                  <Feather name="user" size={16} color={Colors.dark.textSecondary} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.profileName}>
                  {profile.display_name ?? "Spotify User"}
                </ThemedText>
                <ThemedText style={styles.profileSub}>
                  {profile.product === "premium" ? "Premium account" : "Free account"}
                </ThemedText>
              </View>
            </View>
          ) : null}

          {loading && playlists.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator color={SPOTIFY_GREEN} />
            </View>
          ) : (
            <FlatList
              data={playlists}
              keyExtractor={(p) => p.id}
              renderItem={renderPlaylist}
              numColumns={3}
              columnWrapperStyle={{ gap: Spacing.md, paddingHorizontal: padH }}
              contentContainerStyle={{
                paddingTop: Spacing.md,
                paddingBottom: padB + Spacing.lg,
                gap: Spacing.md,
              }}
              ListEmptyComponent={
                <ThemedText style={styles.empty}>No playlists found.</ThemedText>
              }
            />
          )}
        </>
      ) : (
        <>
          {loading && tracks.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator color={SPOTIFY_GREEN} />
            </View>
          ) : (
            <FlatList
              data={tracks}
              keyExtractor={(t, idx) => `${t.id}-${idx}`}
              renderItem={renderTrack}
              contentContainerStyle={{
                paddingHorizontal: padH,
                paddingTop: Spacing.md,
                paddingBottom: padB + Spacing.lg,
              }}
              ListEmptyComponent={
                <ThemedText style={styles.empty}>This playlist has no tracks.</ThemedText>
              }
            />
          )}
        </>
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
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { flex: 1, flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  brandDot: { width: 14, height: 14, borderRadius: 7 },
  bigDot: { width: 64, height: 64, borderRadius: 32, marginBottom: Spacing.lg },
  brandText: { fontSize: 20, fontWeight: "700", color: Colors.dark.text },
  brandSub: { color: Colors.dark.textSecondary, fontSize: 14, flex: 1 },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  bigTitle: { fontSize: 24, fontWeight: "700", color: Colors.dark.text, marginBottom: Spacing.sm },
  bigSub: {
    color: Colors.dark.textSecondary,
    textAlign: "center",
    fontSize: 14,
    maxWidth: 480,
    marginBottom: Spacing.md,
  },
  note: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    textAlign: "center",
    fontStyle: "italic",
    maxWidth: 480,
    marginBottom: Spacing.lg,
  },
  bigBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: SPOTIFY_GREEN,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
  },
  bigBtnDisabled: { opacity: 0.6 },
  bigBtnText: { color: "#000", fontWeight: "700", fontSize: 15 },

  profileBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  profileAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.dark.backgroundSecondary },
  profileAvatarFallback: { alignItems: "center", justifyContent: "center" },
  profileName: { color: Colors.dark.text, fontWeight: "600", fontSize: 14 },
  profileSub: { color: Colors.dark.textSecondary, fontSize: 12 },

  card: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  cardCover: { width: "100%", aspectRatio: 1, borderRadius: BorderRadius.sm, backgroundColor: "#222" },
  cardCoverFallback: { alignItems: "center", justifyContent: "center" },
  cardTitle: { color: Colors.dark.text, fontWeight: "600", fontSize: 13 },
  cardSub: { color: Colors.dark.textSecondary, fontSize: 11 },

  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  trackIdx: { width: 28, color: Colors.dark.textSecondary, textAlign: "right", fontSize: 12 },
  trackCover: { width: 36, height: 36, borderRadius: 4, backgroundColor: "#222" },
  trackMeta: { flex: 1 },
  trackTitle: { color: Colors.dark.text, fontWeight: "600", fontSize: 13 },
  trackSub: { color: Colors.dark.textSecondary, fontSize: 11 },
  trackDur: { color: Colors.dark.textSecondary, fontSize: 12, width: 44, textAlign: "right" },

  empty: {
    color: Colors.dark.textSecondary,
    textAlign: "center",
    paddingVertical: Spacing.xl,
  },
});
