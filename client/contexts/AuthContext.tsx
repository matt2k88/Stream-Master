import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { xtreamApi, XtreamCredentials, AuthResponse } from "@/lib/xtream-api";

export type PlayerMode = "internal" | "vlc";

const PLAYER_MODE_KEY = "@ultracast_player_mode";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  userInfo: AuthResponse | null;
  playerMode: PlayerMode;
  setPlayerMode: (mode: PlayerMode) => Promise<void>;
  login: (credentials: XtreamCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshUserInfo: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<AuthResponse | null>(null);
  const [playerMode, setPlayerModeState] = useState<PlayerMode>("internal");

  useEffect(() => {
    checkAuth();
    loadPlayerMode();
  }, []);

  const loadPlayerMode = async () => {
    try {
      const stored = await AsyncStorage.getItem(PLAYER_MODE_KEY);
      if (stored === "vlc" || stored === "internal") {
        setPlayerModeState(stored);
      }
    } catch (_) {}
  };

  const setPlayerMode = async (mode: PlayerMode) => {
    setPlayerModeState(mode);
    try {
      await AsyncStorage.setItem(PLAYER_MODE_KEY, mode);
    } catch (_) {}
  };

  const checkAuth = async () => {
    try {
      const credentials = await xtreamApi.loadCredentials();
      if (credentials) {
        const info = await xtreamApi.getAccountInfo();
        setUserInfo(info);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      await xtreamApi.clearCredentials();
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials: XtreamCredentials) => {
    const info = await xtreamApi.authenticate(credentials);
    setUserInfo(info);
    setIsAuthenticated(true);
  };

  const logout = async () => {
    await xtreamApi.clearCredentials();
    setUserInfo(null);
    setIsAuthenticated(false);
  };

  const refreshUserInfo = async () => {
    try {
      const info = await xtreamApi.getAccountInfo();
      setUserInfo(info);
    } catch (error) {
      console.error("Failed to refresh user info:", error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        userInfo,
        playerMode,
        setPlayerMode,
        login,
        logout,
        refreshUserInfo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
