import React, {
  useState, useRef, useCallback, useEffect, useMemo,
} from "react";
import {
  View, StyleSheet, FlatList, Pressable, Animated,
  PanResponder, useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import { useData } from "@/contexts/DataContext";
import { ActivityIndicator } from "react-native";
import { xtreamApi, EpgListing, LiveStream } from "@/lib/xtream-api";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// ── Layout constants ─────────────────────────────────────────────────────────
const PX_PER_MIN = 3;
const CHANNEL_W = 148;
const CAT_W = 118;
const ROW_H = 50;
const HEADER_H = 44;
const PAST_MINS = 60;
const FUTURE_MINS = 300;
const TOTAL_MINS = PAST_MINS + FUTURE_MINS;
const GRID_W = TOTAL_MINS * PX_PER_MIN;
const NOW_X = PAST_MINS * PX_PER_MIN;
const SCROLL_STEP = 180; // 1 hour per button press

function b64(s: string): string {
  if (!s) return "";
  try { return atob(s); } catch { return s; }
}

function fmtHHMM(date: Date): string {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

function buildTimeSlots(guideStart: number): { label: string; x: number }[] {
  const slots: { label: string; x: number }[] = [];
  const d = new Date(guideStart * 1000);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  while (true) {
    const offsetMin = (d.getTime() / 1000 - guideStart) / 60;
    const x = offsetMin * PX_PER_MIN;
    if (x > GRID_W + 180) break;
    slots.push({ label: fmtHHMM(d), x });
    d.setHours(d.getHours() + 1);
  }
  return slots;
}

// ── EPG block ────────────────────────────────────────────────────────────────
function EpgBlock({ listing, guideStart, onPress }: {
  listing: EpgListing;
  guideStart: number;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const isNow = listing.now_playing === 1;
  const left = ((listing.start_timestamp - guideStart) / 60) * PX_PER_MIN;
  const width = Math.max(((listing.stop_timestamp - listing.start_timestamp) / 60) * PX_PER_MIN - 2, 24);
  const title = b64(listing.title) || "No info";

  return (
    <Pressable
      style={[styles.epgBlock, { left, width }, isNow && styles.epgBlockNow, focused && styles.epgBlockFocused]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {isNow ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.22)", "rgba(255,102,0,0.06)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      ) : null}
      {focused ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.32)", "rgba(255,102,0,0.14)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      ) : null}
      <ThemedText style={[styles.epgBlockTitle, isNow && styles.epgBlockTitleNow]} numberOfLines={1}>
        {title}
      </ThemedText>
      <ThemedText style={styles.epgBlockTime} numberOfLines={1}>
        {fmtHHMM(new Date(listing.start_timestamp * 1000))}
        {" – "}
        {fmtHHMM(new Date(listing.stop_timestamp * 1000))}
      </ThemedText>
    </Pressable>
  );
}

// ── Channel row ──────────────────────────────────────────────────────────────
function ChannelRow({ channel, epg, guideStart, scrollX, onPress }: {
  channel: LiveStream;
  epg: EpgListing[];
  guideStart: number;
  scrollX: Animated.Value;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.row}>
      <Pressable
        style={[styles.channelCell, focused && styles.channelCellFocused]}
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <ThemedText style={styles.channelName} numberOfLines={2}>{channel.name}</ThemedText>
      </Pressable>

      <View style={styles.epgClip}>
        <Animated.View
          style={[styles.epgTrack, { transform: [{ translateX: Animated.multiply(scrollX, -1) }] }]}
        >
          {epg.length === 0 ? (
            <ThemedText style={styles.noEpgText}>No programme data</ThemedText>
          ) : (
            epg.map((listing, i) => (
              <EpgBlock
                key={i}
                listing={listing}
                guideStart={guideStart}
                onPress={onPress}
              />
            ))
          )}
        </Animated.View>
      </View>
    </View>
  );
}

