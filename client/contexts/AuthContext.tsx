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
        try {
          const info = await xtreamApi.getAccountInfo();
          setUserInfo(info);
        } catch (infoError) {
          console.warn("getAccountInfo failed, using stored credentials:", infoError);
          setUserInfo({
            user_info: {
              username: credentials.username,
              password: credentials.password,
              message: "",
              auth: 1,
              status: "Active",
              exp_date: "",
              is_trial: "0",
              active_cons: "0",
              created_at: "",
              max_connections: "1",
              allowed_output_formats: [],
            },
            server_info: {
              url: credentials.serverUrl,
              port: "",
              https_port: "",
              server_protocol: "http",
              rtmp_port: "",
              timezone: "",
              timestamp_now: 0,
              time_now: "",
            },
          });
        }
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
