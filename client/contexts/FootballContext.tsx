import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { getApiUrl } from "@/lib/query-client";

export type FootballCorner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "middle-left"
  | "middle-right";

export interface FootballScore {
  fixture_id: number;
  league_id: number;
  league_name: string | null;
  league_country: string | null;
  home_team: string | null;
  away_team: string | null;
  home_goals: number;
  away_goals: number;
  status_short: string | null;
  elapsed: number | null;
  finished_at: string | null;
  last_goal_player?: string | null;
  last_goal_team?: string | null;
  last_goal_minute?: number | null;
  last_goal_at?: string | null;
}

export interface FootballPrefs {
  league_id: number | null;
  corner: FootballCorner;
  enabled: boolean;
}

interface FootballContextType {
  prefs: FootballPrefs;
  prefsLoaded: boolean;
  savePrefs: (p: Partial<FootballPrefs>) => Promise<void>;
  scores: FootballScore[];
  scoresLoading: boolean;
  refreshScores: () => void;
}

const DEFAULT_PREFS: FootballPrefs = {
  league_id: null,
  corner: "top-right",
  enabled: true,
};

const POLL_MS = 30000;

const FootballContext = createContext<FootballContextType | undefined>(undefined);

export function FootballProvider({ children }: { children: ReactNode }) {
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id ?? null;

  const [prefs, setPrefs] = useState<FootballPrefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [scores, setScores] = useState<FootballScore[]>([]);
  const [scoresLoading, setScoresLoading] = useState(false);

  // Load prefs whenever the active profile changes.
  useEffect(() => {
    let cancelled = false;
    if (!profileId) {
      setPrefs(DEFAULT_PREFS);
      setPrefsLoaded(true);
      return;
    }
    setPrefsLoaded(false);
    (async () => {
      try {
        const url = new URL("/api/football/prefs", getApiUrl());
        url.searchParams.set("profile_id", profileId);
        const res = await fetch(url.toString());
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setPrefs({
              league_id: data?.league_id ?? null,
              corner: (data?.corner ?? "top-right") as FootballCorner,
              enabled: data?.enabled !== false,
            });
          }
        }
      } catch {
        // silent — non-critical
      } finally {
        if (!cancelled) setPrefsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const savePrefs = useCallback(
    async (p: Partial<FootballPrefs>) => {
      if (!profileId) return;
      const next = { ...prefs, ...p };
      setPrefs(next);
      try {
        const url = new URL("/api/football/prefs", getApiUrl());
        await fetch(url.toString(), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile_id: profileId,
            league_id: next.league_id,
            corner: next.corner,
            enabled: next.enabled,
          }),
        });
      } catch {
        // best-effort — local state already updated
      }
    },
    [profileId, prefs],
  );

  const leagueId = prefs.league_id;
  const enabled = prefs.enabled;

  const fetchScores = useCallback(async () => {
    if (leagueId == null) {
      setScores([]);
      return;
    }
    try {
      const url = new URL("/api/football/scores", getApiUrl());
      url.searchParams.set("league_id", String(leagueId));
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setScores(Array.isArray(data) ? data : []);
      }
    } catch {
      // silent
    }
  }, [leagueId]);

  // Poll the cached scores every 30s while a league is selected and enabled.
  // The server is the only thing that talks to api-football; clients just read
  // the Supabase cache.
  useEffect(() => {
    if (leagueId == null || !enabled) {
      setScores([]);
      return;
    }
    let active = true;
    setScoresLoading(true);
    fetchScores().finally(() => {
      if (active) setScoresLoading(false);
    });
    const id = setInterval(fetchScores, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [leagueId, enabled, fetchScores]);

  const value = useMemo<FootballContextType>(
    () => ({
      prefs,
      prefsLoaded,
      savePrefs,
      scores,
      scoresLoading,
      refreshScores: fetchScores,
    }),
    [prefs, prefsLoaded, savePrefs, scores, scoresLoading, fetchScores],
  );

  return <FootballContext.Provider value={value}>{children}</FootballContext.Provider>;
}

export function useFootball() {
  const ctx = useContext(FootballContext);
  if (!ctx) throw new Error("useFootball must be used within FootballProvider");
  return ctx;
}
