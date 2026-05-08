import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { AppState } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";

export type VpnStatus = "loading" | "none" | "enabled" | "disabled";

interface VpnContextType {
  status: VpnStatus;
  toggling: boolean;
  toggle: () => Promise<void>;
  refresh: () => Promise<void>;
}

const VpnContext = createContext<VpnContextType | undefined>(undefined);

const POLL_MS = 4000;

export function VpnProvider({ children }: { children: ReactNode }) {
  const { userInfo } = useAuth();
  const username = userInfo?.user_info?.username ?? null;

  const [status, setStatus] = useState<VpnStatus>("loading");
  const [toggling, setToggling] = useState(false);
  const isFetchingRef = useRef(false);
  const optimisticUntilRef = useRef(0);

  const fetchStatus = useCallback(async (uname: string) => {
    if (isFetchingRef.current) return;
    // If we just toggled optimistically, give the server a beat to commit
    // before we let polling overwrite the state.
    if (Date.now() < optimisticUntilRef.current) return;
    isFetchingRef.current = true;
    try {
      const url = new URL(`/api/vpn/status?username=${encodeURIComponent(uname)}`, getApiUrl()).toString();
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.subscribed) {
        setStatus("none");
      } else {
        setStatus(data.isEnabled ? "enabled" : "disabled");
      }
    } catch {
      // silent — keep last known status
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (username) await fetchStatus(username);
  }, [username, fetchStatus]);

  // Poll while authenticated + app is foregrounded.
  useEffect(() => {
    if (!username) {
      setStatus("loading");
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      fetchStatus(username);
      timer = setInterval(() => {
        if (!cancelled) fetchStatus(username);
      }, POLL_MS);
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };

    start();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") start(); else stop();
    });

    return () => {
      cancelled = true;
      stop();
      sub.remove();
    };
  }, [username, fetchStatus]);

  const toggle = useCallback(async () => {
    if (!username || status === "none" || status === "loading" || toggling) return;
    const next = status === "enabled" ? false : true;
    setToggling(true);
    setStatus(next ? "enabled" : "disabled"); // optimistic
    optimisticUntilRef.current = Date.now() + 2000;
    try {
      const res = await fetch(new URL("/api/vpn/toggle", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, isEnabled: next }),
      });
      if (!res.ok) {
        // Revert on failure
        setStatus(next ? "disabled" : "enabled");
      } else {
        const data = await res.json().catch(() => null);
        if (data && typeof data.isEnabled === "boolean") {
          setStatus(data.isEnabled ? "enabled" : "disabled");
        }
        // Push the optimistic window forward so the next poll (which may
        // race the just-committed write on Supabase's read replica) can't
        // overwrite our authoritative response.
        optimisticUntilRef.current = Date.now() + 2000;
      }
    } catch {
      setStatus(next ? "disabled" : "enabled");
    } finally {
      setToggling(false);
    }
  }, [username, status, toggling]);

  return (
    <VpnContext.Provider value={{ status, toggling, toggle, refresh }}>
      {children}
    </VpnContext.Provider>
  );
}

export function useVpn() {
  const ctx = useContext(VpnContext);
  if (!ctx) throw new Error("useVpn must be used within a VpnProvider");
  return ctx;
}
