import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  StatusBar,
  Platform,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/contexts/AuthContext";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type PlayerRouteProp = RouteProp<RootStackParamList, "Player">;

// Dynamic import — VLC is only available in native Android builds
let VLCPlayer: any = null;
if (Platform.OS === "android") {
  try {
    VLCPlayer = require("react-native-vlc-media-player").default;
  } catch (_) {
    // Not available in Expo Go / web — falls back to internal player
  }
}

export default function PlayerScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<PlayerRouteProp>();
  const { streamUrl, title } = route.params;
  const { playerMode } = useAuth();

  const useVLC = playerMode === "vlc" && Platform.OS === "android" && VLCPlayer !== null;

  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- Internal expo-video player ---
  const internalPlayer = useVideoPlayer(useVLC ? null : streamUrl, (p) => {
    if (!useVLC) {
      p.loop = false;
      p.play();
    }
  });

  useEffect(() => {
    if (useVLC) return;
    const sub = internalPlayer.addListener("statusChange", (status) => {
      if (status.status === "readyToPlay") { setIsLoading(false); setError(""); }
      else if (status.status === "error") {
        setIsLoading(false);
        setError(status.error?.message || "Failed to load stream");
      } else if (status.status === "loading") {
        setIsLoading(true);
      }
    });
    return () => sub.remove();
  }, [internalPlayer, useVLC]);

  useEffect(() => {
    if (useVLC) return;
    const sub = internalPlayer.addListener("playingChange", (playing) => setIsPlaying(playing));
    return () => sub.remove();
  }, [internalPlayer, useVLC]);

  // --- Controls auto-hide ---
  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    setShowControls(true);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3500);
  }, []);

  useEffect(() => {
    resetControlsTimeout();
    return () => { if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); };
  }, [resetControlsTimeout]);

  const handleScreenPress = () => {
    if (showControls) {
      setShowControls(false);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    } else {
      resetControlsTimeout();
    }
  };

  const handlePlayPause = () => {
    if (useVLC) {
      const next = !isPaused;
      setIsPaused(next);
      setIsPlaying(!next);
    } else {
      isPlaying ? internalPlayer.pause() : internalPlayer.play();
    }
    resetControlsTimeout();
  };

  const handleBack = () => {
    if (!useVLC) internalPlayer.pause();
    navigation.goBack();
  };

  if (error) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.errorContainer}>
          <View style={styles.errorIconRing}>
            <Feather name="alert-circle" size={40} color={Colors.dark.error} />
          </View>
          <ThemedText style={styles.errorTitle}>Playback Error</ThemedText>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <Pressable
            style={({ pressed }) => [styles.errorBackBtn, pressed && { opacity: 0.8 }]}
            onPress={handleBack}
          >
            <LinearGradient
              colors={["#FF8C1A", "#FF5500"]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />
            <Feather name="arrow-left" size={16} color="#fff" />
            <ThemedText style={styles.errorBackBtnText}>Go Back</ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Pressable style={styles.container} onPress={handleScreenPress}>
      <StatusBar hidden />

      {/* Video surface */}
      {useVLC ? (
        <VLCPlayer
          source={{ uri: streamUrl }}
          style={styles.video}
          paused={isPaused}
          resizeMode="contain"
          muted={false}
          volume={200}
          onBuffering={() => setIsLoading(true)}
          onPlaying={() => { setIsLoading(false); setIsPlaying(true); setIsPaused(false); setError(""); }}
          onPaused={() => { setIsPlaying(false); setIsPaused(true); }}
          onStopped={() => setIsPlaying(false)}
          onError={() => { setIsLoading(false); setError("VLC could not play this stream"); }}
        />
      ) : (
        <VideoView
          style={styles.video}
          player={internalPlayer}
          contentFit="contain"
          nativeControls={false}
        />
      )}

      {isLoading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={styles.loadingText}>
            {useVLC ? "VLC loading stream..." : "Loading stream..."}
          </ThemedText>
        </View>
      ) : null}

      {showControls ? (
        <View style={styles.controlsOverlay}>
          <LinearGradient
            colors={["rgba(0,0,0,0.8)", "transparent"]}
            style={styles.topGradient}
            pointerEvents="none"
          />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.7)"]}
            style={styles.bottomGradient}
            pointerEvents="none"
          />

          <View style={styles.topBar}>
            <Pressable
              style={({ pressed }) => [styles.ctrlBtn, pressed && styles.ctrlBtnPressed]}
              onPress={handleBack}
            >
              <Feather name="arrow-left" size={22} color="#fff" />
            </Pressable>
            <ThemedText style={styles.titleText} numberOfLines={1}>{title}</ThemedText>
            {useVLC ? (
              <View style={styles.vlcBadge}>
                <ThemedText style={styles.vlcBadgeText}>VLC</ThemedText>
              </View>
            ) : (
              <View style={{ width: 48 }} />
            )}
          </View>

          <View style={styles.centerControls}>
            <Pressable
              style={({ pressed }) => [styles.playBtn, pressed && styles.playBtnPressed]}
              onPress={handlePlayPause}
            >
              <LinearGradient
                colors={["rgba(255,140,26,0.3)", "rgba(255,85,0,0.3)"]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <Feather
                name={isPlaying ? "pause" : "play"}
                size={36}
                color="#fff"
              />
            </Pressable>
          </View>

          <View style={styles.bottomBar} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  video: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.75)",
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
  },
  topGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Spacing["2xl"],
    paddingHorizontal: Spacing["2xl"],
    gap: Spacing.md,
  },
  ctrlBtn: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  ctrlBtnPressed: {
    backgroundColor: "rgba(255,102,0,0.3)",
    borderColor: Colors.dark.accent,
  },
  titleText: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  vlcBadge: {
    width: 48,
    height: 26,
    borderRadius: BorderRadius.xs,
    backgroundColor: "rgba(255,102,0,0.25)",
    borderWidth: 1,
    borderColor: Colors.dark.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  vlcBadgeText: {
    color: Colors.dark.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  centerControls: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  playBtn: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 2,
    borderColor: "rgba(255,102,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 12,
  },
  playBtnPressed: {
    transform: [{ scale: 0.92 }],
  },
  bottomBar: {
    height: Spacing["2xl"],
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
    padding: Spacing["3xl"],
    gap: Spacing.lg,
  },
  errorIconRing: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderColor: "rgba(255,59,59,0.4)",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,59,59,0.08)",
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  errorText: {
    color: Colors.dark.textSecondary,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
  },
  errorBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    overflow: "hidden",
    marginTop: Spacing.sm,
  },
  errorBackBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
