import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { xtreamApi, Category, LiveStream, VodStream, Series, EpgListing } from "@/lib/xtream-api";
import { useAuth } from "@/contexts/AuthContext";

export type SyncStatus = "idle" | "waiting" | "loading" | "done" | "error";

export interface SyncProgress {
  live: SyncStatus;
  movies: SyncStatus;
  series: SyncStatus;
  epg: SyncStatus;
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
  epgData: Record<number, EpgListing[]>;
  refresh: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const EPG_BATCH_SIZE = 30;
const EPG_MAX_CHANNELS = 500;

async function fetchEpgBatch(streamIds: number[]): Promise<Record<number, EpgListing[]>> {
  const results: Record<number, EpgListing[]> = {};
  await Promise.all(
    streamIds.map(async (id) => {
      try {
        const data = await xtreamApi.getShortEpg(id, 12);
        results[id] = data;
      } catch {
        results[id] = [];
      }
    })
  );
  return results;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    live: "idle",
    movies: "idle",
    series: "idle",
    epg: "idle",
  });

  const [liveCategories, setLiveCategories] = useState<Category[]>([]);
  const [liveStreams, setLiveStreams] = useState<LiveStream[]>([]);
  const [vodCategories, setVodCategories] = useState<Category[]>([]);
  const [vodStreams, setVodStreams] = useState<VodStream[]>([]);
  const [seriesCategories, setSeriesCategories] = useState<Category[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [epgData, setEpgData] = useState<Record<number, EpgListing[]>>({});

  const syncRunning = useRef(false);

  const sync = useCallback(async () => {
    if (syncRunning.current) return;
    syncRunning.current = true;
    setIsSyncing(true);
    setSyncProgress({ live: "waiting", movies: "waiting", series: "waiting", epg: "waiting" });

    let fetchedStreams: LiveStream[] = [];

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
        fetchedStreams = streams;
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
        setSyncProgress((p) => ({ ...p, series: "done" }));
      } catch {
        setSyncProgress((p) => ({ ...p, series: "error" }));
      }

      // ── EPG (TV Guide) ───────────────────────────────────────────────────
      setSyncProgress((p) => ({ ...p, epg: "loading" }));
      try {
        const toFetch = fetchedStreams.slice(0, EPG_MAX_CHANNELS);
        const allEpg: Record<number, EpgListing[]> = {};

        for (let i = 0; i < toFetch.length; i += EPG_BATCH_SIZE) {
          const batch = toFetch.slice(i, i + EPG_BATCH_SIZE).map((s) => s.stream_id);
          const batchResult = await fetchEpgBatch(batch);
          Object.assign(allEpg, batchResult);
        }

        setEpgData(allEpg);
        setSyncProgress((p) => ({ ...p, epg: "done" }));
      } catch {
        setSyncProgress((p) => ({ ...p, epg: "error" }));
      }

      setHasData(true);
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
      setSyncProgress({ live: "idle", movies: "idle", series: "idle", epg: "idle" });
      setLiveCategories([]);
      setLiveStreams([]);
      setVodCategories([]);
      setVodStreams([]);
      setSeriesCategories([]);
      setSeriesList([]);
      setEpgData({});
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
        epgData,
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
