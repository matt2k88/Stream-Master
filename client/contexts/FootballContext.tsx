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
  visibleLines: number;
}

interface FootballContextType {
  prefs: FootballPrefs;
  prefsLoaded: boolean;
  savePrefs: (p: Partial<FootballPrefs>) => Promise<void>;
  scores: FootballScore[];
  scoresLoading: boolean;
  refreshScores: () => void;
  // Admin global kill-switch. When false the whole feature is off regardless of
  // per-profile prefs (profile button hidden, tracker never shows).
  globalEnabled: boolean;
}

const DEFAULT_PREFS: FootballPrefs = {
  league_id: null,
  corner: "top-right",
  enabled: true,
  visibleLines: 5,
};

function clampLines(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 5;
  return Math.min(6, Math.max(1, v));
}

const POLL_MS = 30000;

const FootballContext = createContext<FootballContextType | undefined>(undefined);

export function FootballProvider({ children }: { children: ReactNode }) {
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id ?? null;

  const [prefs, setPrefs] = useState<FootballPrefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [scores, setScores] = useState<FootballScore[]>([]);
  const [scoresLoading, setScoresLoading] = useState(false);

  // Load the admin global kill-switch once on mount (defaults to enabled).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = new URL("/api/football/global", getApiUrl());
        const res = await fetch(url.toString());
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setGlobalEnabled(data?.enabled !== false);
        }
      } catch {
        // silent — defaults to enabled
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
              visibleLines: clampLines(data?.visible_lines ?? 5),
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
            visible_lines: next.visibleLines,
          }),
        });
      } catch {
        // best-effort — local state already updated
      }
    },
    [profileId, prefs],
  );

  const leagueId = prefs.league_id;
  // Per-profile enabled AND the admin global switch must both be on.
  const enabled = prefs.enabled && globalEnabled;

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
      globalEnabled,
    }),
    [prefs, prefsLoaded, savePrefs, scores, scoresLoading, fetchScores, globalEnabled],
  );

  return <FootballContext.Provider value={value}>{children}</FootballContext.Provider>;
}

export function useFootball() {
  const ctx = useContext(FootballContext);
  if (!ctx) throw new Error("useFootball must be used within FootballProvider");
  return ctx;
}
