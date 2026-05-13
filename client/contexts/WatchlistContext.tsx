import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWatchHistory } from "@/contexts/WatchHistoryContext";
import { getApiUrl } from "@/lib/query-client";

export type WatchlistType = "movie" | "series";
export type WatchlistStatus = "watched" | "unwatched";

export interface WatchlistContentData {
  stream_id?: number | string | null;
  series_id?: number | string | null;
  name?: string;
  poster?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string | null;
  release_date?: string | null;
  first_air_date?: string | null;
  vote_average?: number;
  source?: "app" | "tmdb-page" | string;
  [key: string]: any;
}

export interface WatchlistItem {
  id: string;
  user_username: string;
  content_id: string;
  content_type: WatchlistType;
  content_data: WatchlistContentData | null;
  status: WatchlistStatus;
  created_at: string;
}

interface AddParams {
  contentId: string | number;
  contentType: WatchlistType;
  contentData: WatchlistContentData;
}

interface WatchlistContextType {
  items: WatchlistItem[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  getByType: (type: WatchlistType) => WatchlistItem[];
  isInWatchlist: (contentId: string | number, type: WatchlistType) => boolean;
  /** Returns the matching watchlist row for the given xtream stream/series id, if any. */
  findByStreamId: (streamId: string | number, type: WatchlistType) => WatchlistItem | undefined;
  add: (params: AddParams) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setStatus: (id: string, status: WatchlistStatus) => Promise<void>;
  /** Toggle add/remove keyed by xtream stream id (used by MovieInfo/SeriesDetail). */
  toggleByStream: (params: AddParams) => Promise<void>;
  /** Exposed so other screens can match watchlist rows by stream id / name. */
  resolveStreamId: (data: WatchlistContentData | null | undefined, type: WatchlistType) => string | null;
  resolveName: (data: WatchlistContentData | null | undefined) => string | null;
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined);

function getXtreamUsername(userInfo: any): string | null {
  // xtreamApi.getAccountInfo returns { user_info: { username, ... }, ... }
  const u =
    userInfo?.user_info?.username ??
    userInfo?.username ??
    null;
  return u ? String(u) : null;
}

function streamIdOfContentData(d: WatchlistContentData | null | undefined, type: WatchlistType): string | null {
  if (!d) return null;
  // Rows can be stored in two shapes:
  //   1. Flat (added by this app early on): { stream_id, series_id, name, ... }
  //   2. Rich xtream payload (the canonical format used by the external
  //      admin UI): { info: {...}, movie_data: { stream_id, ... } } for movies
  //      and { info: {...}, episodes: {...} } for series.
  // We accept both so existing rows still match.
  const md: any = (d as any).movie_data ?? null;
  if (type === "series") {
    const v = d.series_id ?? d.stream_id ?? md?.stream_id;
    return v != null ? String(v) : null;
  }
  const v = d.stream_id ?? md?.stream_id;
  return v != null ? String(v) : null;
}

function nameOfContentData(d: WatchlistContentData | null | undefined): string | null {
  if (!d) return null;
  const md: any = (d as any).movie_data ?? null;
  const info: any = (d as any).info ?? null;
  const n = d.name ?? md?.name ?? info?.name ?? info?.o_name ?? null;
  return n ? String(n) : null;
}

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const { userInfo } = useAuth();
  const username = getXtreamUsername(userInfo);
  const { entries: watchEntries, getSeriesProgress } = useWatchHistory();

  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async (user: string) => {
    setIsLoading(true);
    try {
      const url = new URL("/api/watchlist", getApiUrl());
      url.searchParams.set("username", user);
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data?.items) ? data.items : []);
      }
    } catch {
      // silent — non-critical surface
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (username) {
      load(username);
    } else {
      setItems([]);
    }
  }, [username, load]);

  const refresh = useCallback(async () => {
    if (username) await load(username);
  }, [username, load]);

  const getByType = useCallback(
    (type: WatchlistType) => items.filter((i) => i.content_type === type),
    [items],
  );

  const findByStreamId = useCallback(
    (streamId: string | number, type: WatchlistType) => {
      const sid = String(streamId);
      return items.find((i) => i.content_type === type && streamIdOfContentData(i.content_data, type) === sid);
    },
    [items],
  );

  const isInWatchlist = useCallback(
    (contentId: string | number, type: WatchlistType) => {
      const cid = String(contentId);
      return items.some((i) => i.content_type === type && (String(i.content_id) === cid || streamIdOfContentData(i.content_data, type) === cid));
    },
    [items],
  );

  const add = useCallback(
    async ({ contentId, contentType, contentData }: AddParams) => {
      if (!username) return;
      try {
        const url = new URL("/api/watchlist", getApiUrl());
        const res = await fetch(url.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_username: username,
            content_id: String(contentId),
            content_type: contentType,
            content_data: contentData,
            status: "unwatched",
          }),
        });
        if (res.ok) {
          const row: WatchlistItem = await res.json();
          setItems((prev) => {
            const without = prev.filter((p) => p.id !== row.id);
            return [row, ...without];
          });
        }
      } catch {
        // silent
      }
    },
    [username],
  );

  const remove = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      const url = new URL(`/api/watchlist/${id}`, getApiUrl());
      await fetch(url.toString(), { method: "DELETE" });
    } catch {
      // best-effort — re-load on next mount if it failed
    }
  }, []);

  const setStatus = useCallback(async (id: string, status: WatchlistStatus) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    try {
      const url = new URL(`/api/watchlist/${id}`, getApiUrl());
      await fetch(url.toString(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch {
      // silent
    }
  }, []);

  const toggleByStream = useCallback(
    async (params: AddParams) => {
      const sidKey = params.contentData?.series_id ?? params.contentData?.stream_id;
      if (sidKey != null) {
        const existing = findByStreamId(sidKey, params.contentType);
        if (existing) {
          await remove(existing.id);
          return;
        }
      }
      // Also dedup by content_id (matches TMDB-source rows)
      const byId = items.find(
        (i) => i.content_type === params.contentType && String(i.content_id) === String(params.contentId),
      );
      if (byId) {
        await remove(byId.id);
        return;
      }
      await add(params);
    },
    [items, findByStreamId, add, remove],
  );

  // Auto-mark watched: when a watchlist entry has a matching stream_id in
  // freshly-completed watch history, flip its status to "watched". This
  // only lights up for entries that include a stream_id in content_data —
  // pure TMDB rows from the external page have to be marked manually
  // (we don't have a TMDB↔Xtream id map for them).
  const lastSyncedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!username || items.length === 0 || watchEntries.length === 0) return;

    // Movies — "watched" once a single completed entry exists for the stream.
    const completedMovies = new Set<string>();
    for (const e of watchEntries) {
      if (!e.is_completed) continue;
      if (e.content_type === "movie" && e.stream_id != null) {
        completedMovies.add(String(e.stream_id));
      }
    }

    for (const item of items) {
      if (item.status === "watched") continue;
      const sid = streamIdOfContentData(item.content_data, item.content_type);
      if (!sid) continue;
      let matched = false;
      if (item.content_type === "movie") {
        matched = completedMovies.has(sid);
      } else {
        // Series — use the same final-episode rule as the rest of the app
        // (see WatchHistoryContext.getSeriesProgress). Marks watched only
        // when the highest-season → highest-episode entry is completed
        // and no new episodes have been uploaded since.
        matched = getSeriesProgress(sid).isFullyWatched;
      }
      if (!matched) continue;
      const dedupKey = `${item.id}:watched`;
      if (lastSyncedRef.current.has(dedupKey)) continue;
      lastSyncedRef.current.add(dedupKey);
      setStatus(item.id, "watched");
    }
  }, [username, items, watchEntries, getSeriesProgress, setStatus]);

  const value = useMemo<WatchlistContextType>(
    () => ({
      items, isLoading, refresh, getByType, isInWatchlist, findByStreamId,
      add, remove, setStatus, toggleByStream,
      resolveStreamId: streamIdOfContentData,
      resolveName: nameOfContentData,
    }),
    [items, isLoading, refresh, getByType, isInWatchlist, findByStreamId, add, remove, setStatus, toggleByStream],
  );

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error("useWatchlist must be used within WatchlistProvider");
  return ctx;
}