// ── Category item ────────────────────────────────────────────────────────────
function CatItem({ name, selected, onPress }: {
  name: string;
  selected: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const isActive = selected || focused;
  return (
    <Pressable
      style={[styles.catItem, isActive && styles.catItemActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {isActive ? <View style={styles.catActiveBar} /> : null}
      <ThemedText style={[styles.catName, isActive && styles.catNameActive]} numberOfLines={2}>
        {name}
      </ThemedText>
    </Pressable>
  );
}

// ── Top bar icon button with hover/focus overlay ──────────────────────────────
function TopBarBtn({
  onPress,
  disabled,
  dimWhenDisabled,
  children,
}: {
  onPress: () => void;
  disabled?: boolean;
  dimWhenDisabled?: boolean;
  children: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = (focused || pressed) && !disabled;
  return (
    <Pressable
      style={[styles.topBarBtn, isActive && styles.topBarBtnActive, dimWhenDisabled && disabled && { opacity: 0.5 }]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
    >
      {isActive ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.22)", "rgba(255,102,0,0.08)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}
      {children}
    </Pressable>
  );
}

// ── Scroll button (TV remote + touch) ────────────────────────────────────────
function ScrollBtn({ icon, onPress }: { icon: "chevron-left" | "chevron-right"; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[styles.scrollBtn, isActive && styles.scrollBtnActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <Feather name={icon} size={16} color={isActive ? Colors.dark.accent : Colors.dark.textSecondary} />
    </Pressable>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function TvGuideScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { width } = useWindowDimensions();
  const { liveCategories, liveStreams, epgData, refreshEpg, isEpgRefreshing } = useData();

  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [clockStr, setClockStr] = useState(fmtHHMM(new Date()));

  const nowRef = useRef(Math.floor(Date.now() / 1000));
  const guideStart = nowRef.current - PAST_MINS * 60;

  // Scroll state
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollOffset = useRef(0);
  const epgAreaWidth = width - CAT_W - CHANNEL_W;
  const maxScroll = Math.max(0, GRID_W - epgAreaWidth);

  function doScrollTo(x: number, animated = false) {
    const clamped = Math.max(0, Math.min(x, maxScroll));
    scrollOffset.current = clamped;
    if (animated) {
      Animated.timing(scrollX, { toValue: clamped, duration: 200, useNativeDriver: true }).start();
    } else {
      scrollX.setValue(clamped);
    }
  }

  // PanResponder for horizontal swipe on the EPG content area
  const dragStart = useRef(0);
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > Math.abs(g.dy) + 4,
      onPanResponderGrant: () => {
        dragStart.current = scrollOffset.current;
      },
      onPanResponderMove: (_, g) => {
        doScrollTo(dragStart.current - g.dx);
      },
      onPanResponderRelease: () => {
        dragStart.current = scrollOffset.current;
      },
    })
  ).current;

  // Time slots
  const timeSlots = useMemo(() => buildTimeSlots(guideStart), [guideStart]);

  // Initial scroll to show NOW at ~20% from left
  useEffect(() => {
    const target = Math.max(0, NOW_X - epgAreaWidth * 0.2);
    doScrollTo(target);
  }, [epgAreaWidth]);

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setClockStr(fmtHHMM(new Date())), 30000);
    return () => clearInterval(id);
  }, []);

  // Categories — no "All Channels" pseudo-entry
  const cats = useMemo(() => liveCategories, [liveCategories]);

  useEffect(() => {
    if (selectedCatId === null && cats.length > 0) {
      setSelectedCatId(cats[0].category_id);
    }
  }, [cats, selectedCatId]);

  // Filtered channels
  const channels = useMemo(() => {
    if (!selectedCatId) return [];
    return liveStreams.filter((s) => s.category_id === selectedCatId);
  }, [selectedCatId, liveStreams]);

  const padH = Math.max(insets.left, Spacing.xs);
  const padT = Math.max(insets.top, Spacing.xs);
  const padB = Math.max(insets.bottom, Spacing.xs);

  const renderChannel = useCallback(({ item }: { item: LiveStream }) => {
    const epg = epgData[item.stream_id] ?? [];
    return (
      <ChannelRow
        channel={item}
        epg={epg}
        guideStart={guideStart}
        scrollX={scrollX}
        onPress={() => {
          const url = xtreamApi.getLiveStreamUrl(item.stream_id);
          navigation.navigate("LivePreview", {
            streamId: item.stream_id,
            name: item.name,
            streamUrl: url,
            streamIcon: item.stream_icon,
            categoryId: item.category_id,
          });
        }}
      />
    );
  }, [epgData, guideStart, scrollX, navigation]);

  return (
    <ThemedView style={[styles.container, { paddingTop: padT }]}>
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <View style={[styles.topBar, { paddingHorizontal: padH }]}>
        <TopBarBtn onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={18} color={Colors.dark.accent} />
        </TopBarBtn>
        <Feather name="calendar" size={14} color={Colors.dark.accent} />
        <ThemedText style={styles.topBarTitle}>TV Guide</ThemedText>
        <View style={styles.topBarSpacer} />
        {/* TV Guide refresh button */}
        <TopBarBtn onPress={refreshEpg} disabled={isEpgRefreshing} dimWhenDisabled>
          {isEpgRefreshing
            ? <ActivityIndicator size="small" color={Colors.dark.accent} />
            : <Feather name="refresh-cw" size={14} color={Colors.dark.textSecondary} />}
        </TopBarBtn>
        {/* TV-remote scroll buttons */}
        <ScrollBtn icon="chevron-left" onPress={() => doScrollTo(scrollOffset.current - SCROLL_STEP, true)} />
        <ScrollBtn icon="chevron-right" onPress={() => doScrollTo(scrollOffset.current + SCROLL_STEP, true)} />
        <View style={styles.clockWrap}>
          <Feather name="clock" size={11} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.clockText}>{clockStr}</ThemedText>
        </View>
      </View>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <View style={[styles.body, { paddingBottom: padB }]}>

        {/* Categories sidebar */}
        <View style={styles.catPanel}>
          <FlatList
            data={cats}
            keyExtractor={(c) => c.category_id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <CatItem
                name={item.category_name}
                selected={item.category_id === selectedCatId}
                onPress={() => setSelectedCatId(item.category_id)}
              />
            )}
          />
        </View>

        {/* EPG area */}
        <View style={styles.epgArea}>
          {/* Time header (translated by scrollX) */}
          <View style={styles.timeHeaderRow}>
            <View style={styles.channelHeaderCell}>
              <ThemedText style={styles.channelHeaderText}>CHANNEL</ThemedText>
            </View>
            <View style={styles.timeHeaderClip}>
              <Animated.View
                style={[
                  styles.timeHeaderContent,
                  { width: GRID_W, transform: [{ translateX: Animated.multiply(scrollX, -1) }] },
                ]}
              >
                {/* NOW dot */}
                <View style={[styles.nowDot, { left: NOW_X - 3 }]} />
                {timeSlots.map((slot) => (
                  <View key={slot.x} style={[styles.timeSlot, { left: slot.x }]}>
                    <ThemedText style={styles.timeSlotText}>{slot.label}</ThemedText>
                    <View style={styles.timeSlotTick} />
                  </View>
                ))}
              </Animated.View>
            </View>
          </View>

          {/* Channel rows — swipe-able via PanResponder */}
          <View style={{ flex: 1 }} {...panResponder.panHandlers}>
            <FlatList
              data={channels}
              keyExtractor={(item) => String(item.stream_id)}
              renderItem={renderChannel}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Feather name="tv" size={28} color={Colors.dark.textSecondary} />
                  <ThemedText style={styles.emptyText}>No channels in this category</ThemedText>
                </View>
              }
            />
          </View>

          {/* NOW vertical line */}
          <Animated.View
            style={[
              styles.nowLine,
              {
                left: CHANNEL_W + NOW_X,
                transform: [{ translateX: Animated.multiply(scrollX, -1) }],
              },
            ]}
            pointerEvents="none"
          />
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },

  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  topBarBtn: {
    width: 32, height: 32, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
    overflow: "hidden",
  },
  topBarBtnActive: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 8,
    elevation: 6,
  },
  topBarTitle: { fontSize: 16, fontWeight: "700", color: Colors.dark.text },
  topBarSpacer: { flex: 1 },
  scrollBtn: {
    width: 32, height: 32, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  scrollBtnActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accentDim,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 8,
    elevation: 6,
  },
  clockWrap: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.dark.border,
    paddingHorizontal: Spacing.sm, paddingVertical: 5,
  },
  clockText: { fontSize: 13, fontWeight: "600", color: Colors.dark.text },

  // Body
  body: { flex: 1, flexDirection: "row" },

  // Categories
  catPanel: {
    width: CAT_W,
    borderRightWidth: 1,
    borderRightColor: Colors.dark.border,
  },
  catItem: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: Spacing.sm, paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
    overflow: "hidden",
  },
  catItemActive: { backgroundColor: Colors.dark.backgroundDefault },
  catActiveBar: {
    position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
    backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 4,
  },
  catName: { fontSize: 11, color: Colors.dark.textSecondary, fontWeight: "500", marginLeft: Spacing.xs },
  catNameActive: { color: Colors.dark.accent, fontWeight: "700" },

  // EPG area
  epgArea: { flex: 1, overflow: "hidden" },

  // Time header
  timeHeaderRow: {
    height: HEADER_H,
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  channelHeaderCell: {
    width: CHANNEL_W, justifyContent: "center", alignItems: "center",
    borderRightWidth: 1, borderRightColor: Colors.dark.border,
  },
  channelHeaderText: { fontSize: 9, fontWeight: "700", color: Colors.dark.textSecondary, letterSpacing: 1.5 },
  timeHeaderClip: { flex: 1, overflow: "hidden" },
  timeHeaderContent: { height: HEADER_H, position: "relative" },
  nowDot: {
    position: "absolute",
    top: 6,
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 4,
  },
  timeSlot: {
    position: "absolute", top: 0, bottom: 0,
    alignItems: "flex-start", justifyContent: "center", paddingLeft: 5,
  },
  timeSlotText: { fontSize: 12, fontWeight: "600", color: Colors.dark.textSecondary },
  timeSlotTick: {
    position: "absolute", left: 0, top: 0, bottom: 0,
    width: 1, backgroundColor: Colors.dark.border,
  },

  // Channel rows
  row: {
    height: ROW_H, flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  channelCell: {
    width: CHANNEL_W, justifyContent: "center",
    paddingHorizontal: Spacing.sm,
    borderRightWidth: 1, borderRightColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  channelCellFocused: {
    backgroundColor: Colors.dark.accentDim,
    borderRightColor: Colors.dark.accent,
  },
  channelName: { fontSize: 11, fontWeight: "600", color: Colors.dark.text, lineHeight: 15 },

  // EPG content
  epgClip: { flex: 1, overflow: "hidden" },
  epgTrack: {
    position: "absolute", left: 0, top: 0, bottom: 0, width: GRID_W,
  },
  epgBlock: {
    position: "absolute", top: 3, bottom: 3,
    borderRadius: 4, borderWidth: 1, borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundDefault,
    paddingHorizontal: 6, justifyContent: "center", overflow: "hidden",
  },
  epgBlockNow: { borderColor: "rgba(255,102,0,0.45)" },
  epgBlockFocused: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 6,
    elevation: 6,
  },
  epgBlockTitle: { fontSize: 11, fontWeight: "600", color: Colors.dark.textSecondary },
  epgBlockTitleNow: { color: Colors.dark.text },
  epgBlockTime: { fontSize: 9, color: Colors.dark.textSecondary, marginTop: 2 },
  noEpgText: {
    position: "absolute", left: 8,
    fontSize: 11, color: Colors.dark.textSecondary,
    lineHeight: ROW_H, top: 0,
  },

  // NOW line
  nowLine: {
    position: "absolute", top: HEADER_H, bottom: 0, width: 2,
    backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 6,
    elevation: 8, zIndex: 20,
  },

  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: Spacing.md },
  emptyText: { color: Colors.dark.textSecondary, fontSize: 14 },
});
