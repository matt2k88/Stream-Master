import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getApiUrl } from "@/lib/query-client";
import { useProfile } from "@/contexts/ProfileContext";
import type { RecentlyWatched } from "@/components/RecentlyWatchedCard";

export interface SeriesProgress {
  /** Latest watched episode entry for the series, newest by save time. */
  latest: RecentlyWatched | undefined;
  /** Distinct episodes (by stream_id) for this series that the user has
   *  finished (`is_completed=true`). */
  watchedEpisodes: number;
  /** Snapshotted total-episode count for the series from the latest
   *  saved row. NULL if no episode has ever been saved with the snapshot
   *  populated (legacy rows / first-ever play before migration). */
  totalEpisodes: number | null;
  /** True when the current `last_modified` of the series differs from the
   *  one snapshotted on the latest entry → new episodes were uploaded
   *  since the user last played anything. Always false when no current
   *  value is supplied. */
  hasNewEpisodes: boolean;
  /** True when watchedEpisodes >= totalEpisodes (and totalEpisodes is
   *  known) AND there are no new episodes available. */
  isFullyWatched: boolean;
  /** Aggregated playback progress 0..1 for the latest episode (used by
   *  the Continue Watching mini progress bar). */
  latestProgress: number;
}

interface WatchHistoryContextValue {
  entries: RecentlyWatched[];
  byStreamId: Map<string, RecentlyWatched>;
  bySeriesId: Map<string, RecentlyWatched>;
  isLoading: boolean;
  refetch: () => Promise<void>;
  upsertLocal: (entry: RecentlyWatched) => void;
  getByStreamId: (id: string | number | null | undefined) => RecentlyWatched | undefined;
  getBySeriesId: (id: string | number | null | undefined) => RecentlyWatched | undefined;
  /** Series-wide aggregate state — see {@link SeriesProgress}. Pass the
   *  current `Series.last_modified` to enable the "new episodes" check;
   *  omit it for cheap series-progress lookups that don't care. */
  getSeriesProgress: (
    id: string | number | null | undefined,
    currentLastModified?: string | null,
  ) => SeriesProgress;
  clearHistory: (contentType: "movie" | "series" | "live") => Promise<void>;
  removeOne: (id: string) => Promise<void>;
}

const WatchHistoryContext = createContext<WatchHistoryContextValue | undefined>(undefined);

