import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Platform, useWindowDimensions } from "react-native";
import AddToPlaylistModal from "@/components/AddToPlaylistModal";
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
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTight = height < 500;
  const {
    current, playState, position, duration, queue, queueIndex,
    pause, resume, next, previous, stop, seek, setExpanded, playQueue,
    reorderQueue,
  } = useMusic();
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    setExpanded(true);
    return () => setExpanded(false);
  }, [setExpanded]);

  // Web — keyboard media keys for play/pause and arrow-skip
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "MediaPlayPause") {
        e.preventDefault();
        playState === "playing" ? pause() : resume();
      } else if (e.code === "MediaTrackNext") { next(); }
      else if (e.code === "MediaTrackPrevious") { previous(); }
      else if (e.code === "ArrowRight") { seek(Math.min((duration || position + 15), position + 15)); }
      else if (e.code === "ArrowLeft") { seek(Math.max(0, position - 15)); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [playState, position, duration, pause, resume, next, previous, seek]);

  // Native Android / Fire TV — remote media keycodes via Pressable onKeyDown.
  // KeyEvent constants: PLAY_PAUSE=85, NEXT=87, PREV=88, REWIND=89, FF=90, PLAY=126, PAUSE=127
  const onTvKey = ({ nativeEvent }: any) => {
    if (Platform.OS !== "android") return;
    const code = nativeEvent?.keyCode;
    if (code === 85 || code === 126 || code === 127) {
      playState === "playing" ? pause() : resume();
    } else if (code === 87) { next(); }
    else if (code === 88) { previous(); }
    else if (code === 90) { seek(Math.min((duration || position + 15), position + 15)); }
    else if (code === 89) { seek(Math.max(0, position - 15)); }
  };

  if (!current) {
    // Track ended / cleared while screen open — bounce back
    navigation.goBack();
    return null;
  }

  const progressPct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  // Compact art size when vertical space is tight (phone landscape).
  const artSize = isLandscape ? (isTight ? 150 : 200) : 220;

  const Artwork = (
    current.artwork_url ? (
      <Image source={{ uri: current.artwork_url }} style={[styles.bigArt, { width: artSize, height: artSize }]} contentFit="cover" />
    ) : (
      <View style={[styles.bigArt, { width: artSize, height: artSize, alignItems: "center", justifyContent: "center" }]}>
        <Feather name="music" size={Math.round(artSize * 0.3)} color={Colors.dark.accent} />
      </View>
    )
  );

  const Controls = (
    <View style={styles.controls}>
      <Pressable
        onPress={() => seek(Math.max(0, position - 15))}
        style={({ pressed, hovered }: any) => [styles.ctrlSm, hovered && styles.ctrlHover, pressed && styles.ctrlPressed]}
      >
        <Feather name="rotate-ccw" size={20} color={Colors.dark.text} />
      </Pressable>
      <Pressable
        onPress={previous}
        style={({ pressed, hovered }: any) => [styles.ctrlMd, hovered && styles.ctrlHover, pressed && styles.ctrlPressed]}
      >
        <Feather name="skip-back" size={26} color={Colors.dark.text} />
      </Pressable>
      <Pressable
        onPress={() => playState === "playing" ? pause() : resume()}
        style={({ pressed, hovered }: any) => [styles.ctrlLg, hovered && styles.ctrlLgHover, pressed && styles.ctrlLgPressed]}
        focusable
        // @ts-ignore — onKeyDown is supported on Android TV / web
        onKeyDown={onTvKey}
        hasTVPreferredFocus
      >
        <Feather name={playState === "playing" ? "pause" : "play"} size={32} color="#fff" />
      </Pressable>
      <Pressable
        onPress={next}
        style={({ pressed, hovered }: any) => [styles.ctrlMd, hovered && styles.ctrlHover, pressed && styles.ctrlPressed]}
      >
        <Feather name="skip-forward" size={26} color={Colors.dark.text} />
      </Pressable>
      <Pressable
        onPress={() => seek(Math.min(duration || position + 15, position + 15))}
        style={({ pressed, hovered }: any) => [styles.ctrlSm, hovered && styles.ctrlHover, pressed && styles.ctrlPressed]}
      >
        <Feather name="rotate-cw" size={20} color={Colors.dark.text} />
      </Pressable>
    </View>
  );

  const InfoBlock = (
    <>
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

      {Controls}

      {playState === "error" ? (
        <ThemedText style={styles.errText}>Couldn't load this track. Skip to next?</ThemedText>
      ) : null}

      <Pressable onPress={() => setAddOpen(true)} style={styles.addBtn}>
        <Feather name="plus" size={16} color={Colors.dark.text} />
        <ThemedText style={styles.addBtnText}>Add to Playlist</ThemedText>
      </Pressable>
    </>
  );

  const QueueBlock = queue.length > 1 ? (
    <View style={[styles.queueWrap, isLandscape && { paddingHorizontal: Spacing.md, marginTop: Spacing.md }]}>
      <ThemedText style={styles.queueTitle}>Up Next</ThemedText>
      {queue.map((t, i) => i === queueIndex ? null : (
        <View key={`${t.itunes_track_id}-${i}`} style={styles.qRow}>
          <Pressable onPress={() => playQueue(queue, i)} style={{ flexDirection: "row", flex: 1, alignItems: "center", gap: Spacing.md }}>
            <ThemedText style={styles.qIdx}>{i + 1}</ThemedText>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.qTitle} numberOfLines={1}>{t.title}</ThemedText>
              <ThemedText style={styles.qArtist} numberOfLines={1}>{t.artist}</ThemedText>
            </View>
          </Pressable>
          <Pressable onPress={() => reorderQueue(i, Math.max(0, i - 1))} disabled={i === 0} style={[styles.qBtn, i === 0 && { opacity: 0.3 }]}>
            <Feather name="chevron-up" size={16} color={Colors.dark.textSecondary} />
          </Pressable>
          <Pressable onPress={() => reorderQueue(i, Math.min(queue.length - 1, i + 1))} disabled={i === queue.length - 1} style={[styles.qBtn, i === queue.length - 1 && { opacity: 0.3 }]}>
            <Feather name="chevron-down" size={16} color={Colors.dark.textSecondary} />
          </Pressable>
        </View>
      ))}
    </View>
  ) : null;

  const Header = (
    <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
      <Pressable
        onPress={() => navigation.goBack()}
        style={({ pressed, hovered }: any) => [styles.iconBtn, hovered && styles.iconBtnHover, pressed && styles.iconBtnPressed]}
      >
        <Feather name="chevron-down" size={24} color={Colors.dark.text} />
      </Pressable>
      <ThemedText style={styles.headerTitle}>Now Playing</ThemedText>
      <Pressable
        onPress={() => { stop(); navigation.goBack(); }}
        style={({ pressed, hovered }: any) => [styles.iconBtn, hovered && styles.iconBtnHover, pressed && styles.iconBtnPressed]}
      >
        <Feather name="x" size={20} color={Colors.dark.text} />
      </Pressable>
    </View>
  );

  if (isLandscape) {
    return (
      <ThemedView style={styles.container}>
        {Header}
        <View style={styles.landscapeBody}>
          <View style={styles.landscapeArtCol}>
            {Artwork}
          </View>
          <ScrollView
            style={styles.landscapeInfoCol}
            contentContainerStyle={{
              paddingHorizontal: Spacing.lg,
              paddingBottom: insets.bottom + Spacing.lg,
              alignItems: "center",
            }}
            showsVerticalScrollIndicator={false}
          >
            {InfoBlock}
            {QueueBlock}
          </ScrollView>
        </View>
        <AddToPlaylistModal track={addOpen ? current : null} onClose={() => setAddOpen(false)} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {Header}
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.metaWrap}>
          {Artwork}
          {InfoBlock}
        </View>
        {QueueBlock}
      </ScrollView>
      <AddToPlaylistModal track={addOpen ? current : null} onClose={() => setAddOpen(false)} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.md },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: BorderRadius.full, backgroundColor: Colors.dark.backgroundDefault, borderWidth: 1, borderColor: Colors.dark.border },
  iconBtnHover: { borderColor: Colors.dark.accent, backgroundColor: "#1A1A1A" },
  iconBtnPressed: { opacity: 0.7 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: Colors.dark.text, textAlign: "center" },
  metaWrap: { paddingHorizontal: Spacing.xl, alignItems: "center", gap: Spacing.sm, marginTop: Spacing.lg },
  bigArt: { borderRadius: BorderRadius.md, backgroundColor: "#1A1A1A", marginBottom: Spacing.md },
  landscapeBody: { flex: 1, flexDirection: "row", paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.lg },
  landscapeArtCol: { alignItems: "center", justifyContent: "center" },
  landscapeInfoCol: { flex: 1 },
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
  ctrlHover: { backgroundColor: "rgba(255,102,0,0.15)" },
  ctrlPressed: { opacity: 0.6 },
  ctrlLgHover: { backgroundColor: "#FF7A1F" },
  ctrlLgPressed: { opacity: 0.8 },
  errText: { color: Colors.dark.error, fontSize: 12, marginTop: Spacing.md, textAlign: "center" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.dark.border, marginTop: Spacing.md },
  addBtnText: { color: Colors.dark.text, fontSize: 12, fontWeight: "600" },
  queueWrap: { paddingHorizontal: Spacing.xl, marginTop: Spacing.lg },
  queueTitle: { color: Colors.dark.text, fontSize: 14, fontWeight: "700", marginBottom: Spacing.sm },
  qRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md, paddingVertical: 6 },
  qIdx: { color: Colors.dark.textSecondary, fontSize: 12, width: 20 },
  qTitle: { color: Colors.dark.text, fontSize: 13, fontWeight: "600" },
  qArtist: { color: Colors.dark.textSecondary, fontSize: 11 },
  qBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
});
