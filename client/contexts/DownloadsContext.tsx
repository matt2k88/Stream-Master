import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import { useProfile } from "@/contexts/ProfileContext";
import { xtreamApi } from "@/lib/xtream-api";

export type DownloadKind = "movie" | "episode";
export type DownloadStatus =
  | "queued"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type DownloadItem = {
  id: string;
  profileId: string;
  kind: DownloadKind;
  streamId: string;
  extension: string;
  title: string;
  thumbnail?: string;
  seriesId?: string;
  seriesName?: string;
  seasonNum?: number;
  episodeNum?: number;
  status: DownloadStatus;
  localUri?: string;
  exportedUri?: string;
  bytesDownloaded: number;
  bytesTotal?: number;
  resumeData?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

export type DownloadRequest = Omit<
  DownloadItem,
  | "id"
  | "profileId"
  | "status"
  | "localUri"
  | "exportedUri"
  | "bytesDownloaded"
  | "bytesTotal"
  | "resumeData"
  | "error"
  | "createdAt"
  | "updatedAt"
>;

type StorageSummary = {
  freeBytes: number | null;
  totalBytes: number | null;
  downloadedBytes: number;
  selectedFolderUri: string | null;
  isPrivateFallback: boolean;
};

type DownloadsContextValue = {
  items: DownloadItem[];
  isReady: boolean;
  storage: StorageSummary;
  enqueue: (request: DownloadRequest) => Promise<DownloadItem | null>;
  enqueueMany: (requests: DownloadRequest[]) => Promise<void>;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  selectFolder: () => Promise<boolean>;
  clearFolder: () => Promise<void>;
  refreshStorage: () => Promise<void>;
  getByStreamId: (streamId: string) => DownloadItem | undefined;
};

const DownloadsContext = createContext<DownloadsContextValue | undefined>(undefined);
const STORAGE_PREFIX = "ultracast.offline.downloads.v1.";
const FOLDER_STORAGE_KEY = "ultracast.offline.folder.v1";
const activeTasks = new Map<string, FileSystem.DownloadResumable>();

function storageKey(profileId: string) {
  return `${STORAGE_PREFIX}${profileId}`;
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 96);
}

function stableId(kind: DownloadKind, streamId: string) {
  return `${kind}:${streamId}`;
}

function liveTaskKey(item: Pick<DownloadItem, "profileId" | "id">) {
  return `${item.profileId}|${item.id}`;
}

function mediaMimeType(extension: string) {
  const ext = extension.toLowerCase().replace(/^\./, "");
  if (ext === "mkv") return "video/x-matroska";
  if (ext === "avi") return "video/x-msvideo";
  if (ext === "ts") return "video/mp2t";
  if (ext === "webm") return "video/webm";
  return "video/mp4";
}

function buildSourceUrl(item: DownloadItem) {
  if (item.kind === "movie") {
    return xtreamApi.getVodStreamUrl(Number(item.streamId), item.extension);
  }
  return xtreamApi.getSeriesStreamUrl(item.streamId, item.extension);
}

function privateDirectory(profileId: string) {
  const root = FileSystem.documentDirectory;
  if (!root) return null;
  return `${root}offline/${safeSegment(profileId)}/`;
}

function privateUris(item: Pick<DownloadItem, "profileId" | "kind" | "streamId" | "extension">) {
  const directory = privateDirectory(item.profileId);
  if (!directory) return null;
  const fileName = `${safeSegment(item.kind)}-${safeSegment(item.streamId)}.${safeSegment(item.extension)}`;
  return { directory, finalUri: `${directory}${fileName}`, partUri: `${directory}${fileName}.part` };
}