export function WatchHistoryProvider({ children }: { children: React.ReactNode }) {
  const { activeProfile } = useProfile();
  const [entries, setEntries] = useState<RecentlyWatched[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inflightRef = useRef<Promise<void> | null>(null);

  const refetch = useCallback(async () => {
    if (!activeProfile) {
      setEntries([]);
      return;
    }
    if (inflightRef.current) return inflightRef.current;
    setIsLoading(true);
    const p = (async () => {
      try {
        const url = new URL("/api/recently-watched", getApiUrl());
        url.searchParams.set("profile_id", activeProfile.id);
        const res = await fetch(url.toString());
        const data = await res.json();
        setEntries(Array.isArray(data) ? data : []);
      } catch {
        // keep previous entries on error
      } finally {
        setIsLoading(false);
        inflightRef.current = null;
      }
    })();
    inflightRef.current = p;
    return p;
  }, [activeProfile]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const upsertLocal = useCallback((entry: RecentlyWatched) => {
    setEntries((prev) => {
      const sid = entry.stream_id != null ? String(entry.stream_id) : null;
      const without = sid
        ? prev.filter((e) => String(e.stream_id ?? "") !== sid)
        : prev.filter((e) => e.id !== entry.id);
      return [entry, ...without];
    });
  }, []);

  const { byStreamId, bySeriesId, bySeriesIdAll } = useMemo(() => {
    const sMap = new Map<string, RecentlyWatched>();
    const serMap = new Map<string, RecentlyWatched>();
    const serAll = new Map<string, RecentlyWatched[]>();
    // entries are pre-ordered newest-first by the server; first wins
    for (const e of entries) {
      if (e.stream_id != null) {
        const k = String(e.stream_id);
        if (!sMap.has(k)) sMap.set(k, e);
      }
      if (e.series_id != null) {
        const k = String(e.series_id);
        if (!serMap.has(k)) serMap.set(k, e);
        const arr = serAll.get(k);
        if (arr) arr.push(e); else serAll.set(k, [e]);
      }
    }
    return { byStreamId: sMap, bySeriesId: serMap, bySeriesIdAll: serAll };
  }, [entries]);

  const getByStreamId = useCallback(
    (id: string | number | null | undefined) =>
      id == null ? undefined : byStreamId.get(String(id)),
    [byStreamId],
  );
  const getBySeriesId = useCallback(
    (id: string | number | null | undefined) =>
      id == null ? undefined : bySeriesId.get(String(id)),
    [bySeriesId],
  );

  // Precompute the per-series base aggregate once per `entries` change so
  // that FlashList rows can do an O(1) lookup instead of re-walking the
  // series' rows on every render. The only per-call work left is the cheap
  // `currentLastModified` comparison (which depends on caller input).
  const seriesBaseById = useMemo(() => {
    const out = new Map<string, {
      latest: RecentlyWatched;
      watchedEpisodes: number;
      totalEpisodes: number | null;
      snapshotLastModified: string | null;
      latestProgress: number;
      // True iff at least one entry for this series matches the snapshot's
      // final season+episode AND is marked completed. This is the single
      // signal for "they finished the FINAL available episode".
      finalEpisodeCompleted: boolean;
    }>();
    for (const [k, all] of bySeriesIdAll.entries()) {
      if (!all || all.length === 0) continue;
      const latest = all[0];
      const completedStreams = new Set<string>();
      for (const e of all) {
        if (e.is_completed && e.stream_id != null) completedStreams.add(String(e.stream_id));
      }
      let latestProgress = 0;
      if (latest.is_completed) {
        latestProgress = 1;
      } else {
        const dur = latest.duration ?? 0;
        const cur = latest.current_time ?? 0;
        if (dur > 0 && cur > 0) latestProgress = Math.max(0.02, Math.min(1, cur / dur));
      }
      // Use the most recent row's snapshot of "what is the final episode?"
      // — it's the freshest read of the series catalogue we have. If the
      // provider has since added more episodes, `hasNewEpisodes` will fire
      // independently and override WATCHED back to CONTINUE.
      const finalSeason = typeof latest.series_final_season === "number" ? latest.series_final_season : null;
      const finalEpisode = typeof latest.series_final_episode === "number" ? latest.series_final_episode : null;
      let finalEpisodeCompleted = false;
      if (finalSeason != null && finalEpisode != null) {
        for (const e of all) {
          if (e.is_completed && e.season_num === finalSeason && e.episode_num === finalEpisode) {
            finalEpisodeCompleted = true;
            break;
          }
        }
      }
      out.set(k, {
        latest,
        watchedEpisodes: completedStreams.size,
        totalEpisodes: typeof latest.series_total_episodes === "number" ? latest.series_total_episodes : null,
        snapshotLastModified: latest.series_last_modified ?? null,
        latestProgress,
        finalEpisodeCompleted,
      });
    }
    return out;
  }, [bySeriesIdAll]);

  const getSeriesProgress = useCallback(
    (id: string | number | null | undefined, currentLastModified?: string | null): SeriesProgress => {
      const empty: SeriesProgress = {
        latest: undefined, watchedEpisodes: 0, totalEpisodes: null,
        hasNewEpisodes: false, isFullyWatched: false, latestProgress: 0,
      };
      if (id == null) return empty;
      const base = seriesBaseById.get(String(id));
      if (!base) return empty;
      const hasNewEpisodes = !!(
        currentLastModified && base.snapshotLastModified && currentLastModified !== base.snapshotLastModified
      );
      // The series is WATCHED only when the user has completed the
      // FINAL available episode (highest season → highest episode in
      // that season). Skipping middle episodes is fine — what matters is
      // there's nothing left after the final one. As soon as the
      // provider uploads new episodes, `hasNewEpisodes` flips this back
      // to CONTINUE WATCHING and the NEW EPISODES badge is shown.
      const isFullyWatched = !hasNewEpisodes && base.finalEpisodeCompleted;
      return {
        latest: base.latest,
        watchedEpisodes: base.watchedEpisodes,
        totalEpisodes: base.totalEpisodes,
        hasNewEpisodes,
        isFullyWatched,
        latestProgress: base.latestProgress,
      };
    },
    [seriesBaseById],
  );

  const clearHistory = useCallback(
    async (contentType: "movie" | "series" | "live") => {
      if (!activeProfile) return;
      // Optimistic clear
      setEntries((prev) => prev.filter((e) => e.content_type !== contentType));
      try {
        const url = new URL("/api/recently-watched", getApiUrl());
        url.searchParams.set("profile_id", activeProfile.id);
        url.searchParams.set("content_type", contentType);
        await fetch(url.toString(), { method: "DELETE" });
      } catch {
        refetch();
      }
    },
    [activeProfile, refetch]
  );

  const removeOne = useCallback(
    async (id: string) => {
      if (!id) return;
      // Optimistic remove
      setEntries((prev) => prev.filter((e) => e.id !== id));
      try {
        const url = new URL(`/api/recently-watched/${encodeURIComponent(id)}`, getApiUrl());
        await fetch(url.toString(), { method: "DELETE" });
      } catch {
        refetch();
      }
    },
    [refetch],
  );

  const value = useMemo<WatchHistoryContextValue>(
    () => ({
      entries,
      byStreamId,
      bySeriesId,
      isLoading,
      refetch,
      upsertLocal,
      getByStreamId,
      getBySeriesId,
      getSeriesProgress,
      clearHistory,
      removeOne,
    }),
    [entries, byStreamId, bySeriesId, isLoading, refetch, upsertLocal, getByStreamId, getBySeriesId, getSeriesProgress, clearHistory, removeOne],
  );

  return (
    <WatchHistoryContext.Provider value={value}>{children}</WatchHistoryContext.Provider>
  );
}

export function useWatchHistory(): WatchHistoryContextValue {
  const ctx = useContext(WatchHistoryContext);
  if (!ctx) throw new Error("useWatchHistory must be used inside WatchHistoryProvider");
  return ctx;
}

/** Helper for cards: returns {progress 0..1, isCompleted, hasProgress} */
export function getWatchState(entry?: RecentlyWatched | null) {
  if (!entry) return { progress: 0, isCompleted: false, hasProgress: false };
  if (entry.is_completed) return { progress: 1, isCompleted: true, hasProgress: true };
  const dur = entry.duration ?? 0;
  const cur = entry.current_time ?? 0;
  if (dur > 0 && cur > 0) {
    return { progress: Math.max(0.02, Math.min(1, cur / dur)), isCompleted: false, hasProgress: true };
  }
  return { progress: 0, isCompleted: false, hasProgress: false };
}
