// Multi Screen — grid player.
//
// Renders 2/3/4 video slots in the layout the user picked on the previous
// screen. Each slot is either empty (shows an "Add channel" button) or
// holds an expo-video player streaming a Live TV channel.
//
// Audio: only ONE slot is "focused" at any time, and that slot is
// unmuted. Every other slot continues to play but is muted. Tapping any
// slot focuses it (and steals audio from the previous one).
//
// We use the expo engine here unconditionally — running multiple VLC
// native instances at once is fragile, and Multi Screen is bandwidth-
// and-CPU heavy enough already.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useVideoPlayer, VideoView } from "@/lib/video-player";
import { xtreamApi, LiveStream } from "@/lib/xtream-api";
import { multiScreenBus } from "@/lib/multiscreen-bus";
import type { MultiLayout } from "@/screens/MultiScreenLayoutScreen";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, "MultiScreen">;

const SLOT_COUNT: Record<MultiLayout, number> = {
  "2h": 2,
  "2v": 2,
  "3-2t1b": 3,
  "3-1t2b": 3,
  "4": 4,
};

export default function MultiScreenScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const layout = route.params.layout;
  const slotCount = SLOT_COUNT[layout];

  // One stream per slot (null = empty)
  const [slots, setSlots] = useState<(LiveStream | null)[]>(() =>
    Array.from({ length: slotCount }, () => null),
  );
  const [focusedSlot, setFocusedSlot] = useState(0);
  // Only ever set hasTVPreferredFocus on the very first slot at mount —
  // never on re-renders, otherwise it keeps stealing focus on TV remotes.
  const initialFocusSlot = useRef(0);

  // Listen for picks from MultiScreenPicker
  useEffect(() => {
    multiScreenBus.setListener(({ slotIndex, stream }) => {
      if (slotIndex < 0 || slotIndex >= slotCount) return;
      setSlots((prev) => {
        const next = [...prev];
        next[slotIndex] = stream;
        return next;
      });
      setFocusedSlot(slotIndex);
    });
    return () => multiScreenBus.setListener(null);
  }, [slotCount]);

  const openPicker = useCallback(
    (slotIndex: number) => {
      navigation.navigate("MultiScreenPicker", { slotIndex });
    },
    [navigation],
  );

  return (
    <View style={[styles.container]}>
      <StatusBar hidden />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm, paddingHorizontal: Math.max(insets.left, Spacing.lg) }]}>
        <BackBtn onPress={() => navigation.goBack()} />
        <ThemedText style={styles.title}>Multi Screen</ThemedText>
        <View style={styles.audioBadge}>
          <Feather name="volume-2" size={12} color={Colors.dark.accent} />
          <ThemedText style={styles.audioBadgeText}>Slot {focusedSlot + 1}</ThemedText>
        </View>
      </View>

      {/* Grid */}
      <View style={[styles.gridWrap, {
        paddingHorizontal: Math.max(insets.left, Spacing.sm),
        paddingBottom: insets.bottom + Spacing.sm,
      }]}>
        <Grid
          layout={layout}
          slots={slots}
          focusedSlot={focusedSlot}
          initialFocusSlot={initialFocusSlot.current}
          onFocusSlot={setFocusedSlot}
          onAddSlot={openPicker}
          onClearSlot={(i) => setSlots((prev) => { const n = [...prev]; n[i] = null; return n; })}
        />
      </View>
    </View>
  );
}

// ─── Grid: arrange slots according to layout ────────────────────────────────
function Grid({ layout, slots, focusedSlot, onFocusSlot, onAddSlot, onClearSlot, initialFocusSlot }: {
  layout: MultiLayout;
  slots: (LiveStream | null)[];
  focusedSlot: number;
  onFocusSlot: (i: number) => void;
  onAddSlot: (i: number) => void;
  onClearSlot: (i: number) => void;
  initialFocusSlot: number;
}) {
  const slot = (i: number) => (
    <Slot
      key={i}
      index={i}
      stream={slots[i]}
      focused={focusedSlot === i}
      onFocus={() => onFocusSlot(i)}
      onAdd={() => onAddSlot(i)}
      onClear={() => onClearSlot(i)}
      isInitialPreferred={i === initialFocusSlot}
    />
  );

  switch (layout) {
    case "2h":
      return <View style={gridStyles.row}>{slot(0)}{slot(1)}</View>;
    case "2v":
      return <View style={gridStyles.col}>{slot(0)}{slot(1)}</View>;
    case "3-2t1b":
      return (
        <View style={gridStyles.col}>
          <View style={gridStyles.row}>{slot(0)}{slot(1)}</View>
          <View style={gridStyles.row}>{slot(2)}</View>
        </View>
      );
    case "3-1t2b":
      return (
        <View style={gridStyles.col}>
          <View style={gridStyles.row}>{slot(0)}</View>
          <View style={gridStyles.row}>{slot(1)}{slot(2)}</View>
        </View>
      );
    case "4":
      return (
        <View style={gridStyles.col}>
          <View style={gridStyles.row}>{slot(0)}{slot(1)}</View>
          <View style={gridStyles.row}>{slot(2)}{slot(3)}</View>
        </View>
      );
  }
}

