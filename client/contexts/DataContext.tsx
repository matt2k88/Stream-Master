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
  refresh: () => Promise<void>;
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

  const syncRunning = useRef(false);

  const sync = useCallback(async () => {
    if (syncRunning.current) return;
    syncRunning.current = true;
    setIsSyncing(true);
    setSyncProgress({ live: "waiting", movies: "waiting", series: "waiting" });

    try {
      // Live TV
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

      // Movies
      setSyncProgress((p) => ({ ...p, movies: "loading" }));
      try {
        const [cats, streams] = await Promise.all([
          xtreamApi.getVodCategories(),
          xtreamApi.getVodStreams(),
        ]);
        setVodCategories(cats);
        setVodStreams(streams);
        setSyncProgress((p) => ({ ...p, movies: "done" }));
      } catch {
        setSyncProgress((p) => ({ ...p, movies: "error" }));
      }

      // Series
      setSyncProgress((p) => ({ ...p, series: "loading" }));
      try {
        const [cats, list] = await Promise.all([
          xtreamApi.getSeriesCategories(),
          xtreamApi.getSeries(),
        ]);
        setSeriesCategories(cats);
        setSeriesList(list);
        setSyncProgress((p) => ({ ...p, series: "done" }));
      } catch {
        setSyncProgress((p) => ({ ...p, series: "error" }));
      }

      setHasData(true);
    } finally {
      setIsSyncing(false);
      syncRunning.current = false;
    }
  }, []);

  // Auto-sync when authenticated and no data yet
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
    }
  }, [isAuthenticated]);

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
        refresh: sync,
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
