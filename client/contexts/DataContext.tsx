import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { xtreamApi, Category, LiveStream, VodStream, Series } from "@/lib/xtream-api";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { runRatingsEnricher, StreamRating, EnrichProgress } from "@/lib/ratingsEnricher";

export type SyncStatus = "idle" | "waiting" | "loading" | "done" | "error";

export interface SyncProgress {
  live: SyncStatus;
  movies: SyncStatus;
  series: SyncStatus;
}

interface DataContextType {
  isSyncing: boolean;
  hasData: boolean;
  syncProgress: SyncProgress;
  liveCategories: Category[];
  liveStreams: LiveStream[];
  vodCategories: Category[];
  vodStreams: VodStream[];
  seriesCategories: Category[];
  seriesList: Series[];
  // Pre-computed during sync so the "Recently Added" view opens instantly
  // instead of sorting tens of thousands of items on the JS thread every
  // time the screen mounts.
  recentMovies: VodStream[];
  recentSeries: Series[];
  refresh: () => Promise<void>;
  streamRatings: Map<number, StreamRating>;
  enrichProgress: EnrichProgress;
}

const RECENTLY_ADDED_LIMIT = 30;

function tsOf(s: any, kind: "movies" | "series"): number {
  const raw = (kind === "series" ? s.last_modified : s.added) ?? s.added ?? s.last_modified;
  if (!raw) return 0;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  if (!isNaN(n) && n > 0) return n;
  const d = Date.parse(String(raw));
  return isNaN(d) ? 0 : Math.floor(d / 1000);
}

