import React, { createContext, useContext, useState, ReactNode, useCallback } from "react";

export type PlayerEngine = "vlc" | "expo";

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
}

interface ProfileContextType {
  activeProfile: Profile | null;
  setActiveProfile: (profile: Profile) => void;
  clearProfile: () => void;
  /** Patch fields on the active profile (in-memory only). */
  updateActiveProfile: (patch: Partial<Profile>) => void;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [activeProfile, setActiveProfileState] = useState<Profile | null>(null);

  const setActiveProfile = (profile: Profile) => setActiveProfileState(profile);
  const clearProfile = () => setActiveProfileState(null);
  const updateActiveProfile = useCallback((patch: Partial<Profile>) => {
    setActiveProfileState((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  return (
    <ProfileContext.Provider
      value={{ activeProfile, setActiveProfile, clearProfile, updateActiveProfile }}
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
 * Resolve the active player engine for a stream type.
 *
 * Defaults:
 *   - Live  → "vlc"  (covers AC3/EAC3 surround audio that some IPTV
 *                    providers ship on live channels but expo-video /
 *                    Media3 can't decode out of the box)
 *   - VOD   → "expo" (rock-solid seek / continue-watching / skip
 *                    behaviour. VLC's seek on movies & series is flaky
 *                    on TS / non-fragmented MP4 streams — libvlc fires
 *                    spurious Stopped events around the seek and
 *                    recovery is unreliable. expo-video uses Media3 /
 *                    AVPlayer which handle these cleanly.)
 *
 * Users can still override per stream-type in Player Settings when
 * they hit a stream that the default engine struggles with.
 */
export function getPlayerEngine(
  profile: Profile | null,
  isLive: boolean,
): PlayerEngine {
  const fallback: PlayerEngine = isLive ? "vlc" : "expo";
  if (!profile) return fallback;
  const v = isLive ? profile.player_live : profile.player_vod;
  if (v === "expo") return "expo";
  if (v === "vlc") return "vlc";
  return fallback;
}
