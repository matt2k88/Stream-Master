import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type PlayerEngine = "expo" | "rnv";

interface PlayerEngineContextType {
  engine: PlayerEngine;
  setEngine: (e: PlayerEngine) => Promise<void>;
}

const PlayerEngineContext = createContext<PlayerEngineContextType | undefined>(undefined);

const STORAGE_KEY = "ultracast.player.engine.v1";

let _activeEngine: PlayerEngine = "expo";
export function getActiveEngine(): PlayerEngine {
  if (Platform.OS === "web") return "expo";
  return _activeEngine;
}
export function setActiveEngine(e: PlayerEngine) {
  _activeEngine = e;
}

export function PlayerEngineProvider({ children }: { children: ReactNode }) {
  const [engine, setEngineState] = useState<PlayerEngine>("expo");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && (v === "expo" || v === "rnv")) {
          setEngineState(v);
          setActiveEngine(v);
        }
      } catch {
        // ignore — fall back to default "expo"
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setEngine = useCallback(async (e: PlayerEngine) => {
    setEngineState(e);
    setActiveEngine(e);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, e);
    } catch {
      // ignore — runtime state already updated
    }
  }, []);

  const value = useMemo<PlayerEngineContextType>(
    () => ({ engine, setEngine }),
    [engine, setEngine],
  );

  if (!hydrated) return null;

  return <PlayerEngineContext.Provider value={value}>{children}</PlayerEngineContext.Provider>;
}

export function usePlayerEngine(): PlayerEngineContextType {
  const ctx = useContext(PlayerEngineContext);
  if (!ctx) {
    throw new Error("usePlayerEngine must be used inside <PlayerEngineProvider>");
  }
  return ctx;
}
