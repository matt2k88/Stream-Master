import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Modal,
  StyleSheet,
  Pressable,
  Platform,
  Linking,
  Alert,
} from "react-native";
import * as LegacyFS from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

// One-time "Allow installs from unknown sources" pre-warning key.
const UNKNOWN_SOURCES_NOTICE_KEY = "@ultracast:apk_unknown_sources_notice_v1";

// Cache file prefix — used both for naming new downloads and for cleaning
// up stale ones from earlier attempts.
const APK_CACHE_PREFIX = "ultracast-update-";

type Status =
  | { phase: "idle" }
  | { phase: "preparing" }
  | { phase: "downloading"; progress: number; receivedMb: number; totalMb: number }
  | { phase: "installing" }
  | { phase: "error"; message: string };

// Strip any older cached APKs we've downloaded before — these can pile up
// in the cache directory if the user retries or the installer was
// dismissed.  Best-effort; failures are ignored.
async function cleanStaleApks() {
  try {
    await clearDownloadedUpdates();
  } catch {
    // ignore — cleanup is best-effort
  }
}

/**
 * Deletes every Ultra Cast update APK we've ever downloaded into the
 * app's cache directory. Returns the number of files removed and the
 * total bytes freed (best-effort — the size is omitted if the platform
 * can't stat the file before deletion).
 *
 * Safe to call from anywhere: it only touches files matching our own
 * `ultracast-update-*.apk` prefix in `cacheDirectory`, so login
 * credentials (SecureStore / AsyncStorage / documentDirectory) are
 * never touched. No-op on non-Android since we never download APKs
 * anywhere else.
 */
export async function clearDownloadedUpdates(): Promise<{ removed: number; bytesFreed: number }> {
  let removed = 0;
  let bytesFreed = 0;
  try {
    const dir = LegacyFS.cacheDirectory;
    if (!dir) return { removed, bytesFreed };
    const entries = await LegacyFS.readDirectoryAsync(dir);
    const apkFiles = entries.filter(
      (name) => name.startsWith(APK_CACHE_PREFIX) && name.endsWith(".apk"),
    );
    for (const name of apkFiles) {
      const path = dir + name;
      try {
        const info = await LegacyFS.getInfoAsync(path, { size: true });
        if (info.exists && typeof (info as any).size === "number") {
          bytesFreed += (info as any).size as number;
        }
      } catch {
        // ignore stat failure
      }
      try {
        await LegacyFS.deleteAsync(path, { idempotent: true });
        removed += 1;
      } catch {
        // ignore — file might have been removed by the OS already
      }
    }
  } catch {
    // ignore — best-effort cleanup
  }
  return { removed, bytesFreed };
}