function normaliseItems(value: unknown, profileId: string): DownloadItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Partial<DownloadItem> => !!item && typeof item === "object")
    .filter((item) => item.profileId === profileId && (item.kind === "movie" || item.kind === "episode"))
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : stableId(item.kind!, String(item.streamId ?? "")),
      profileId,
      kind: item.kind!,
      streamId: String(item.streamId ?? ""),
      extension: typeof item.extension === "string" && item.extension ? item.extension : "mp4",
      title: typeof item.title === "string" && item.title ? item.title : "Untitled download",
      thumbnail: typeof item.thumbnail === "string" ? item.thumbnail : undefined,
      seriesId: typeof item.seriesId === "string" ? item.seriesId : undefined,
      seriesName: typeof item.seriesName === "string" ? item.seriesName : undefined,
      seasonNum: typeof item.seasonNum === "number" ? item.seasonNum : undefined,
      episodeNum: typeof item.episodeNum === "number" ? item.episodeNum : undefined,
      status:
        item.status === "downloading" ||
        item.status === "queued" ||
        item.status === "paused" ||
        item.status === "completed" ||
        item.status === "failed" ||
        item.status === "cancelled"
          ? item.status
          : "failed",
      localUri: typeof item.localUri === "string" ? item.localUri : undefined,
      exportedUri: typeof item.exportedUri === "string" ? item.exportedUri : undefined,
      bytesDownloaded: typeof item.bytesDownloaded === "number" ? item.bytesDownloaded : 0,
      bytesTotal: typeof item.bytesTotal === "number" ? item.bytesTotal : undefined,
      resumeData: typeof item.resumeData === "string" ? item.resumeData : undefined,
      error: typeof item.error === "string" ? item.error : undefined,
      createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now(),
      updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : Date.now(),
    }));
}

