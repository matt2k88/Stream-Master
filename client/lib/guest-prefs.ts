import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PlayerEngine } from "@/contexts/ProfileContext";

/**
 * Device-local preferences for the Guest profile. A guest never persists
 * anything to the server (no DB row exists for it), so the few settings a
 * guest is allowed to change — currently the player engine per stream type —
 * are stored on the device instead.
 */
export interface GuestPlayerPrefs {
  player_vod: PlayerEngine;
  player_live: PlayerEngine;
}

const STORAGE_KEY = "ultracast.guest.player.v1";

const DEFAULTS: GuestPlayerPrefs = { player_vod: "vlc", player_live: "vlc" };

function normalise(v: unknown): GuestPlayerPrefs {
  const obj = (v ?? {}) as Partial<GuestPlayerPrefs>;
  return {
    player_vod: obj.player_vod === "expo" ? "expo" : "vlc",
    player_live: obj.player_live === "expo" ? "expo" : "vlc",
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
