import { useCallback } from "react";
import { Platform, Linking, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";

const UNKNOWN_SOURCES_NOTICE_KEY = "@ultracast:apk_unknown_sources_notice_v1";

async function fetchDownloadUrl(): Promise<string | null> {
  try {
    const res = await fetch(
      new URL("/api/app-download-link", getApiUrl()).toString(),
      { cache: "no-store" as RequestCache },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const url = typeof data?.url === "string" ? data.url : null;
    if (!url || !/^https:\/\//i.test(url)) return null;
    return url;
  } catch {
    return null;
  }
}

export function useApkInstaller() {
  const start = useCallback(async () => {
    const url = await fetchDownloadUrl();
    if (!url) {
      Alert.alert(
        "Update",
        "Could not reach the update server. Please check your connection and try again.",
      );
      return;
    }

    if (Platform.OS !== "android") {
      try { await Linking.openURL(url); } catch {}
      return;
    }

    const openInBrowser = async (): Promise<boolean> => {
      try {
        await Linking.openURL(url);
        return true;
      } catch {
        Alert.alert(
          "Update",
          "Could not open the browser to download the update.",
        );
        return false;
      }
    };

    let seen: string | null = null;
    try { seen = await AsyncStorage.getItem(UNKNOWN_SOURCES_NOTICE_KEY); } catch {}

    if (seen) {
      await openInBrowser();
      return;
    }

    Alert.alert(
      "One-time setup",
      "Your browser will download the update. When it finishes, tap the downloaded file to install.\n\nThe first time, Android will ask permission to install apps from this source — tap Settings, enable it, then press Back. You will only need to do this once.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: async () => {
            const ok = await openInBrowser();
            if (ok) {
              try { await AsyncStorage.setItem(UNKNOWN_SOURCES_NOTICE_KEY, "1"); } catch {}
            }
          },
        },
      ],
      { cancelable: true },
    );
  }, []);

  return {
    start,
    isAndroid: Platform.OS === "android",
    // Retained for callsite compatibility — no in-app modal is needed
    // now that the system browser handles the download UI.
    modal: null as null,
  };
}
