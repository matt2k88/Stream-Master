import React, { useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { SyncProgress, SyncStatus } from "@/contexts/DataContext";

interface SyncScreenProps {
  progress: SyncProgress;
}

const STATUS_LABELS: Record<SyncStatus, string> = {
  idle: "Waiting...",
  waiting: "Waiting...",
  loading: "Loading...",
  done: "Completed!",
  error: "Failed",
};

function StatusTile({ label, status }: { label: string; status: SyncStatus }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === "loading") {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: Platform.OS !== "web" }),
          Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== "web" }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      pulse.setValue(1);
    }
  }, [status]);

  const isDone = status === "done";
  const isLoading = status === "loading";
  const isError = status === "error";
  const isActive = isDone || isLoading;

  return (
    <View style={[styles.tile, isActive && styles.tileActive, isDone && styles.tileDone, isError && styles.tileError]}>
      {isDone ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.2)", "rgba(255,102,0,0.05)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}

      <ThemedText style={styles.tileLabel}>{label}</ThemedText>

      <View style={styles.tileStatusRow}>
        {isLoading ? (
          <Animated.View style={{ opacity: pulse }}>
            <View style={styles.loadingDot} />
          </Animated.View>
        ) : isDone ? (
          <Feather name="check-circle" size={14} color={Colors.dark.accent} />
        ) : isError ? (
          <Feather name="alert-circle" size={14} color={Colors.dark.error} />
        ) : (
          <View style={styles.waitingDot} />
        )}
        <ThemedText
          style={[
            styles.tileStatus,
            isLoading && styles.tileStatusLoading,
            isDone && styles.tileStatusDone,
            isError && styles.tileStatusError,
          ]}
        >
          {STATUS_LABELS[status]}
        </ThemedText>
      </View>

      {isDone ? <View style={styles.tileBar} /> : null}
    </View>
  );
}

export function SyncScreen({ progress }: SyncScreenProps) {
  const { width } = useWindowDimensions();
  const progressAnim = useRef(new Animated.Value(0)).current;
  const barWidth = useRef(new Animated.Value(0)).current;

  const doneCount = [progress.live, progress.movies, progress.series, progress.epg].filter(
    (s) => s === "done" || s === "error"
  ).length;

  const totalPercent = doneCount / 4;

  useEffect(() => {
    Animated.timing(barWidth, {
      toValue: totalPercent,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [totalPercent]);

  const barW = barWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["rgba(255,102,0,0.08)", "transparent", "rgba(255,102,0,0.03)"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
      />

      {/* Decorative glow orb */}
      <View style={styles.glowOrb} pointerEvents="none" />

      <View style={styles.inner}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Feather name="refresh-cw" size={18} color={Colors.dark.accent} />
          </View>
          <ThemedText style={styles.title}>Updating Media Content</ThemedText>
        </View>

        {/* Status tiles */}
        <View style={styles.tilesRow}>
          <StatusTile label="LIVE TV" status={progress.live} />
          <StatusTile label="MOVIES" status={progress.movies} />
          <StatusTile label="SERIES" status={progress.series} />
          <StatusTile label="TV GUIDE" status={progress.epg} />
        </View>

        {/* Progress bar */}
        <View style={styles.progressSection}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: barW }]}>
              <LinearGradient
                colors={["#FF8C1A", "#FF5500"]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              />
              <View style={styles.progressGlow} />
            </Animated.View>
          </View>
          <ThemedText style={styles.waitText}>PLEASE WAIT</ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dark.backgroundRoot,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  glowOrb: {
    position: "absolute",
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: "rgba(255,102,0,0.05)",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -200 }, { translateY: -200 }],
  },
  inner: {
    width: "100%",
    maxWidth: 640,
    paddingHorizontal: Spacing["3xl"],
    gap: Spacing.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.2)",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.accentDim,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 0.5,
  },
  tilesRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  tile: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    alignItems: "center",
    gap: Spacing.sm,
    overflow: "hidden",
    minHeight: 90,
    justifyContent: "center",
  },
  tileActive: {
    borderColor: "rgba(255,102,0,0.3)",
  },
  tileDone: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  tileError: {
    borderColor: "rgba(255,59,59,0.4)",
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  tileStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  waitingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.border,
  },
  tileStatus: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  tileStatusLoading: {
    color: Colors.dark.accent,
  },
  tileStatusDone: {
    color: Colors.dark.accent,
    fontWeight: "600",
  },
  tileStatusError: {
    color: Colors.dark.error,
  },
  tileBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  progressSection: {
    gap: Spacing.sm,
  },
  progressTrack: {
    height: 44,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
  },
  progressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    overflow: "hidden",
  },
  progressGlow: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  waitText: {
    textAlign: "center",
    color: Colors.dark.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 3,
    textTransform: "uppercase",
  },
});
