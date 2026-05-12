import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { getApiUrl } from "@/lib/query-client";

const TOKEN_KEY = "spotify_tokens_v1";
const PENDING_KEY = "spotify_pending_auth_v1";

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") return AsyncStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}
async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") return AsyncStorage.setItem(key, value);
  await SecureStore.setItemAsync(key, value);
}
async function secureDel(key: string): Promise<void> {
  if (Platform.OS === "web") return AsyncStorage.removeItem(key);
  await SecureStore.deleteItemAsync(key);
}
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";

export const SPOTIFY_SCOPES = [
  "user-read-email",
  "user-read-private",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read",
  "user-top-read",
  "user-read-recently-played",
];

export type SpotifyTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

let cachedClientId: string | null = null;

export async function getSpotifyClientId(): Promise<string> {
  if (cachedClientId) return cachedClientId;
  const url = new URL("/api/spotify-config", getApiUrl());
  const res = await fetch(url.toString());
  const data = await res.json();
  cachedClientId = data.clientId || "";
  return cachedClientId!;
}

export async function saveTokens(t: SpotifyTokens): Promise<void> {
  await secureSet(TOKEN_KEY, JSON.stringify(t));
}

export async function loadTokens(): Promise<SpotifyTokens | null> {
  const raw = await secureGet(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SpotifyTokens;
  } catch {
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  await secureDel(TOKEN_KEY);
}

// ── Pending auth (survives app being killed mid-OAuth) ───────────────────────
// Android (especially Android TV) often kills the app while the user is on the
// Spotify login page. When the app re-opens via the deep link redirect, the
// in-memory `request.codeVerifier` from useAuthRequest is gone. We persist it
// here so we can finish the exchange whenever the app comes back.
export type PendingAuth = { codeVerifier: string; redirectUri: string; createdAt: number };

export async function savePendingAuth(p: PendingAuth): Promise<void> {
  await secureSet(PENDING_KEY, JSON.stringify(p));
}
export async function loadPendingAuth(): Promise<PendingAuth | null> {
  const raw = await secureGet(PENDING_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as PendingAuth;
    // Stale guard — Spotify auth codes are short-lived; treat anything older
    // than 15 minutes as abandoned.
    if (Date.now() - p.createdAt > 15 * 60_000) {
      await secureDel(PENDING_KEY);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}
export async function clearPendingAuth(): Promise<void> {
  await secureDel(PENDING_KEY);
}

export async function exchangeCodeForTokens(args: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<SpotifyTokens> {
  const clientId = await getSpotifyClientId();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
    client_id: clientId,
    code_verifier: args.codeVerifier,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Spotify token exchange failed: ${res.status} ${txt}`);
  }
  const j = await res.json();
  const tokens: SpotifyTokens = {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 - 60_000,
  };
  await saveTokens(tokens);
  return tokens;
}

async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokens> {
  const clientId = await getSpotifyClientId();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Spotify token refresh failed: ${res.status} ${txt}`);
  }
  const j = await res.json();
  const tokens: SpotifyTokens = {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? refreshToken,
    expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 - 60_000,
  };
  await saveTokens(tokens);
  return tokens;
}

export async function getValidAccessToken(): Promise<string | null> {
  const t = await loadTokens();
  if (!t) return null;
  if (Date.now() < t.expiresAt) return t.accessToken;
  try {
    const fresh = await refreshAccessToken(t.refreshToken);
    return fresh.accessToken;
  } catch {
    await clearTokens();
    return null;
  }
}

export async function spotifyFetch<T = any>(path: string): Promise<T> {
  const token = await getValidAccessToken();
  if (!token) throw new Error("Not authenticated with Spotify");
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Spotify API ${res.status}: ${txt}`);
  }
  return res.json();
}

export type SpotifyImage = { url: string; width?: number; height?: number };

export type SpotifyProfile = {
  id: string;
  display_name: string;
  email?: string;
  product?: string;
  images?: SpotifyImage[];
};

export type SpotifyPlaylist = {
  id: string;
  name: string;
  description?: string;
  images?: SpotifyImage[];
  tracks: { total: number };
  owner: { display_name: string };
};

export type SpotifyTrack = {
  id: string;
  name: string;
  preview_url: string | null;
  duration_ms: number;
  artists: { id: string; name: string }[];
  album: { id: string; name: string; images?: SpotifyImage[] };
};
