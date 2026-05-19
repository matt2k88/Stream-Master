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

// Key used to remember whether we've already shown the "Allow installs from
// unknown sources" pre-warning to this user. We only want to show it once
// per device — the OS itself handles all subsequent permission prompts.
const UNKNOWN_SOURCES_NOTICE_KEY = "@ultracast:apk_unknown_sources_notice_v1";

type Status =
  | { phase: "idle" }
  | { phase: "preparing" }
  | { phase: "downloading"; progress: number }
  | { phase: "installing" }
  | { phase: "error"; message: string };

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

  // Runs the full "fetch download URL → download APK → launch installer"
  // flow on Android. On any other platform it falls back to opening the
  // URL in the system browser (where the user can download manually).
  const start = useCallback(async () => {
    if (status.phase !== "idle" && status.phase !== "error") return;
    cancelledRef.current = false;
    setStatus({ phase: "preparing" });

    // 1. Fetch the URL from the server (server keeps the link private —
    //    the client only sees it long enough to download with it).
    let downloadUrl: string | null = null;
    try {
      const res = await fetch(new URL("/api/app-download-link", getApiUrl()).toString(), {
        cache: "no-store" as RequestCache,
      });
      const data = res.ok ? await res.json() : null;
      downloadUrl = typeof data?.url === "string" ? data.url : null;
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

    // Defence-in-depth: even though the server enforces HTTPS, refuse to
    // download an APK over plain HTTP from the client side as well. A
    // tampered package over HTTP would be installed silently once the
    // user accepts the OS install prompt.
    if (!/^https:\/\//i.test(downloadUrl)) {
      setStatus({
        phase: "error",
        message: "The update server returned an insecure download link. Please contact support.",
      });
      return;
    }

    // Non-Android: just hand the link to the system browser. Mobile
    // Safari / Chrome will save the file the regular way and the user
    // can install it themselves.
    if (Platform.OS !== "android") {
      try { await Linking.openURL(downloadUrl); } catch {}
      setStatus({ phase: "idle" });
      return;
    }

    // 2. One-time pre-warning about "Install from unknown sources".
    //    Wait for the user to acknowledge before kicking off the
    //    download, so they aren't surprised by the OS dialog later.
    try {
      const seen = await AsyncStorage.getItem(UNKNOWN_SOURCES_NOTICE_KEY);
      if (!seen) {
        await new Promise<void>((resolve, reject) => {
          Alert.alert(
            "One-time setup",
            "After downloading, Android will ask permission to install apps from Ultra Cast.\n\nTap \"Settings\" → enable \"Allow from this source\" → press Back. You will only need to do this the first time.",
            [
              {
                text: "Cancel",
                style: "cancel",
                onPress: () => reject(new Error("cancelled")),
              },
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

    // 3. Download the APK to the cache directory using the legacy
    //    DownloadResumable API (modern File.downloadFileAsync doesn't
    //    expose per-chunk progress callbacks yet).
    setStatus({ phase: "downloading", progress: 0 });
    const target = (LegacyFS.cacheDirectory ?? "") + `ultracast-update-${Date.now()}.apk`;
    const resumable = LegacyFS.createDownloadResumable(
      downloadUrl,
      target,
      {},
      (p) => {
        if (cancelledRef.current) return;
        const ratio = p.totalBytesExpectedToWrite > 0
          ? p.totalBytesWritten / p.totalBytesExpectedToWrite
          : 0;
        setStatus({ phase: "downloading", progress: Math.max(0, Math.min(1, ratio)) });
      },
    );
    resumableRef.current = resumable;

    let result: LegacyFS.FileSystemDownloadResult | undefined;
    try {
      result = await resumable.downloadAsync();
    } catch (e: any) {
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

    // 4. Hand the APK to Android's package installer via a content://
    //    URI generated by Expo's FileProvider, with the read permission
    //    flag so the installer can actually access the file.
    setStatus({ phase: "installing" });
    try {
      const contentUri = await LegacyFS.getContentUriAsync(result.uri);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: "application/vnd.android.package-archive",
      });
      // The installer takes over from here. Reset our state so the next
      // "Download & Install" press behaves normally.
      setStatus({ phase: "idle" });
    } catch (e: any) {
      setStatus({
        phase: "error",
        message:
          "Could not open the installer. You may need to allow Ultra Cast to install apps in Android settings, then try again.",
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
                  {Math.round(status.progress * 100)}%
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
