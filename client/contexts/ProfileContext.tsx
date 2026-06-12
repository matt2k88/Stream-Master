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

export interface Profile {
  id: string;
  account_username: string;
  name: string;
  avatar_icon: string;
  avatar_color: string;
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
  // When true, no watch history is saved to recently_watched — enforced
  // both client-side (upsertLocal no-ops) and server-side (POST skips insert).
  private_viewing?: boolean;
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
  prefs?: { player_vod?: PlayerEngine; player_live?: PlayerEngine; player_hw_decode?: HwDecodeMode },
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
  };
}

/** Coerce any value into a valid HwDecodeMode, defaulting to "auto". */
export function normaliseHwDecode(v: unknown): HwDecodeMode {
  return v === "on" || v === "off" ? v : "auto";
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
            prev.player_hw_decode === patch.player_hw_decode;
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