// ─── Slot: empty (Add) or video player ─────────────────────────────────────
function Slot({ index, stream, focused, onFocus, onAdd, onClear, isInitialPreferred }: {
  index: number;
  stream: LiveStream | null;
  focused: boolean;
  onFocus: () => void;
  onAdd: () => void;
  onClear: () => void;
  isInitialPreferred: boolean;
}) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const hot = hover || pressed || focused;

  return (
    <View
      style={[gridStyles.slot, hot && gridStyles.slotActive, focused && gridStyles.slotFocused]}
    >
      {stream ? (
        <SlotPlayer
          stream={stream}
          muted={!focused}
          onPress={onFocus}
          onFocusSlot={onFocus}
          onClear={onClear}
          slotIndex={index}
          isInitialPreferred={isInitialPreferred}
          onHoverIn={() => setHover(true)}
          onHoverOut={() => setHover(false)}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
        />
      ) : (
        <Pressable
          style={gridStyles.empty}
          onPress={onAdd}
          onFocus={onFocus}
          onHoverIn={() => setHover(true)}
          onHoverOut={() => setHover(false)}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          hasTVPreferredFocus={isInitialPreferred}
        >
          <View style={[gridStyles.addCircle, hot && gridStyles.addCircleHot]}>
            <Feather name="plus" size={26} color={hot ? "#fff" : Colors.dark.accent} />
          </View>
          <ThemedText style={gridStyles.emptyText}>Add Channel</ThemedText>
          <ThemedText style={gridStyles.emptyHint}>Slot {index + 1}</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

// ─── Single slot's expo-video player ────────────────────────────────────────
function SlotPlayer({
  stream, muted, onPress, onFocusSlot, onClear, slotIndex, isInitialPreferred,
  onHoverIn, onHoverOut, onPressIn, onPressOut,
}: {
  stream: LiveStream;
  muted: boolean;
  onPress: () => void;
  onFocusSlot: () => void;
  onClear: () => void;
  slotIndex: number;
  isInitialPreferred: boolean;
  onHoverIn?: () => void;
  onHoverOut?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
}) {
  const url = useMemo(() => xtreamApi.getLiveStreamUrl(stream.stream_id), [stream.stream_id]);
  const playerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);

  const player = useVideoPlayer(url, (p: any) => {
    playerRef.current = p;
    p.loop = false;
    p.muted = muted;
    try { p.play(); } catch {}
  }, { engine: "expo" });

  // Listener + safety timeout for "stopped loading" state — kept here in
  // an explicit effect with deterministic cleanup, rather than relying on
  // the setup callback's return value (the shim does not invoke it).
  useEffect(() => {
    if (!player) return;
    let cancelled = false;
    let sub: { remove?: () => void } | undefined;
    try {
      sub = (player as any).addListener?.("playingChange", (ev: any) => {
        if (!cancelled && ev?.isPlaying) setLoading(false);
      });
    } catch {}
    const t = setTimeout(() => { if (!cancelled) setLoading(false); }, 4000);
    return () => {
      cancelled = true;
      clearTimeout(t);
      try { sub?.remove?.(); } catch {}
    };
  }, [player]);

  // Update mute when focus changes
  useEffect(() => {
    try { if (playerRef.current) playerRef.current.muted = muted; } catch {}
  }, [muted]);

  // Pause and release players when this slot unmounts (clear / nav back)
  useEffect(() => {
    return () => {
      try { playerRef.current?.pause?.(); } catch {}
      try { playerRef.current?.release?.(); } catch {}
    };
  }, []);

  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={onPress}
      onFocus={onFocusSlot}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hasTVPreferredFocus={isInitialPreferred}
    >
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        contentFit="contain"
        nativeControls={false}
        engine="expo"
      />

      {loading ? (
        <View style={gridStyles.slotLoading} pointerEvents="none">
          <ActivityIndicator color={Colors.dark.accent} />
        </View>
      ) : null}

      {/* Slot label */}
      <View style={gridStyles.slotLabel} pointerEvents="none">
        <View style={gridStyles.slotLogo}>
          {stream.stream_icon ? (
            <Image source={{ uri: stream.stream_icon }} style={StyleSheet.absoluteFill} contentFit="contain" />
          ) : (
            <Feather name="tv" size={12} color="#fff" />
          )}
        </View>
        <ThemedText style={gridStyles.slotName} numberOfLines={1}>{stream.name}</ThemedText>
        {muted ? <Feather name="volume-x" size={12} color="rgba(255,255,255,0.7)" /> : <Feather name="volume-2" size={12} color={Colors.dark.accent} />}
      </View>

      {/* Clear button */}
      <ClearBtn onPress={onClear} />
    </Pressable>
  );
}

function ClearBtn({ onPress }: { onPress: () => void }) {
  const [hot, setHot] = useState(false);
  return (
    <Pressable
      style={[gridStyles.clearBtn, hot && gridStyles.clearBtnHot]}
      onPress={onPress}
      onFocus={() => setHot(true)}
      onBlur={() => setHot(false)}
      onHoverIn={() => setHot(true)}
      onHoverOut={() => setHot(false)}
    >
      <Feather name="x" size={14} color="#fff" />
    </Pressable>
  );
}

function BackBtn({ onPress }: { onPress: () => void }) {
  const [hot, setHot] = useState(false);
  return (
    <Pressable
      style={[styles.backBtn, hot && styles.backBtnActive]}
      onPress={onPress}
      onFocus={() => setHot(true)}
      onBlur={() => setHot(false)}
      onHoverIn={() => setHot(true)}
      onHoverOut={() => setHot(false)}
    >
      <Feather name="arrow-left" size={18} color={hot ? Colors.dark.accent : "#fff"} />
    </Pressable>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  topBar: { flexDirection: "row", alignItems: "center", gap: Spacing.md, paddingBottom: Spacing.sm },
  title: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "700" },

  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    justifyContent: "center", alignItems: "center",
  },
  backBtnActive: { borderColor: Colors.dark.accent, backgroundColor: "rgba(255,102,0,0.2)" },

  audioBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,102,0,0.15)",
    borderWidth: 1, borderColor: "rgba(255,102,0,0.4)",
  },
  audioBadgeText: { color: Colors.dark.accent, fontSize: 11, fontWeight: "700" },

  gridWrap: { flex: 1 },
});

