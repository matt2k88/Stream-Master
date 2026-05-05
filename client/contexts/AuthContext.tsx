import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { xtreamApi, XtreamCredentials, AuthResponse } from "@/lib/xtream-api";

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
  }, []);

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