export function useApkInstaller() {
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const resumableRef = useRef<LegacyFS.DownloadResumable | null>(null);
  const cancelledRef = useRef(false);

  const close = useCallback(() => {
    cancelledRef.current = true;
    try { resumableRef.current?.cancelAsync().catch(() => {}); } catch {}
    resumableRef.current = null;
    setStatus({ phase: "idle" });
  }, []);

  // Full flow: fetch URL → (Android) download APK inside the app and hand
  // it to Android's system package installer.  Non-Android falls back to
  // the system browser (those platforms can't sideload anyway).
  const start = useCallback(async () => {
    if (status.phase !== "idle" && status.phase !== "error") return;
    cancelledRef.current = false;
    setStatus({ phase: "preparing" });

    // 1. Fetch the URL from the server.
    let downloadUrl: string | null = null;
    try {
      const res = await fetch(
        new URL("/api/app-download-link", getApiUrl()).toString(),
        { cache: "no-store" as RequestCache },
      );
      if (res.ok) {
        const data = await res.json();
        downloadUrl = typeof data?.url === "string" ? data.url : null;
      }
    } catch {
      downloadUrl = null;
    }

    if (!downloadUrl) {
      setStatus({
        phase: "error",
        message: "Could not reach the update server. Please check your connection and try again.",
      });
      return;
    }

    // Defence-in-depth: refuse non-HTTPS links even though the server
    // already enforces this.
    if (!/^https:\/\//i.test(downloadUrl)) {
      setStatus({
        phase: "error",
        message: "The update server returned an insecure download link. Please contact support.",
      });
      return;
    }

    // Non-Android: just open the URL in the system browser.
    if (Platform.OS !== "android") {
      try { await Linking.openURL(downloadUrl); } catch {}
      setStatus({ phase: "idle" });
      return;
    }

    // 2. One-time pre-warning about "Install from unknown sources".
    try {
      const seen = await AsyncStorage.getItem(UNKNOWN_SOURCES_NOTICE_KEY);
      if (!seen) {
        await new Promise<void>((resolve, reject) => {
          Alert.alert(
            "One-time setup",
            "After downloading, Android will ask permission to install apps from Ultra Cast.\n\nTap \"Settings\" → enable \"Allow from this source\" → press Back. You will only need to do this the first time.",
            [
              { text: "Cancel", style: "cancel", onPress: () => reject(new Error("cancelled")) },
              {
                text: "Continue",
                onPress: async () => {
                  try { await AsyncStorage.setItem(UNKNOWN_SOURCES_NOTICE_KEY, "1"); } catch {}
                  resolve();
                },
              },
            ],
            { cancelable: false },
          );
        });
      }
    } catch {
      setStatus({ phase: "idle" });
      return;
    }

    if (cancelledRef.current) { setStatus({ phase: "idle" }); return; }

    // 3. Clean stale APKs from prior attempts, then download.
    await cleanStaleApks();

    setStatus({ phase: "downloading", progress: 0, receivedMb: 0, totalMb: 0 });
    const target = (LegacyFS.cacheDirectory ?? "") + `${APK_CACHE_PREFIX}${Date.now()}.apk`;
    const resumable = LegacyFS.createDownloadResumable(
      downloadUrl,
      target,
      {},
      (p) => {
        if (cancelledRef.current) return;
        const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : 0;
        const ratio = total > 0 ? p.totalBytesWritten / total : 0;
        setStatus({
          phase: "downloading",
          progress: Math.max(0, Math.min(1, ratio)),
          receivedMb: p.totalBytesWritten / (1024 * 1024),
          totalMb: total / (1024 * 1024),
        });
      },
    );
    resumableRef.current = resumable;

    let result: LegacyFS.FileSystemDownloadResult | undefined;
    try {
      result = await resumable.downloadAsync();
    } catch {
      if (cancelledRef.current) { setStatus({ phase: "idle" }); return; }
      setStatus({
        phase: "error",
        message: "Download failed. Check your internet connection and try again.",
      });
      return;
    }

    if (cancelledRef.current) { setStatus({ phase: "idle" }); return; }
    if (!result?.uri) {
      setStatus({ phase: "error", message: "Download finished but the file is missing." });
      return;
    }

    // Sanity-check the downloaded file before handing it off. On Fire TV
    // a half-downloaded or zero-byte APK is one of the failure modes
    // where the installer would silently refuse to open.
    try {
      const info = await LegacyFS.getInfoAsync(result.uri, { size: true });
      if (!info.exists || (typeof (info as any).size === "number" && (info as any).size < 1024)) {
        setStatus({
          phase: "error",
          message: "Downloaded file looks invalid. Please try again.",
        });
        return;
      }
    } catch {
      // Non-fatal — if we can't stat the file just try to install it anyway.
    }

    // 4. Hand the APK to Android's package installer.
    //
    // Fire TV / Fire OS is strict about install intents:
    //   * The data URI MUST be content:// (file:// throws
    //     FileUriExposedException on Android 7+). Expo's getContentUriAsync
    //     uses the bundled FileProvider that maps cacheDirectory.
    //   * FLAG_GRANT_READ_URI_PERMISSION (=1) is needed so the installer
    //     process can read the file via the content URI.
    //   * FLAG_ACTIVITY_NEW_TASK (=268435456) is needed because Fire OS
    //     often launches the installer from a non-activity context. This
    //     is the single most common reason the installer "does nothing"
    //     after a successful download.
    // We try ACTION_VIEW first (works on most Android phones + TV) and
    // fall back to ACTION_INSTALL_PACKAGE (older Fire OS) so we exhaust
    // every reliable path before reporting failure.
    setStatus({ phase: "installing" });
    const FLAG_GRANT_READ_URI_PERMISSION = 1;
    const FLAG_ACTIVITY_NEW_TASK = 268435456;
    const flags = FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK;
    const APK_MIME = "application/vnd.android.package-archive";

    let contentUri: string | null = null;
    try {
      contentUri = await LegacyFS.getContentUriAsync(result.uri);
    } catch (e: any) {
      setStatus({
        phase: "error",
        message:
          "Could not prepare the installer file. (" + String(e?.message || e) + ")",
      });
      return;
    }

    const tryLaunch = async (action: string) => {
      await IntentLauncher.startActivityAsync(action, {
        data: contentUri!,
        flags,
        type: APK_MIME,
      });
    };

    let firstError: unknown = null;
    try {
      await tryLaunch("android.intent.action.VIEW");
      setStatus({ phase: "idle" });
      return;
    } catch (e) {
      firstError = e;
    }

    // Fallback for older Fire OS builds where ACTION_VIEW with the APK
    // MIME isn't matched by the installer activity.
    try {
      await tryLaunch("android.intent.action.INSTALL_PACKAGE");
      setStatus({ phase: "idle" });
      return;
    } catch (e2) {
      const msg = String((firstError as any)?.message || firstError || e2 || "unknown");
      setStatus({
        phase: "error",
        message:
          "Could not open the installer (" + msg + "). On Fire TV: open Settings → My Fire TV → Developer Options → Install Unknown Apps → enable Ultra Cast, then try again.",
      });
    }
  }, [status.phase]);

  const ModalElement: React.ReactElement | null = (() => {
    if (status.phase === "idle") return null;
    return (
      <Modal transparent animationType="fade" visible onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.iconRow}>
              {status.phase === "error" ? (
                <Feather name="alert-triangle" size={28} color={Colors.dark.error} />
              ) : status.phase === "installing" ? (
                <Feather name="check-circle" size={28} color={Colors.dark.success} />
              ) : (
                <Feather name="download" size={28} color={Colors.dark.accent} />
              )}
            </View>
            <ThemedText style={styles.title}>
              {status.phase === "preparing" && "Preparing download..."}
              {status.phase === "downloading" && "Downloading update"}
              {status.phase === "installing" && "Opening installer"}
              {status.phase === "error" && "Update failed"}
            </ThemedText>

            {status.phase === "downloading" ? (
              <>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.round(status.progress * 100)}%` }]} />
                </View>
                <ThemedText style={styles.subtitle}>
                  {status.totalMb > 0
                    ? `${status.receivedMb.toFixed(1)} / ${status.totalMb.toFixed(1)} MB  (${Math.round(status.progress * 100)}%)`
                    : `${Math.round(status.progress * 100)}%`}
                </ThemedText>
              </>
            ) : null}

            {status.phase === "installing" ? (
              <ThemedText style={styles.subtitle}>
                Android will now ask you to confirm the install.
              </ThemedText>
            ) : null}

            {status.phase === "preparing" ? (
              <ThemedText style={styles.subtitle}>Just a moment...</ThemedText>
            ) : null}

            {status.phase === "error" ? (
              <ThemedText style={styles.errorText}>{status.message}</ThemedText>
            ) : null}

            <View style={styles.actions}>
              {status.phase === "error" ? (
                <Pressable style={[styles.btn, styles.btnPrimary]} onPress={start}>
                  <Feather name="refresh-cw" size={14} color="#fff" />
                  <ThemedText style={styles.btnPrimaryText}>Try Again</ThemedText>
                </Pressable>
              ) : null}
              <Pressable style={styles.btn} onPress={close}>
                <Feather name="x" size={14} color={Colors.dark.text} />
                <ThemedText style={styles.btnText}>
                  {status.phase === "downloading" ? "Cancel" : "Close"}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  })();

  return {
    start,
    cancel: close,
    isBusy: status.phase !== "idle",
    isAndroid: Platform.OS === "android",
    modal: ModalElement,
  };
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center", alignItems: "center",
    padding: Spacing.lg,
  },
  card: {
    width: "100%", maxWidth: 400,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.dark.border,
    padding: Spacing.lg, alignItems: "center", gap: Spacing.sm,
  },
  iconRow: { marginBottom: Spacing.xs },
  title: {
    fontSize: 16, fontWeight: "700", color: Colors.dark.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13, color: Colors.dark.textSecondary,
    textAlign: "center", marginTop: Spacing.xs,
  },
  errorText: {
    fontSize: 13, color: Colors.dark.textSecondary,
    textAlign: "center", marginTop: Spacing.xs, lineHeight: 18,
  },
  progressTrack: {
    width: "100%", height: 8, borderRadius: 4,
    backgroundColor: Colors.dark.backgroundRoot,
    overflow: "hidden", marginTop: Spacing.sm,
  },
  progressFill: {
    height: "100%", backgroundColor: Colors.dark.accent, borderRadius: 4,
  },
  actions: {
    flexDirection: "row", gap: Spacing.sm,
    marginTop: Spacing.md, width: "100%",
  },
  btn: {
    flex: 1, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 6,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  btnPrimary: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  btnText: { color: Colors.dark.text, fontWeight: "700", fontSize: 13 },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
