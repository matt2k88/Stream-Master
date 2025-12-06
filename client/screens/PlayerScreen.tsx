import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type PlayerRouteProp = RouteProp<RootStackParamList, "Player">;

export default function PlayerScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<PlayerRouteProp>();
  const { streamUrl, title } = route.params;

  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const player = useVideoPlayer(streamUrl, (player) => {
    player.loop = false;
    player.play();
  });

  useEffect(() => {
    const subscription = player.addListener("statusChange", (status) => {
      if (status.status === "readyToPlay") {
        setIsLoading(false);
        setError("");
      } else if (status.status === "error") {
        setIsLoading(false);
        setError(status.error?.message || "Failed to load stream");
      } else if (status.status === "loading") {
        setIsLoading(true);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [player]);

  useEffect(() => {
    const subscription = player.addListener("playingChange", (isPlaying) => {
      setIsPlaying(isPlaying);
    });

    return () => {
      subscription.remove();
    };
  }, [player]);

  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [resetControlsTimeout]);

  const handleScreenPress = () => {
    if (showControls) {
      setShowControls(false);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    } else {
      resetControlsTimeout();
    }
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
    resetControlsTimeout();
  };

  const handleBack = () => {
    player.pause();
    navigation.goBack();
  };

  if (error) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.errorContainer}>
          <Feather name="alert-circle" size={64} color={Colors.dark.error} />
          <ThemedText type="h3" style={styles.errorTitle}>
            Playback Error
          </ThemedText>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <Pressable
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
            ]}
            onPress={handleBack}
          >
            <Feather name="arrow-left" size={20} color={Colors.dark.buttonText} />
            <ThemedText style={styles.backButtonText}>Go Back</ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Pressable style={styles.container} onPress={handleScreenPress}>
      <StatusBar hidden />
      <VideoView
        style={styles.video}
        player={player}
        contentFit="contain"
        nativeControls={false}
      />

      {isLoading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={styles.loadingText}>Loading stream...</ThemedText>
        </View>
      ) : null}

      {showControls ? (
        <View style={styles.controlsOverlay}>
          <View style={styles.topControls}>
            <Pressable
              style={({ pressed }) => [
                styles.controlButton,
                pressed && styles.controlButtonPressed,
              ]}
              onPress={handleBack}
            >
              <Feather name="arrow-left" size={28} color={Colors.dark.text} />
            </Pressable>
            <ThemedText type="h4" style={styles.titleText} numberOfLines={1}>
              {title}
            </ThemedText>
            <View style={styles.controlButtonPlaceholder} />
          </View>

          <View style={styles.centerControls}>
            <Pressable
              style={({ pressed }) => [
                styles.playPauseButton,
                pressed && styles.playPauseButtonPressed,
              ]}
              onPress={handlePlayPause}
            >
              <Feather
                name={isPlaying ? "pause" : "play"}
                size={48}
                color={Colors.dark.text}
              />
            </Pressable>
          </View>

          <View style={styles.bottomControls} />
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
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  loadingText: {
    marginTop: Spacing.lg,
    color: Colors.dark.text,
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "space-between",
  },
  topControls: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Spacing["3xl"],
    paddingHorizontal: Spacing.tvSafeZone,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  controlButtonPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.4)",
  },
  controlButtonPlaceholder: {
    width: 56,
    height: 56,
  },
  titleText: {
    flex: 1,
    color: Colors.dark.text,
    textAlign: "center",
    marginHorizontal: Spacing.lg,
  },
  centerControls: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  playPauseButton: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  playPauseButtonPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    transform: [{ scale: 1.1 }],
  },
  bottomControls: {
    height: Spacing.tvSafeZone,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.tvSafeZone,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  errorTitle: {
    color: Colors.dark.text,
    marginTop: Spacing.xl,
  },
  errorText: {
    color: Colors.dark.textSecondary,
    marginTop: Spacing.md,
    textAlign: "center",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing["2xl"],
    paddingHorizontal: Spacing["2xl"],
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.accent,
    borderRadius: BorderRadius.sm,
  },
  backButtonPressed: {
    opacity: 0.8,
  },
  backButtonText: {
    color: Colors.dark.buttonText,
    marginLeft: Spacing.sm,
    fontWeight: "600",
  },
});