export function DownloadsProvider({ children }: { children: ReactNode }) {
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id ?? "guest";
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [selectedFolderUri, setSelectedFolderUri] = useState<string | null>(null);
  const [freeBytes, setFreeBytes] = useState<number | null>(null);
  const [totalBytes, setTotalBytes] = useState<number | null>(null);
  const itemsRef = useRef<DownloadItem[]>([]);
  const profileRef = useRef(profileId);
  const intentionallyStoppedRef = useRef(new Set<string>());
  const runningIdsRef = useRef(new Set<string>());

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const persist = useCallback(async (next: DownloadItem[], forProfile = profileRef.current) => {
    try {
      await AsyncStorage.setItem(storageKey(forProfile), JSON.stringify(next));
    } catch {
      // The in-memory queue still works this session. A failed persistence must
      // never make a completed local file disappear from the visible list.
    }
  }, []);

  const replaceItems = useCallback(
    (update: (current: DownloadItem[]) => DownloadItem[]) => {
      setItems((current) => {
        const next = update(current);
        itemsRef.current = next;
        void persist(next);
        return next;
      });
    },
    [persist],
  );

  const refreshStorage = useCallback(async () => {
    if (Platform.OS === "web") {
      setFreeBytes(null);
      setTotalBytes(null);
      return;
    }
    try {
      const [free, total] = await Promise.all([
        FileSystem.getFreeDiskStorageAsync(),
        FileSystem.getTotalDiskCapacityAsync(),
      ]);
      setFreeBytes(typeof free === "number" ? free : null);
      setTotalBytes(typeof total === "number" ? total : null);
    } catch {
      setFreeBytes(null);
      setTotalBytes(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    profileRef.current = profileId;
    setIsReady(false);
    Promise.all([
      AsyncStorage.getItem(storageKey(profileId)),
      AsyncStorage.getItem(FOLDER_STORAGE_KEY),
    ])
      .then(async ([rawItems, rawFolder]) => {
        const loaded = normaliseItems(rawItems ? JSON.parse(rawItems) : [], profileId);
        const reconciled = await Promise.all(
          loaded.map(async (item) => {
            if (item.status !== "completed" || !item.localUri) {
              return item.status === "downloading" ? { ...item, status: "paused" as const } : item;
            }
            try {
              const info = await FileSystem.getInfoAsync(item.localUri);
              if (info.exists) {
                return { ...item, bytesDownloaded: info.size ?? item.bytesDownloaded, bytesTotal: info.size ?? item.bytesTotal };
              }
            } catch {}
            return { ...item, status: "failed" as const, error: "The saved file is no longer on this device.", localUri: undefined };
          }),
        );
        if (!active) return;
        setItems(reconciled);
        itemsRef.current = reconciled;
        setSelectedFolderUri(rawFolder || null);
        await persist(reconciled, profileId);
      })
      .catch(() => {
        if (active) setItems([]);
      })
      .finally(() => {
        if (active) {
          setIsReady(true);
          void refreshStorage();
        }
      });
    return () => {
      active = false;
      for (const [key, task] of activeTasks) {
        if (!key.startsWith(`${profileId}|`)) continue;
        intentionallyStoppedRef.current.add(key);
        void task.pauseAsync().catch(() => {});
        activeTasks.delete(key);
        runningIdsRef.current.delete(key);
      }
    };
  }, [profileId, persist, refreshStorage]);

  const patch = useCallback(
    (id: string, fields: Partial<DownloadItem>) => {
      replaceItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, ...fields, updatedAt: Date.now() } : item,
        ),
      );
    },
    [replaceItems],
  );

  const exportCopy = useCallback(
    async (item: DownloadItem, localUri: string) => {
      if (Platform.OS !== "android" || !selectedFolderUri) return undefined;
      const displayName = safeSegment(item.title || item.streamId).replace(/\.[^.]+$/, "") || item.streamId;
      const exportName = `${displayName}.${safeSegment(item.extension).replace(/^\./, "")}`;
      try {
        const destination = await FileSystem.StorageAccessFramework.createFileAsync(
          selectedFolderUri,
          exportName,
          mediaMimeType(item.extension),
        );
        await FileSystem.copyAsync({ from: localUri, to: destination });
        return destination;
      } catch {
        // The private copy remains playable. The user can choose another folder
        // from Downloads without having to fetch the media again.
        return undefined;
      }
    },
    [selectedFolderUri],
  );

  const run = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((candidate) => candidate.id === id);
      if (!item || item.profileId !== profileRef.current || Platform.OS === "web") {
        if (item && Platform.OS === "web") patch(id, { status: "failed", error: "Offline downloads are available in the Android and iOS app." });
        return;
      }
      const taskKey = liveTaskKey(item);
      if (runningIdsRef.current.size > 0 && !runningIdsRef.current.has(taskKey)) return;
      const locations = privateUris(item);
      if (!locations) {
        patch(id, { status: "failed", error: "This device does not provide persistent app storage." });
        return;
      }

      try {
        runningIdsRef.current.add(taskKey);
        intentionallyStoppedRef.current.delete(taskKey);
        await FileSystem.makeDirectoryAsync(locations.directory, { intermediates: true });
        const sourceUrl = buildSourceUrl(item);
        const task = FileSystem.createDownloadResumable(
          sourceUrl,
          locations.partUri,
          {},
          (progress) => {
            if (profileRef.current !== item.profileId) return;
            patch(id, {
              status: "downloading",
              bytesDownloaded: progress.totalBytesWritten,
              bytesTotal:
                progress.totalBytesExpectedToWrite > 0
                  ? progress.totalBytesExpectedToWrite
                  : undefined,
            });
          },
          item.resumeData,
        );
        activeTasks.set(taskKey, task);
        patch(id, { status: "downloading", error: undefined });
        const result = item.resumeData ? await task.resumeAsync() : await task.downloadAsync();
        activeTasks.delete(taskKey);
        if (!result?.uri) throw new Error("The download did not return a saved file.");

        const info = await FileSystem.getInfoAsync(locations.partUri);
        if (!info.exists || !info.size || info.size < 1) {
          throw new Error("The downloaded file is empty.");
        }
        try {
          await FileSystem.deleteAsync(locations.finalUri, { idempotent: true });
          await FileSystem.moveAsync({ from: locations.partUri, to: locations.finalUri });
        } catch {
          // A provider can leave the result at the requested URI on some
          // devices. It remains a valid private playback file either way.
        }
        const finalInfo = await FileSystem.getInfoAsync(locations.finalUri);
        const localUri = finalInfo.exists ? locations.finalUri : locations.partUri;
        const finalSize = finalInfo.exists ? finalInfo.size : info.size;
        const completed: DownloadItem = {
          ...item,
          status: "completed",
          localUri,
          resumeData: undefined,
          bytesDownloaded: finalSize ?? item.bytesDownloaded,
          bytesTotal: finalSize ?? item.bytesTotal,
          error: undefined,
          updatedAt: Date.now(),
        };
        const exportedUri = await exportCopy(completed, localUri);
        if (profileRef.current === item.profileId) patch(id, { ...completed, exportedUri });
        void refreshStorage();
        runningIdsRef.current.delete(taskKey);
        const next = itemsRef.current.find((candidate) => candidate.profileId === item.profileId && candidate.status === "queued");
        if (next) setTimeout(() => void run(next.id), 0);
      } catch (error) {
        activeTasks.delete(taskKey);
        runningIdsRef.current.delete(taskKey);
        if (intentionallyStoppedRef.current.delete(taskKey)) {
          const next = itemsRef.current.find((candidate) => candidate.profileId === item.profileId && candidate.status === "queued");
          if (next) setTimeout(() => void run(next.id), 0);
          return;
        }
        const message = error instanceof Error ? error.message : "The download could not be completed.";
        if (profileRef.current === item.profileId) patch(id, { status: "failed", error: message });
        const next = itemsRef.current.find((candidate) => candidate.profileId === item.profileId && candidate.status === "queued");
        if (next) setTimeout(() => void run(next.id), 0);
      }
    },
    [exportCopy, patch, refreshStorage],
  );

  const enqueue = useCallback(
    async (request: DownloadRequest) => {
      const id = stableId(request.kind, request.streamId);
      const existing = itemsRef.current.find((item) => item.id === id);
      if (existing) {
        if (existing.status === "paused" || existing.status === "failed" || existing.status === "cancelled") {
          void run(id);
        }
        return existing;
      }
      const now = Date.now();
      const item: DownloadItem = {
        ...request,
        id,
        profileId: profileRef.current,
        extension: request.extension.replace(/^\./, "") || "mp4",
        status: "queued",
        bytesDownloaded: 0,
        createdAt: now,
        updatedAt: now,
      };
      replaceItems((current) => [...current, item]);
      // Wait for React to commit the item so `run` can read the shared ref.
      setTimeout(() => void run(id), 0);
      return item;
    },
    [replaceItems, run],
  );

  const enqueueMany = useCallback(
    async (requests: DownloadRequest[]) => {
      for (const request of requests) {
        await enqueue(request);
      }
    },
    [enqueue],
  );

  const pause = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((candidate) => candidate.id === id);
      if (!item) return;
      const taskKey = liveTaskKey(item);
      const task = activeTasks.get(taskKey);
      if (!task) return;
      try {
        intentionallyStoppedRef.current.add(taskKey);
        const paused = await task.pauseAsync();
        activeTasks.delete(taskKey);
        patch(id, {
          status: "paused",
          resumeData: paused.resumeData,
          bytesDownloaded: itemsRef.current.find((item) => item.id === id)?.bytesDownloaded ?? 0,
        });
        runningIdsRef.current.delete(taskKey);
        const next = itemsRef.current.find((candidate) => candidate.profileId === item.profileId && candidate.status === "queued");
        if (next) setTimeout(() => void run(next.id), 0);
      } catch {
        intentionallyStoppedRef.current.delete(taskKey);
        runningIdsRef.current.delete(taskKey);
        patch(id, { status: "failed", error: "Could not pause this download." });
      }
    },
    [patch],
  );

  const resume = useCallback(
    async (id: string) => {
      void run(id);
    },
    [run],
  );

  const retry = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((candidate) => candidate.id === id);
      if (!item) return;
      const locations = privateUris(item);
      if (locations) {
        await FileSystem.deleteAsync(locations.partUri, { idempotent: true }).catch(() => {});
      }
      patch(id, { status: "queued", error: undefined, resumeData: undefined, bytesDownloaded: 0, bytesTotal: undefined });
      setTimeout(() => void run(id), 0);
    },
    [patch, run],
  );

  const cancel = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((candidate) => candidate.id === id);
      const taskKey = item ? liveTaskKey(item) : null;
      const task = taskKey ? activeTasks.get(taskKey) : undefined;
      if (task) {
        intentionallyStoppedRef.current.add(taskKey!);
        try {
          await task.pauseAsync();
        } catch {}
        activeTasks.delete(taskKey!);
        runningIdsRef.current.delete(taskKey!);
      }
      const currentItem = itemsRef.current.find((candidate) => candidate.id === id);
      const locations = currentItem ? privateUris(currentItem) : null;
      if (locations) await FileSystem.deleteAsync(locations.partUri, { idempotent: true }).catch(() => {});
      patch(id, { status: "cancelled", resumeData: undefined, error: undefined });
    },
    [patch],
  );

  const remove = useCallback(
    async (id: string) => {
      await cancel(id);
      const item = itemsRef.current.find((candidate) => candidate.id === id);
      if (item?.localUri) await FileSystem.deleteAsync(item.localUri, { idempotent: true }).catch(() => {});
      if (item?.exportedUri && Platform.OS === "android") {
        await FileSystem.StorageAccessFramework.deleteAsync(item.exportedUri).catch(() => {});
      }
      replaceItems((current) => current.filter((candidate) => candidate.id !== id));
      void refreshStorage();
    },
    [cancel, refreshStorage, replaceItems],
  );

  const selectFolder = useCallback(async () => {
    if (Platform.OS !== "android") return false;
    try {
      const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(selectedFolderUri);
      if (!result.granted || !result.directoryUri) return false;
      await AsyncStorage.setItem(FOLDER_STORAGE_KEY, result.directoryUri);
      setSelectedFolderUri(result.directoryUri);
      return true;
    } catch {
      return false;
    }
  }, [selectedFolderUri]);

  const clearFolder = useCallback(async () => {
    await AsyncStorage.removeItem(FOLDER_STORAGE_KEY);
    setSelectedFolderUri(null);
  }, []);

  const downloadedBytes = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + (item.status === "completed" ? item.bytesDownloaded : 0),
        0,
      ),
    [items],
  );

  const value = useMemo<DownloadsContextValue>(
    () => ({
      items,
      isReady,
      storage: {
        freeBytes,
        totalBytes,
        downloadedBytes,
        selectedFolderUri,
        isPrivateFallback: !selectedFolderUri,
      },
      enqueue,
      enqueueMany,
      pause,
      resume,
      retry,
      cancel,
      remove,
      selectFolder,
      clearFolder,
      refreshStorage,
      getByStreamId: (streamId) => items.find((item) => item.streamId === String(streamId)),
    }),
    [
      items,
      isReady,
      freeBytes,
      totalBytes,
      downloadedBytes,
      selectedFolderUri,
      enqueue,
      enqueueMany,
      pause,
      resume,
      retry,
      cancel,
      remove,
      selectFolder,
      clearFolder,
      refreshStorage,
    ],
  );

  return <DownloadsContext.Provider value={value}>{children}</DownloadsContext.Provider>;
}

export function useDownloads() {
  const context = useContext(DownloadsContext);
  if (!context) throw new Error("useDownloads must be used within DownloadsProvider");
  return context;
}