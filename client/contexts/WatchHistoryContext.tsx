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

interface WatchHistoryContextValue {
  entries: RecentlyWatched[];
  byStreamId: Map<string, RecentlyWatched>;
  bySeriesId: Map<string, RecentlyWatched>;
  isLoading: boolean;
  refetch: () => Promise<void>;
  upsertLocal: (entry: RecentlyWatched) => void;
  getByStreamId: (id: string | number | null | undefined) => RecentlyWatched | undefined;
  getBySeriesId: (id: string | number | null | undefined) => RecentlyWatched | undefined;
  clearHistory: (contentType: "movie" | "series") => Promise<void>;
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

  const { byStreamId, bySeriesId } = useMemo(() => {
    const sMap = new Map<string, RecentlyWatched>();
    const serMap = new Map<string, RecentlyWatched>();
    // entries are pre-ordered newest-first by the server; first wins
    for (const e of entries) {
      if (e.stream_id != null) {
        const k = String(e.stream_id);
        if (!sMap.has(k)) sMap.set(k, e);
      }
      if (e.series_id != null) {
        const k = String(e.series_id);
        if (!serMap.has(k)) serMap.set(k, e);
      }
    }
    return { byStreamId: sMap, bySeriesId: serMap };
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

  const clearHistory = useCallback(
    async (contentType: "movie" | "series") => {
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
      clearHistory,
    }),
    [entries, byStreamId, bySeriesId, isLoading, refetch, upsertLocal, getByStreamId, getBySeriesId, clearHistory],
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