const SLOT_GAP = 6;

const gridStyles = StyleSheet.create({
  row: { flex: 1, flexDirection: "row", gap: SLOT_GAP },
  col: { flex: 1, flexDirection: "column", gap: SLOT_GAP },

  slot: {
    flex: 1,
    backgroundColor: "#000",
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  slotActive: { borderColor: "rgba(255,102,0,0.55)" },
  slotFocused: {
    borderColor: Colors.dark.accent,
    shadowColor: Colors.dark.accent,
    shadowOpacity: 1, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },

  empty: {
    flex: 1,
    justifyContent: "center", alignItems: "center", gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  addCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(255,102,0,0.1)",
    borderWidth: 2, borderColor: Colors.dark.accent,
    justifyContent: "center", alignItems: "center",
  },
  addCircleHot: { backgroundColor: Colors.dark.accent },
  emptyText: { color: Colors.dark.text, fontSize: 13, fontWeight: "700" },
  emptyHint: { color: Colors.dark.textSecondary, fontSize: 11 },

  slotLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center", alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },

  slotLabel: {
    position: "absolute",
    left: 8, right: 56, bottom: 8,
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: BorderRadius.sm,
  },
  slotLogo: {
    width: 22, height: 16, borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "center", alignItems: "center", overflow: "hidden",
  },
  slotName: { flex: 1, color: "#fff", fontSize: 11, fontWeight: "600" },

  clearBtn: {
    position: "absolute", top: 8, right: 8,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    justifyContent: "center", alignItems: "center",
  },
  clearBtnHot: { borderColor: "#FF3B3B", backgroundColor: "rgba(255,59,59,0.4)" },
});
