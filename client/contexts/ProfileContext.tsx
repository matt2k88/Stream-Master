import React, { createContext, useContext, useState, ReactNode, useCallback, useRef } from "react";
import { getApiUrl } from "@/lib/query-client";

export type PlayerEngine = "vlc" | "expo";

/**
 * Per-profile hardware-decoding preference for the VLC engine.
 *  • "auto" — let libVLC decide (the existing/default behaviour).
 *  • "on"   — force hardware decoding (best for 4K/HDR on capable devices).
 *  • "off"  — force software decoding (fixes green/garbled frames, stutter
 *             or no-audio on devices whose hardware decoder is flaky).
 * Only affects the VLC engine; the Expo engine ignores it.
 */
export type HwDecodeMode = "auto" | "on" | "off";

/**
 * Parental controls configuration stored as JSONB in the profiles table.
 * Only active when enabled=true. allowed_ratings is a subset of the recognised
 * rating codes (U PG 12A 12 PG-13 15 R 18 R18). show_unclassified controls whether content
 * with no TMDB rating is shown or hidden.
 */
export interface ParentalControls {
  enabled: boolean;
  allowed_ratings: string[];
  show_unclassified: boolean;
}

export interface Profile {
  id: string;
  account_username: string;
  name: string;
  avatar_icon: string;
  avatar_color: string;
  avatar_image?: string | null;
  pin: string | null;
  created_at: string;
  // Per-profile video engine preferences. Default to "vlc" if the
  // backend hasn't migrated yet (the 005 migration sets a default
  // server-side too).
  player_vod?: PlayerEngine;
  player_live?: PlayerEngine;
  // Per-profile VLC hardware-decoding mode. Defaults to "auto" so existing
  // users see no behaviour change until they opt in. Applies to both Live
  // and VOD on the VLC engine; ignored by the Expo engine.
  player_hw_decode?: HwDecodeMode;
  // Per-profile network pre-buffer size in milliseconds. Controls how far
  // ahead of playback the player buffers the stream. Defaults to 3000 ms.
  // Applies to both VLC (--network-caching) and Expo (bufferOptions).
  player_buffer_ms?: number;
  // When true, no watch history is saved to recently_watched — enforced
  // both client-side (upsertLocal no-ops) and server-side (POST skips insert).
  private_viewing?: boolean;
  // Parental controls PIN (plain 4-digit text, same pattern as profile PIN).
  parental_pin?: string | null;
  // Parental controls config. null / undefined means disabled.
  parental_controls?: ParentalControls | null;
}

/**
 * Sentinel id for the synthetic "Guest" profile. A guest is never stored in
 * the database — it exists only in memory for the current session — so no
 * per-profile data (recently watched, favourites, groups, category prefs) is
 * ever read or written for it.
 */
export const GUEST_PROFILE_ID = "guest";

export function isGuestProfile(profile: Profile | null | undefined): boolean {
  return !!profile && profile.id === GUEST_PROFILE_ID;
}

/**
 * Build the in-memory Guest profile. Player engine prefs are device-local
 * (loaded from AsyncStorage by the caller) since a guest has no DB row.
 */
export function makeGuestProfile(
  accountUsername: string,
  prefs?: { player_vod?: PlayerEngine; player_live?: PlayerEngine; player_hw_decode?: HwDecodeMode; player_buffer_ms?: number },
): Profile {
  return {
    id: GUEST_PROFILE_ID,
    account_username: accountUsername,
    name: "Guest",
    avatar_icon: "user",
    avatar_color: "#FF6600",
    pin: null,
    created_at: new Date().toISOString(),
    player_vod: prefs?.player_vod === "expo" ? "expo" : "vlc",
    player_live: prefs?.player_live === "expo" ? "expo" : "vlc",
    player_hw_decode: normaliseHwDecode(prefs?.player_hw_decode),
    player_buffer_ms: normaliseBufferMs(prefs?.player_buffer_ms),
  };
}

/** Coerce any value into a valid HwDecodeMode, defaulting to "auto". */
export function normaliseHwDecode(v: unknown): HwDecodeMode {
  return v === "on" || v === "off" ? v : "auto";
}

const VALID_BUFFER_PRESETS = [1500, 3000, 5000, 10000, 30000] as const;
export type BufferPreset = typeof VALID_BUFFER_PRESETS[number];

/** Coerce any value into a valid buffer preset ms, defaulting to 3000. */
export function normaliseBufferMs(v: unknown): BufferPreset {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 3000;
  return (VALID_BUFFER_PRESETS as readonly number[]).includes(n)
    ? (n as BufferPreset)
    : 3000;
}

