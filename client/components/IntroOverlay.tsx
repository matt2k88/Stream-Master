import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  Text,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getApiUrl } from "@/lib/query-client";
import { Colors } from "@/constants/theme";

interface IntroPlayerProps {
  videoUrl: string;
  onDone: () => void;
}

function IntroPlayer({ videoUrl, onDone }: IntroPlayerProps) {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const doneRef = useRef(false);
  const [showSkip, setShowSkip] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [debugStatus, setDebugStatus] = useState("initialising...");
  const [debugError, setDebugError] = useState("");

  const dismiss = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start(() => onDone());
  }, [fadeAnim, onDone]);

  const player = useVideoPlayer(videoUrl, (p) => {
    p.muted = false;
    p.loop = false;
    p.play();
  });

  useEffect(() => {
    const sub = player.addListener("statusChange", (e: any) => {
      setDebugStatus(e.status ?? "unknown");
      if (e.status === "readyToPlay") {
        setIsReady(true);
        setShowSkip(true);
        setDebugError("");
      } else if (e.status === "error") {
        setDebugError(e.error?.message ?? e.error?.toString() ?? "unknown error");
        // Auto-dismiss on error after 3s so app still opens
        setTimeout(() => dismiss(), 3000);
      }
    });
    return () => sub.remove();
  }, [player, dismiss]);

  useEffect(() => {
    const sub = player.addListener("playingChange", (e: any) => {
      if (e.isPlaying) {
        setIsReady(true);
        setShowSkip(true);
        setDebugStatus("playing");
      }
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    const sub = player.addListener("playToEnd", () => dismiss());
    return () => sub.remove();
  }, [player, dismiss]);

  // Safety timeout — always dismiss after 30s regardless
  useEffect(() => {
    const t = setTimeout(() => dismiss(), 30000);
    return () => clearTimeout(t);
  }, [dismiss]);

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />

      {/* Loading spinner */}
      {!isReady ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          {/* Debug label — shows player state on device */}
          <Text style={styles.debugText}>{debugStatus}</Text>
          {debugError ? (
            <Text style={styles.debugError}>{debugError}</Text>
          ) : null}
          <Text style={styles.debugUrl} numberOfLines={3}>{videoUrl}</Text>
        </View>
      ) : null}

      {showSkip ? (
        <Pressable
          style={[styles.skipBtn, { top: insets.top + 12, right: insets.right + 16 }]}
          onPress={dismiss}
          hitSlop={12}
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      ) : null}

      <Animated.View
        style={[styles.fadeOverlay, { opacity: fadeAnim }]}
        pointerEvents="none"
      />
    </View>
  );
}

interface IntroOverlayProps {
  onDone: () => void;
}

export default function IntroOverlay({ onDone }: IntroOverlayProps) {
  const [videoUrl, setVideoUrl] = useState<string | null | false>(null);

  useEffect(() => {
    // expo-video doesn't fire events reliably on web — skip intro there
    if (Platform.OS === "web") {
      onDone();
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const base = getApiUrl();
        const res = await fetch(new URL("/api/intros", base).toString());
        if (!cancelled) {
          if (res.ok) {
            const data = await res.json();
            if (data?.video_url) {
              setVideoUrl(data.video_url);
            } else {
              setVideoUrl(false);
            }
          } else {
            setVideoUrl(false);
          }
        }
      } catch {
        if (!cancelled) setVideoUrl(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (videoUrl === false) onDone();
  }, [videoUrl, onDone]);

  if (videoUrl === null) return <View style={styles.container} />;
  if (videoUrl === false) return null;

  return <IntroPlayer videoUrl={videoUrl} onDone={onDone} />;
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 9999,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(0,0,0,0.8)",
    paddingHorizontal: 24,
  },
  skipBtn: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.5)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  skipText: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: "600",
    opacity: 0.9,
  },
  fadeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  debugText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    textAlign: "center",
  },
  debugError: {
    color: "#FF5555",
    fontSize: 12,
    textAlign: "center",
  },
  debugUrl: {
    color: "rgba(255,102,0,0.5)",
    fontSize: 10,
    textAlign: "center",
  },
});
