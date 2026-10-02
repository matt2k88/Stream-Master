import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { xtreamApi, XtreamCredentials, AuthResponse } from "@/lib/xtream-api";
import { loginLifetime, logoutLifetime, onLifetimeSessionInvalidated, restoreLifetime } from "@/lib/lifetime-session";
import { queryClient } from "@/lib/query-client";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  userInfo: AuthResponse | null;
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

  useEffect(() => {
    checkAuth();
    return onLifetimeSessionInvalidated(() => {
      setUserInfo(null);
      setIsAuthenticated(false);
      queryClient.clear();
      void xtreamApi.clearCredentials();
    });
  }, []);

  const checkAuth = async () => {
    try {
      const credentials = await xtreamApi.loadCredentials();
      if (credentials) {
        const info = await xtreamApi.getAccountInfo();
        await restoreLifetime(credentials.username, credentials.password);
        setUserInfo(info);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error("Saved account sign-in failed");
      await logoutLifetime().catch(() => {});
      await xtreamApi.clearCredentials();
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials: XtreamCredentials) => {
    try {
      const info = await xtreamApi.authenticate(credentials);
      await loginLifetime(credentials.username, credentials.password);
      queryClient.clear();
      setUserInfo(info);
      setIsAuthenticated(true);
    } catch (error) {
      await logoutLifetime().catch(() => {});
      await xtreamApi.clearCredentials();
      throw error;
    }
  };

  const logout = async () => {
    setUserInfo(null);
    setIsAuthenticated(false);
    queryClient.clear();
    await xtreamApi.clearCredentials();
    await logoutLifetime().catch(() => { console.warn("Server session revocation was unavailable; local session removed"); });
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
