import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import SideMenuButton from "@/components/SideMenuButton";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, BorderRadius, Spacing } from "@/constants/theme";
import { useDownloads, type DownloadItem } from "@/contexts/DownloadsContext";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

function bytes(value?: number | null) {
  if (value == null || value < 0) return "—";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let unit = -1;
  let size = value;
  do {
    size /= 1024;
    unit += 1;
  } while (size >= 1024 && unit < units.length - 1);
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function statusLabel(item: DownloadItem) {
  if (item.status === "completed") return item.exportedUri ? "SAVED TO DEVICE" : "AVAILABLE OFFLINE";
  if (item.status === "downloading") return "DOWNLOADING";
  if (item.status === "paused") return "PAUSED";
  if (item.status === "queued") return "QUEUED";
  if (item.status === "cancelled") return "CANCELLED";
  return "NEEDS ATTENTION";
}

function ActionButton({
  icon,
  label,
  onPress,
  danger = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const [active, setActive] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      onPressIn={() => setActive(true)}
      onPressOut={() => setActive(false)}
      onHoverIn={() => setActive(true)}
      onHoverOut={() => setActive(false)}
      style={[styles.actionButton, active && styles.actionButtonActive, danger && styles.actionDanger]}
    >
      <Feather name={icon} size={14} color={danger ? Colors.dark.error : active ? "#000" : Colors.dark.text} />
      <ThemedText style={[styles.actionText, active && { color: "#000" }, danger && { color: Colors.dark.error }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function HeaderAction({ onPress }: { onPress: () => void }) {
  const [active, setActive] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      onPressIn={() => setActive(true)}
      onPressOut={() => setActive(false)}
      onHoverIn={() => setActive(true)}
      onHoverOut={() => setActive(false)}
      accessibilityRole="button"
      accessibilityLabel="Refresh storage"
      style={[styles.refreshButton, active && styles.refreshButtonActive]}
    >
      {active ? <View style={styles.refreshOverlay} /> : null}
      <Feather name="refresh-cw" size={18} color={active ? "#000" : Colors.dark.textSecondary} />
    </Pressable>
  );
}

export default function DownloadsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const {
    items,
    isReady,
    storage,
    pause,
    resume,
    retry,
    cancel,
    remove,
    selectFolder,
    refreshStorage,
  } = useDownloads();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const [folderLoading, setFolderLoading] = useState(false);

  const completed = useMemo(() => items.filter((item) => item.status === "completed"), [items]);
  const completedMovies = useMemo(() => completed.filter((item) => item.kind === "movie"), [completed]);
  const completedSeries = useMemo(() => {
    const groups = new Map<string, Map<number, DownloadItem[]>>();
    for (const item of completed.filter((candidate) => candidate.kind === "episode")) {
      const seriesName = item.seriesName || "Series";
      const season = item.seasonNum ?? 0;
      const seasons = groups.get(seriesName) ?? new Map<number, DownloadItem[]>();
      seasons.set(season, [...(seasons.get(season) ?? []), item]);
      groups.set(seriesName, seasons);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([seriesName, seasons]) => ({
        seriesName,
        seasons: Array.from(seasons.entries())
          .sort(([a], [b]) => a - b)
          .map(([season, episodes]) => ({
            season,
            episodes: [...episodes].sort((a, b) => (a.episodeNum ?? 0) - (b.episodeNum ?? 0)),
          })),
      }));
  }, [completed]);
  const active = useMemo(
    () => items.filter((item) => item.status === "downloading" || item.status === "queued" || item.status === "paused"),
    [items],
  );

  const chooseFolder = useCallback(async () => {
    setFolderLoading(true);
    const selected = await selectFolder();
    setFolderLoading(false);
    if (!selected) {
      Alert.alert(
        "Download folder required",
        "Choose a device folder before starting a download. Ultra Cast will save completed downloads there.",
      );
    }
  }, [selectFolder]);

  const playOffline = useCallback(
    (item: DownloadItem) => {
      if (!item.localUri) return;
      navigation.navigate("Player", {
        streamUrl: item.localUri,
        title: item.title,
        type: item.kind === "episode" ? "series" : "vod",
        thumbnail: item.thumbnail,
        streamId: item.streamId,
        seriesId: item.seriesId,
        seriesName: item.seriesName,
        seasonNum: item.seasonNum,
        episodeNum: item.episodeNum,
        offline: true,
      });
    },
    [navigation],
  );

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <SideMenuButton />
        <View style={styles.headerTitleWrap}>
          <ThemedText style={styles.headerEyebrow}>OFFLINE LIBRARY</ThemedText>
          <ThemedText style={styles.headerTitle}>Downloads</ThemedText>
        </View>
        <HeaderAction onPress={() => void refreshStorage()} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.summaryRow, !landscape && styles.summaryColumn]}>
          <View style={styles.storageCard}>
            <View style={styles.storageHeader}>
              <View style={styles.storageIcon}>
                <Feather name="hard-drive" size={20} color={Colors.dark.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.storageTitle}>Device storage</ThemedText>
                <ThemedText style={styles.storageMeta}>
                  {storage.freeBytes == null
                    ? "Storage estimate unavailable"
                    : `${bytes(storage.freeBytes)} free of ${bytes(storage.totalBytes)}`}
                </ThemedText>
              </View>
            </View>
            <View style={styles.storageTrack}>
              <View
                style={[
                  styles.storageFill,
                  {
                    width:
                      storage.totalBytes && storage.totalBytes > 0
                        ? `${Math.min(100, (storage.downloadedBytes / storage.totalBytes) * 100)}%`
                        : "0%",
                  },
                ]}
              />
            </View>
            <ThemedText style={styles.downloadedAmount}>
              {bytes(storage.downloadedBytes)} used by Ultra Cast downloads
            </ThemedText>
          </View>

          <View style={styles.locationCard}>
            <View style={styles.locationTop}>
               <Feather name={storage.isPrivateFallback ? "folder-plus" : "folder"} size={18} color={Colors.dark.accent} />
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.locationTitle}>
                   {storage.isPrivateFallback ? "Choose a download folder" : "Selected download folder"}
                </ThemedText>
                <ThemedText style={styles.locationMeta} numberOfLines={2}>
                  {storage.isPrivateFallback
                     ? "A folder is required before downloads can start. Your completed files will be saved there."
                     : "All completed downloads are saved in this folder and ready for offline playback."}
                </ThemedText>
              </View>
            </View>
            <View style={styles.locationActions}>
              <ActionButton
                icon="folder-plus"
                label={folderLoading ? "Opening…" : storage.isPrivateFallback ? "CHOOSE FOLDER" : "CHANGE FOLDER"}
                onPress={() => void chooseFolder()}
              />
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>IN PROGRESS</ThemedText>
          <ThemedText style={styles.sectionCount}>{active.length}</ThemedText>
        </View>
        {active.length === 0 ? (
          <View style={styles.emptyCompact}>
            <Feather name="download-cloud" size={22} color={Colors.dark.border} />
            <ThemedText style={styles.emptyCompactText}>Nothing is downloading right now.</ThemedText>
          </View>
        ) : (
          active.map((item) => (
            <DownloadRow
              key={item.id}
              item={item}
              onPlay={() => playOffline(item)}
              onPause={() => void pause(item.id)}
              onResume={() => void resume(item.id)}
              onRetry={() => void retry(item.id)}
              onCancel={() => void cancel(item.id)}
              onRemove={() => void remove(item.id)}
            />
          ))
        )}

        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>READY OFFLINE</ThemedText>
          <ThemedText style={styles.sectionCount}>{completed.length}</ThemedText>
        </View>
        {!isReady ? (
          <View style={styles.emptyCompact}>
            <ThemedText style={styles.emptyCompactText}>Loading your offline library…</ThemedText>
          </View>
        ) : completed.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Feather name="download" size={32} color={Colors.dark.accent} />
            </View>
            <ThemedText style={styles.emptyTitle}>Your offline library is empty</ThemedText>
            <ThemedText style={styles.emptyText}>
              Download a movie or an episode from its info page and it will be ready here when you have no connection.
            </ThemedText>
          </View>
        ) : (
          <>
            {completedMovies.length > 0 ? (
              <>
                <View style={styles.librarySubheader}>
                  <Feather name="film" size={15} color={Colors.dark.accent} />
                  <ThemedText style={styles.librarySubheaderText}>MOVIES</ThemedText>
                  <ThemedText style={styles.sectionCount}>{completedMovies.length}</ThemedText>
                </View>
                {completedMovies.map((item) => (
                  <DownloadRow
                    key={item.id}
                    item={item}
                    onPlay={() => playOffline(item)}
                    onPause={() => void pause(item.id)}
                    onResume={() => void resume(item.id)}
                    onRetry={() => void retry(item.id)}
                    onCancel={() => void cancel(item.id)}
                    onRemove={() => void remove(item.id)}
                  />
                ))}
              </>
            ) : null}
            {completedSeries.map((group) => (
              <View key={group.seriesName} style={styles.seriesGroup}>
                <View style={styles.seriesGroupHeader}>
                  <Feather name="tv" size={16} color={Colors.dark.accent} />
                  <ThemedText style={styles.seriesGroupTitle}>{group.seriesName}</ThemedText>
                </View>
                {group.seasons.map((season) => (
                  <View key={`${group.seriesName}-${season.season}`} style={styles.seasonGroup}>
                    <ThemedText style={styles.seasonGroupTitle}>
                      {season.season > 0 ? `SEASON ${season.season}` : "EPISODES"}
                    </ThemedText>
                    {season.episodes.map((item) => (
                      <DownloadRow
                        key={item.id}
                        item={item}
                        onPlay={() => playOffline(item)}
                        onPause={() => void pause(item.id)}
                        onResume={() => void resume(item.id)}
                        onRetry={() => void retry(item.id)}
                        onCancel={() => void cancel(item.id)}
                        onRemove={() => void remove(item.id)}
                      />
                    ))}
                  </View>
                ))}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function DownloadRow({
  item,
  onPlay,
  onPause,
  onResume,
  onRetry,
  onCancel,
  onRemove,
}: {
  item: DownloadItem;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const progress =
    item.bytesTotal && item.bytesTotal > 0
      ? Math.max(0, Math.min(1, item.bytesDownloaded / item.bytesTotal))
      : 0;
  return (
    <View style={styles.downloadRow}>
      <View style={styles.thumbnail}>
        {item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Feather name={item.kind === "movie" ? "film" : "tv"} size={22} color={Colors.dark.textSecondary} />
        )}
      </View>
      <View style={styles.itemDetails}>
        <View style={styles.itemTitleRow}>
          <ThemedText style={styles.itemTitle} numberOfLines={1}>{item.title}</ThemedText>
          <ThemedText style={[styles.status, item.status === "failed" && { color: Colors.dark.error }]}>
            {statusLabel(item)}
          </ThemedText>
        </View>
        {item.kind === "episode" && item.seriesName ? (
          <ThemedText style={styles.itemSubtitle} numberOfLines={1}>
            {item.seriesName} · Season {item.seasonNum ?? "—"}, Episode {item.episodeNum ?? "—"}
          </ThemedText>
        ) : (
          <ThemedText style={styles.itemSubtitle}>Movie · {bytes(item.bytesDownloaded)}</ThemedText>
        )}
        {item.status === "downloading" || item.status === "paused" || item.status === "queued" ? (
          <>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <ThemedText style={styles.progressText}>
              {item.bytesTotal
                ? `${bytes(item.bytesDownloaded)} of ${bytes(item.bytesTotal)} · ${Math.round(progress * 100)}%`
                : `${bytes(item.bytesDownloaded)} downloaded`}
            </ThemedText>
          </>
        ) : item.error ? (
          <ThemedText style={styles.errorText} numberOfLines={2}>{item.error}</ThemedText>
        ) : (
          <ThemedText style={styles.progressText}>
             {bytes(item.bytesDownloaded)} · saved to your download folder
          </ThemedText>
        )}
      </View>
      <View style={styles.rowActions}>
        {item.status === "completed" ? (
          <>
            <ActionButton icon="play" label="PLAY" onPress={onPlay} />
            <ActionButton icon="trash-2" label="DELETE" danger onPress={onRemove} />
          </>
        ) : item.status === "downloading" ? (
          <>
            <ActionButton icon="pause" label="PAUSE" onPress={onPause} />
            <ActionButton icon="x" label="CANCEL" danger onPress={onCancel} />
          </>
        ) : item.status === "paused" || item.status === "queued" ? (
          <>
            <ActionButton icon="play" label="RESUME" onPress={onResume} />
            <ActionButton icon="x" label="CANCEL" danger onPress={onCancel} />
          </>
        ) : (
          <>
            <ActionButton icon="refresh-cw" label="RETRY" onPress={onRetry} />
            <ActionButton icon="trash-2" label="REMOVE" danger onPress={onRemove} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerTitleWrap: { flex: 1 },
  headerEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, color: Colors.dark.accent },
  headerTitle: { fontSize: 25, fontWeight: "800", color: Colors.dark.text },
  refreshButton: { padding: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: Colors.dark.backgroundDefault, overflow: "hidden" },
  refreshButtonActive: { backgroundColor: Colors.dark.accent, shadowColor: "#FF6600", shadowOpacity: 0.9, shadowRadius: 9, elevation: 8 },
  refreshOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,0.14)" },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing["2xl"] },
  summaryRow: { flexDirection: "row", gap: Spacing.md },
  summaryColumn: { flexDirection: "column" },
  storageCard: { flex: 1, padding: Spacing.lg, borderRadius: BorderRadius.lg, backgroundColor: Colors.dark.backgroundDefault, borderWidth: 1, borderColor: Colors.dark.border, gap: Spacing.sm },
  storageHeader: { flexDirection: "row", gap: Spacing.sm, alignItems: "center" },
  storageIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,102,0,0.13)" },
  storageTitle: { color: Colors.dark.text, fontSize: 15, fontWeight: "800" },
  storageMeta: { color: Colors.dark.textSecondary, fontSize: 12, marginTop: 2 },
  storageTrack: { height: 7, backgroundColor: Colors.dark.backgroundRoot, borderRadius: 99, overflow: "hidden", marginTop: Spacing.xs },
  storageFill: { height: "100%", borderRadius: 99, backgroundColor: Colors.dark.accent },
  downloadedAmount: { color: Colors.dark.textSecondary, fontSize: 11 },
  locationCard: { flex: 1, padding: Spacing.lg, borderRadius: BorderRadius.lg, backgroundColor: "rgba(255,102,0,0.05)", borderWidth: 1, borderColor: "rgba(255,102,0,0.25)", justifyContent: "space-between", gap: Spacing.md },
  locationTop: { flexDirection: "row", gap: Spacing.sm, alignItems: "flex-start" },
  locationTitle: { color: Colors.dark.text, fontSize: 15, fontWeight: "800" },
  locationMeta: { color: Colors.dark.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  locationActions: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginTop: Spacing.lg },
  sectionTitle: { color: Colors.dark.text, fontSize: 13, fontWeight: "800", letterSpacing: 0.8 },
  sectionCount: { minWidth: 20, textAlign: "center", color: Colors.dark.accent, backgroundColor: "rgba(255,102,0,0.12)", fontSize: 11, fontWeight: "800", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20 },
  librarySubheader: { flexDirection: "row", alignItems: "center", gap: Spacing.xs, marginTop: Spacing.sm, marginBottom: Spacing.xs },
  librarySubheaderText: { color: Colors.dark.text, fontSize: 12, fontWeight: "800", letterSpacing: 0.7, flex: 1 },
  seriesGroup: { marginTop: Spacing.md, gap: Spacing.sm },
  seriesGroupHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: "rgba(255,102,0,0.08)", borderWidth: 1, borderColor: "rgba(255,102,0,0.2)" },
  seriesGroupTitle: { color: Colors.dark.text, fontSize: 14, fontWeight: "800", flex: 1 },
  seasonGroup: { gap: Spacing.xs, paddingLeft: Spacing.sm },
  seasonGroupTitle: { color: Colors.dark.accent, fontSize: 10, fontWeight: "800", letterSpacing: 0.8, marginTop: Spacing.xs },
  emptyCompact: { flexDirection: "row", gap: Spacing.sm, alignItems: "center", padding: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: Colors.dark.backgroundDefault },
  emptyCompactText: { color: Colors.dark.textSecondary, fontSize: 13 },
  emptyState: { padding: Spacing["2xl"], borderRadius: BorderRadius.lg, alignItems: "center", gap: Spacing.sm, borderWidth: 1, borderColor: Colors.dark.border, borderStyle: "dashed" },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,102,0,0.1)", marginBottom: Spacing.xs },
  emptyTitle: { color: Colors.dark.text, fontSize: 17, fontWeight: "800" },
  emptyText: { color: Colors.dark.textSecondary, fontSize: 13, textAlign: "center", maxWidth: 440, lineHeight: 19 },
  downloadRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.lg, backgroundColor: Colors.dark.backgroundDefault, borderWidth: 1, borderColor: Colors.dark.border },
  thumbnail: { width: 72, height: 48, borderRadius: BorderRadius.sm, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: Colors.dark.backgroundRoot },
  itemDetails: { flex: 1, minWidth: 0, gap: 3 },
  itemTitleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  itemTitle: { flex: 1, color: Colors.dark.text, fontWeight: "700", fontSize: 14 },
  status: { color: Colors.dark.accent, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  itemSubtitle: { color: Colors.dark.textSecondary, fontSize: 11 },
  progressTrack: { height: 5, borderRadius: 99, backgroundColor: Colors.dark.backgroundRoot, overflow: "hidden", marginTop: 3 },
  progressFill: { height: "100%", borderRadius: 99, backgroundColor: Colors.dark.accent },
  progressText: { color: Colors.dark.textSecondary, fontSize: 10 },
  errorText: { color: Colors.dark.error, fontSize: 10, lineHeight: 14 },
  rowActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: Spacing.xs, maxWidth: 200 },
  actionButton: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: Colors.dark.border, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 7, backgroundColor: Colors.dark.backgroundRoot },
  actionButtonActive: { backgroundColor: Colors.dark.accent, borderColor: Colors.dark.accent },
  actionDanger: { borderColor: "rgba(255,75,75,0.4)" },
  actionText: { color: Colors.dark.text, fontSize: 10, fontWeight: "800" },
});