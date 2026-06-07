import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PlayerEngine, HwDecodeMode } from "@/contexts/ProfileContext";

/**
 * Device-local preferences for the Guest profile. A guest never persists
 * anything to the server (no DB row exists for it), so the few settings a
 * guest is allowed to change — currently the player engine per stream type
 * and the VLC hardware-decoding mode — are stored on the device instead.
 */
export interface GuestPlayerPrefs {
  player_vod: PlayerEngine;
  player_live: PlayerEngine;
  player_hw_decode: HwDecodeMode;
}

const STORAGE_KEY = "ultracast.guest.player.v1";

const DEFAULTS: GuestPlayerPrefs = {
  player_vod: "vlc",
  player_live: "vlc",
  player_hw_decode: "auto",
};

function normalise(v: unknown): GuestPlayerPrefs {
  const obj = (v ?? {}) as Partial<GuestPlayerPrefs>;
  return {
    player_vod: obj.player_vod === "expo" ? "expo" : "vlc",
    player_live: obj.player_live === "expo" ? "expo" : "vlc",
    player_hw_decode:
      obj.player_hw_decode === "on" || obj.player_hw_decode === "off"
        ? obj.player_hw_decode
        : "auto",
  };
}

export async function loadGuestPlayerPrefs(): Promise<GuestPlayerPrefs> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return normalise(JSON.parse(raw));
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveGuestPlayerPrefs(prefs: GuestPlayerPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalise(prefs)));
  } catch {
    // best-effort — in-memory state remains the source of truth this session
  }
}

/**
 * Guest favourite football team. A guest has no DB row, so its favourite team
 * is kept on the device instead of the per-profile main-db table. Shaped to
 * match the api-football team object the picker selects.
 */
export interface GuestFavouriteTeam {
  id: number;
  name: string;
  code: string | null;
  logo: string | null;
  country?: string | null;
}

const FAV_TEAM_KEY = "ultracast.guest.football.favteam.v1";

export async function loadGuestFavouriteTeam(): Promise<GuestFavouriteTeam | null> {
  try {
    const raw = await AsyncStorage.getItem(FAV_TEAM_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Partial<GuestFavouriteTeam>;
    if (typeof obj?.id !== "number" || !obj?.name) return null;
    return {
      id: obj.id,
      name: obj.name,
      code: obj.code ?? null,
      logo: obj.logo ?? null,
      country: obj.country ?? null,
    };
  } catch {
    return null;
  }
}

export async function saveGuestFavouriteTeam(team: GuestFavouriteTeam): Promise<void> {
  try {
    await AsyncStorage.setItem(FAV_TEAM_KEY, JSON.stringify(team));
  } catch {
    // best-effort — in-memory state remains the source of truth this session
  }
}