/** Resolve the network pre-buffer for a profile. Defaults to 3000 ms. */
export function getBufferMs(profile: Profile | null): BufferPreset {
  return normaliseBufferMs(profile?.player_buffer_ms);
}

interface ProfileContextType {
  activeProfile: Profile | null;
  /** True when the active profile is the synthetic guest profile. */
  isGuest: boolean;
  setActiveProfile: (profile: Profile) => void;
  clearProfile: () => void;
  /** Patch fields on the active profile (in-memory only). */
  updateActiveProfile: (patch: Partial<Profile>) => void;
  /**
   * Refetch the active profile from the server and merge any changes
   * (e.g. player_vod / player_live flipped from an external admin
   * panel). Cheap, deduped, and safe to call from screen-focus
   * effects. Returns the refreshed profile or null if the request
   * failed / no active profile.
   */
  refreshActiveProfile: () => Promise<Profile | null>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [activeProfile, setActiveProfileState] = useState<Profile | null>(null);
  const activeRef = useRef<Profile | null>(null);
  activeRef.current = activeProfile;
  const inflightRef = useRef<Promise<Profile | null> | null>(null);

  const setActiveProfile = (profile: Profile) => setActiveProfileState(profile);
  const clearProfile = () => setActiveProfileState(null);
  const updateActiveProfile = useCallback((patch: Partial<Profile>) => {
    setActiveProfileState((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const refreshActiveProfile = useCallback(async (): Promise<Profile | null> => {
    const current = activeRef.current;
    if (!current) return null;
    // Guest has no DB row — nothing to refresh.
    if (current.id === GUEST_PROFILE_ID) return current;
    // Dedupe concurrent calls (e.g. focus + button press both firing).
    if (inflightRef.current) return inflightRef.current;
    const p = (async () => {
      try {
        const url = new URL("/api/profiles", getApiUrl());
        url.searchParams.set("username", current.account_username);
        const res = await fetch(url.toString());
        if (!res.ok) return null;
        const list: Profile[] = await res.json();
        const fresh = Array.isArray(list) ? list.find((x) => x.id === current.id) : null;
        if (!fresh) return null;
        // Only patch fields we care about on this path so we don't
        // clobber any in-memory tweaks the user just made.
        const patch: Partial<Profile> = {
          name: fresh.name,
          avatar_icon: fresh.avatar_icon,
          avatar_color: fresh.avatar_color,
          pin: fresh.pin,
          player_vod: fresh.player_vod,
          player_live: fresh.player_live,
          player_hw_decode: fresh.player_hw_decode,
          player_buffer_ms: fresh.player_buffer_ms,
        };
        setActiveProfileState((prev) => {
          if (!prev || prev.id !== current.id) return prev;
          // Skip the update entirely when nothing changed — otherwise a new
          // object reference is created on every dashboard focus, churning
          // every downstream useCallback/useMemo that depends on
          // activeProfile and triggering render loops.
          const unchanged =
            prev.name === patch.name &&
            prev.avatar_icon === patch.avatar_icon &&
            prev.avatar_color === patch.avatar_color &&
            prev.pin === patch.pin &&
            prev.player_vod === patch.player_vod &&
            prev.player_live === patch.player_live &&
            prev.player_hw_decode === patch.player_hw_decode &&
            prev.player_buffer_ms === patch.player_buffer_ms;
          return unchanged ? prev : { ...prev, ...patch };
        });
        return { ...current, ...patch };
      } catch {
        return null;
      } finally {
        inflightRef.current = null;
      }
    })();
    inflightRef.current = p;
    return p;
  }, []);

  return (
    <ProfileContext.Provider
      value={{ activeProfile, isGuest: activeProfile?.id === GUEST_PROFILE_ID, setActiveProfile, clearProfile, updateActiveProfile, refreshActiveProfile }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}

/**
 * Resolve the active player engine for a stream type. Defaults to "vlc"
 * if the profile is missing or the field hasn't been set yet.
 */
export function getPlayerEngine(
  profile: Profile | null,
  isLive: boolean,
): PlayerEngine {
  if (!profile) return "vlc";
  const v = isLive ? profile.player_live : profile.player_vod;
  return v === "expo" ? "expo" : "vlc";
}

/**
 * Resolve the active VLC hardware-decoding mode for a profile. Defaults to
 * "auto" if the profile is missing or the field hasn't been set yet.
 */
export function getHwDecode(profile: Profile | null): HwDecodeMode {
  return normaliseHwDecode(profile?.player_hw_decode);
}
