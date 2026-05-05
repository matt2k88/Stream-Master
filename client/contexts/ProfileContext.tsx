import React, { createContext, useContext, useState, ReactNode } from "react";

export interface Profile {
  id: string;
  account_username: string;
  name: string;
  avatar_icon: string;
  avatar_color: string;
  pin: string | null;
  created_at: string;
}

interface ProfileContextType {
  activeProfile: Profile | null;
  setActiveProfile: (profile: Profile) => void;
  clearProfile: () => void;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [activeProfile, setActiveProfileState] = useState<Profile | null>(null);

  const setActiveProfile = (profile: Profile) => setActiveProfileState(profile);
  const clearProfile = () => setActiveProfileState(null);

  return (
    <ProfileContext.Provider value={{ activeProfile, setActiveProfile, clearProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}
