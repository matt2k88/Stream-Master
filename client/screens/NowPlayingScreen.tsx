import React, { useEffect } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useMusic } from "@/contexts/MusicContext";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type Nav = NativeStackNavigationProp<RootStackParamList>;

function fmt(sec: number) {
  if (!sec || !isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function NowPlayingScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const {
    current, playState, position, duration,
    pause, resume, next, previous, stop, seek, setExpanded,
  } = useMusic();

  useEffect(() => {
    setExpanded(true);
    return () => setExpanded(false);
  }, [setExpanded]);

  if (!current) {
    // Track ended / cleared while screen open — bounce back
    navigation.goBack();
    return null;
  }

  const progressPct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Feather name="chevron-down" size={24} color={Colors.dark.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Now Playing</ThemedText>
        <Pressable onPress={() => { stop(); navigation.goBack(); }} style={styles.iconBtn}>
          <Feather name="x" size={20} color={Colors.dark.text} />
        </Pressable>
      </View>

      {/* The expanded WebView from MusicHost sits at top:80 — reserve room. */}
      <View style={styles.videoSpacer} />

      <View style={styles.metaWrap}>
        {current.artwork_url ? (
          <Image source={{ uri: current.artwork_url }} style={styles.bigArt} contentFit="cover" />
        ) : (
          <View style={[styles.bigArt, { alignItems: "center", justifyContent: "center" }]}>
            <Feather name="music" size={64} color={Colors.dark.accent} />
          </View>
        )}
        <ThemedText style={styles.title} numberOfLines={2}>{current.title}</ThemedText>
        <ThemedText style={styles.artist} numberOfLines={1}>{current.artist}</ThemedText>

        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>
          <View style={styles.timeRow}>
            <ThemedText style={styles.timeText}>{fmt(position)}</ThemedText>
            <ThemedText style={styles.timeText}>{fmt(duration)}</ThemedText>
          </View>
        </View>

        <View style={styles.controls}>
          <Pressable onPress={() => seek(Math.max(0, position - 15))} style={styles.ctrlSm}>
            <Feather name="rotate-ccw" size={20} color={Colors.dark.text} />
          </Pressable>
          <Pressable onPress={previous} style={styles.ctrlMd}>
            <Feather name="skip-back" size={26} color={Colors.dark.text} />
          </Pressable>
          <Pressable
            onPress={() => playState === "playing" ? pause() : resume()}
            style={styles.ctrlLg}
          >
            <Feather name={playState === "playing" ? "pause" : "play"} size={32} color="#fff" />
          </Pressable>
          <Pressable onPress={next} style={styles.ctrlMd}>
            <Feather name="skip-forward" size={26} color={Colors.dark.text} />
          </Pressable>
          <Pressable onPress={() => seek(Math.min(duration || position + 15, position + 15))} style={styles.ctrlSm}>
            <Feather name="rotate-cw" size={20} color={Colors.dark.text} />
          </Pressable>
        </View>

        {playState === "error" ? (
          <ThemedText style={styles.errText}>Couldn't load this track. Skip to next?</ThemedText>
        ) : null}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.md },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.full, backgroundColor: Colors.dark.backgroundDefault, borderWidth: 1, borderColor: Colors.dark.border },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: Colors.dark.text, textAlign: "center" },
  // Spacer reserves space under the floating expanded WebView in MusicHost (top:80, ~270 high)
  videoSpacer: { height: 280 },
  metaWrap: { paddingHorizontal: Spacing.xl, alignItems: "center", gap: Spacing.sm },
  bigArt: { width: 120, height: 120, borderRadius: BorderRadius.sm, backgroundColor: "#1A1A1A", marginBottom: Spacing.md },
  title: { color: Colors.dark.text, fontSize: 18, fontWeight: "700", textAlign: "center" },
  artist: { color: Colors.dark.textSecondary, fontSize: 14, marginBottom: Spacing.md },
  progressWrap: { width: "100%", maxWidth: 480 },
  progressTrack: { height: 3, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 2 },
  progressFill: { height: 3, backgroundColor: Colors.dark.accent, borderRadius: 2 },
  timeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  timeText: { color: Colors.dark.textSecondary, fontSize: 11 },
  controls: { flexDirection: "row", alignItems: "center", gap: Spacing.md, marginTop: Spacing.lg },
  ctrlSm: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.full },
  ctrlMd: { width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.full },
  ctrlLg: { width: 68, height: 68, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.full, backgroundColor: Colors.dark.accent },
  errText: { color: Colors.dark.error, fontSize: 12, marginTop: Spacing.md, textAlign: "center" },
});
