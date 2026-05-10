import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type PlayerEngine = "default" | "vlc";

interface PlayerEngineContextType {
  engine: PlayerEngine;
  setEngine: (e: PlayerEngine) => Promise<void>;
  toggleEngine: () => Promise<void>;
}

const PlayerEngineContext = createContext<PlayerEngineContextType | undefined>(undefined);

const STORAGE_KEY = "ultracast.player.engine.v1";

export function PlayerEngineProvider({ children }: { children: ReactNode }) {
  const [engine, setEngineState] = useState<PlayerEngine>("default");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && (v === "vlc" || v === "default")) {
          setEngineState(v);
        }
      } catch {}
      finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setEngine = useCallback(async (e: PlayerEngine) => {
    setEngineState(e);
    try { await AsyncStorage.setItem(STORAGE_KEY, e); } catch {}
  }, []);

  const toggleEngine = useCallback(async () => {
    await setEngine(engine === "vlc" ? "default" : "vlc");
  }, [engine, setEngine]);

  const value = useMemo<PlayerEngineContextType>(
    () => ({ engine, setEngine, toggleEngine }),
    [engine, setEngine, toggleEngine],
  );

  if (!hydrated) return null;

  return <PlayerEngineContext.Provider value={value}>{children}</PlayerEngineContext.Provider>;
}

export function usePlayerEngine(): PlayerEngineContextType {
  const ctx = useContext(PlayerEngineContext);
  if (!ctx) throw new Error("usePlayerEngine must be used inside <PlayerEngineProvider>");
  return ctx;
}