function computeRecent<T>(pool: T[], kind: "movies" | "series"): T[] {
  if (pool.length === 0) return [];
  // Single-pass top-K via insertion into a small sorted array. Avoids
  // sorting the entire pool (which can be 50k+ items) — keeps the work
  // bounded to O(n * K) with K=30, much cheaper than O(n log n).
  const top: { item: T; ts: number }[] = [];
  for (const item of pool) {
    const t = tsOf(item, kind);
    if (top.length < RECENTLY_ADDED_LIMIT) {
      top.push({ item, ts: t });
      if (top.length === RECENTLY_ADDED_LIMIT) {
        top.sort((a, b) => b.ts - a.ts);
      }
      continue;
    }
    if (t <= top[top.length - 1].ts) continue;
    // insert
    let i = top.length - 1;
    top[i] = { item, ts: t };
    while (i > 0 && top[i].ts > top[i - 1].ts) {
      const tmp = top[i - 1];
      top[i - 1] = top[i];
      top[i] = tmp;
      i--;
    }
  }
  if (top.length < RECENTLY_ADDED_LIMIT) {
    top.sort((a, b) => b.ts - a.ts);
  }
  return top.map((x) => x.item);
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    live: "idle",
    movies: "idle",
    series: "idle",
  });

  const [liveCategories, setLiveCategories] = useState<Category[]>([]);
  const [liveStreams, setLiveStreams] = useState<LiveStream[]>([]);
  const [vodCategories, setVodCategories] = useState<Category[]>([]);
  const [vodStreams, setVodStreams] = useState<VodStream[]>([]);
  const [seriesCategories, setSeriesCategories] = useState<Category[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [recentMovies, setRecentMovies] = useState<VodStream[]>([]);
  const [recentSeries, setRecentSeries] = useState<Series[]>([]);

  const syncRunning = useRef(false);
  const [streamRatings, setStreamRatings] = useState<Map<number, StreamRating>>(new Map());
  const [enrichProgress, setEnrichProgress] = useState<EnrichProgress>({ total: 0, done: 0, running: false });
  const enricherStarted = useRef(false);
  const enricherAbort = useRef<AbortController | null>(null);

  const sync = useCallback(async () => {
    if (syncRunning.current) return;
    syncRunning.current = true;
    setIsSyncing(true);
    setSyncProgress({ live: "waiting", movies: "waiting", series: "waiting" });

    try {
      // ── Live TV ──────────────────────────────────────────────────────────
      setSyncProgress((p) => ({ ...p, live: "loading" }));
      try {
        const [cats, streams] = await Promise.all([
          xtreamApi.getLiveCategories(),
          xtreamApi.getLiveStreams(),
        ]);
        setLiveCategories(cats);
        setLiveStreams(streams);
        setSyncProgress((p) => ({ ...p, live: "done" }));
      } catch {
        setSyncProgress((p) => ({ ...p, live: "error" }));
      }

      // ── Movies ───────────────────────────────────────────────────────────
      setSyncProgress((p) => ({ ...p, movies: "loading" }));
      try {
        const [cats, streams] = await Promise.all([
          xtreamApi.getVodCategories(),
          xtreamApi.getVodStreams(),
        ]);
        setVodCategories(cats);
        setVodStreams(streams);
        setRecentMovies(computeRecent(streams, "movies"));
        setSyncProgress((p) => ({ ...p, movies: "done" }));
      } catch {
        setSyncProgress((p) => ({ ...p, movies: "error" }));
      }

      // ── Series ───────────────────────────────────────────────────────────
      setSyncProgress((p) => ({ ...p, series: "loading" }));
      try {
        const [cats, list] = await Promise.all([
          xtreamApi.getSeriesCategories(),
          xtreamApi.getSeries(),
        ]);
        setSeriesCategories(cats);
        setSeriesList(list);
        setRecentSeries(computeRecent(list, "series"));
        setSyncProgress((p) => ({ ...p, series: "done" }));
      } catch {
        setSyncProgress((p) => ({ ...p, series: "error" }));
      }

      setHasData(true);

      // Reload stream ratings so badges reflect whatever has been enriched
      // from previous sessions.  Fire-and-forget; app stays usable either way.
      Promise.all([
        fetch(new URL("/api/stream-ratings?content_type=movie", getApiUrl()).toString())
          .then((r) => (r.ok ? r.json() : [])),
        fetch(new URL("/api/stream-ratings?content_type=tv", getApiUrl()).toString())
          .then((r) => (r.ok ? r.json() : [])),
      ])
        .then(([movies, tv]: [any[], any[]]) => {
          const map = new Map<number, StreamRating>();
          for (const r of [...movies, ...tv]) {
            if (r.stream_id && r.certification)
              map.set(r.stream_id, { certification: r.certification, age_int: r.age_int });
          }
          setStreamRatings(map);
        })
        .catch(() => {});
    } finally {
      setIsSyncing(false);
      syncRunning.current = false;
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && !hasData && !syncRunning.current) {
      sync();
    }
    if (!isAuthenticated) {
      setHasData(false);
      setSyncProgress({ live: "idle", movies: "idle", series: "idle" });
      setLiveCategories([]);
      setLiveStreams([]);
      setVodCategories([]);
      setVodStreams([]);
      setSeriesCategories([]);
      setSeriesList([]);
      setRecentMovies([]);
      setRecentSeries([]);
    }
  }, [isAuthenticated]);

  // Start background enricher once after the first successful sync.
  // The enricher calls getVodInfo in batches to get tmdb_id + mpaa_rating for
  // every movie, then pushes to /api/stream-ratings/batch.  Series use embedded
  // fields + server-side TMDB name search.  AsyncStorage watermarks let it
  // resume across app restarts.  enricherStarted prevents re-running on refresh.
  useEffect(() => {
    if (!hasData || vodStreams.length === 0) return;
    if (enricherStarted.current) return;
    enricherStarted.current = true;
    const ctrl = new AbortController();
    enricherAbort.current = ctrl;
    runRatingsEnricher(
      vodStreams,
      seriesList,
      getApiUrl(),
      (progress) => setEnrichProgress(progress),
      (newRatings) =>
        setStreamRatings((prev) => {
          const next = new Map(prev);
          for (const [k, v] of newRatings) next.set(k, v);
          return next;
        }),
      ctrl.signal
    ).catch(() => {});
    return () => {
      ctrl.abort();
    };
  }, [hasData, vodStreams.length]);

  return (
    <DataContext.Provider
      value={{
        isSyncing,
        hasData,
        syncProgress,
        liveCategories,
        liveStreams,
        vodCategories,
        vodStreams,
        seriesCategories,
        seriesList,
        recentMovies,
        recentSeries,
        refresh: sync,
        streamRatings,
        enrichProgress,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
