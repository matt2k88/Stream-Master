import React, {
  useState, useRef, useCallback, useEffect, useMemo,
} from "react";
import {
  View, StyleSheet, FlatList, Pressable, ActivityIndicator,
  Animated, useWindowDimensions, Image,
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
import { xtreamApi, EpgListing, LiveStream, Category } from "@/lib/xtream-api";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// ── Layout constants ────────────────────────────────────────────────────────
const PX_PER_MIN = 3;            // 1 hour = 180 px
const CHANNEL_W = 148;           // fixed channel info column width
const CAT_W = 120;               // categories sidebar width
const ROW_H = 50;                // compact row height
const HEADER_H = 38;             // time-slot header height
const PAST_MINS = 60;            // show 1 hr of past
const FUTURE_MINS = 300;         // show 5 hrs of future
const TOTAL_MINS = PAST_MINS + FUTURE_MINS;
const GRID_W = TOTAL_MINS * PX_PER_MIN; // 1080 px
const NOW_X = PAST_MINS * PX_PER_MIN;   // px of NOW line inside grid

function b64(s: string): string {
  if (!s) return "";
  try { return atob(s); } catch { return s; }
}

function ts2px(ts: number, guideStart: number): number {
  return ((ts - guideStart) / 60) * PX_PER_MIN;
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

// ── EPG block ───────────────────────────────────────────────────────────────
function EpgBlock({ listing, guideStart, onPress }: {
  listing: EpgListing;
  guideStart: number;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const isNow = listing.now_playing === 1;
  const left = ts2px(listing.start_timestamp, guideStart);
  const width = Math.max(((listing.stop_timestamp - listing.start_timestamp) / 60) * PX_PER_MIN - 2, 20);
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
          colors={["rgba(255,102,0,0.30)", "rgba(255,102,0,0.12)"]}
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

// ── Channel row ─────────────────────────────────────────────────────────────
function ChannelRow({ channel, epg, guideStart, scrollX, onChannelPress, onEpgPress }: {
  channel: LiveStream;
  epg: EpgListing[] | null;
  guideStart: number;
  scrollX: Animated.Value;
  onChannelPress: () => void;
  onEpgPress: (listing: EpgListing) => void;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.row}>
      {/* Fixed channel column */}
      <Pressable
        style={[styles.channelCell, focused && styles.channelCellFocused]}
        onPress={onChannelPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        {channel.stream_icon ? (
          <Image source={{ uri: channel.stream_icon }} style={styles.channelIcon} resizeMode="contain" />
        ) : (
          <View style={styles.channelIconPlaceholder}>
            <Feather name="tv" size={14} color={Colors.dark.textSecondary} />
          </View>
        )}
        <ThemedText style={styles.channelName} numberOfLines={2}>{channel.name}</ThemedText>
      </Pressable>

      {/* EPG grid — clipped, translates with scroll */}
      <View style={styles.epgClip}>
        <Animated.View
          style={[styles.epgTrack, { transform: [{ translateX: Animated.multiply(scrollX, -1) }] }]}
        >
          {epg === null ? (
            <ActivityIndicator style={styles.epgSpinner} color={Colors.dark.textSecondary} size="small" />
          ) : epg.length === 0 ? (
            <ThemedText style={styles.noEpgText}>No programme data</ThemedText>
          ) : (
            epg.map((listing, i) => (
              <EpgBlock
                key={i}
                listing={listing}
                guideStart={guideStart}
                onPress={() => onEpgPress(listing)}
              />
            ))
          )}
          {/* Separator line */}
          <View style={styles.rowDivider} />
        </Animated.View>
      </View>
    </View>
  );
}

// ── Category pill ────────────────────────────────────────────────────────────
function CatItem({ cat, selected, onPress }: {
  cat: Category | { category_id: string; category_name: string };
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
      {isActive ? (
        <View style={styles.catActiveBar} />
      ) : null}
      <ThemedText style={[styles.catName, isActive && styles.catNameActive]} numberOfLines={2}>
        {cat.category_name}
      </ThemedText>
    </Pressable>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function TvGuideScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const { liveCategories, liveStreams } = useData();

  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [epgCache, setEpgCache] = useState<Map<number, EpgListing[]>>(new Map());
  const [fetchingSet, setFetchingSet] = useState<Set<number>>(new Set());
  const [clockStr, setClockStr] = useState(fmtHHMM(new Date()));

  // NOW + guide start (1 hr before now)
  const nowRef = useRef(Math.floor(Date.now() / 1000));
  const guideStart = nowRef.current - PAST_MINS * 60;

  // Scroll position (shared between time header & EPG rows via Animated)
  const scrollX = useRef(new Animated.Value(0)).current;
  const headerScrollRef = useRef<any>(null);

  // Time slots for header
  const timeSlots = useMemo(() => buildTimeSlots(guideStart), [guideStart]);

  // Auto-set initial scroll so NOW line is visible
  const initScroll = useRef(false);
  useEffect(() => {
    if (!initScroll.current) {
      initScroll.current = true;
      // Scroll so the now line is at about 20% from left
      const screenEpgW = width - (isLandscape ? CAT_W : 0) - CHANNEL_W;
      const targetScroll = Math.max(0, NOW_X - screenEpgW * 0.2);
      setTimeout(() => {
        headerScrollRef.current?.scrollTo({ x: targetScroll, animated: false });
      }, 100);
    }
  }, [width, isLandscape]);

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setClockStr(fmtHHMM(new Date())), 30000);
    return () => clearInterval(id);
  }, []);

  // All categories + "All Channels"
  const allCat = useMemo(() => ({
    category_id: "__all__",
    category_name: "All Channels",
  }), []);

  const cats = useMemo(() => [allCat, ...liveCategories], [liveCategories, allCat]);

  // Auto-select first category
  useEffect(() => {
    if (selectedCatId === null && cats.length > 0) {
      setSelectedCatId(cats[0].category_id);
    }
  }, [cats, selectedCatId]);

  // Filtered channels
  const channels = useMemo(() => {
    if (!selectedCatId || selectedCatId === "__all__") return liveStreams.slice(0, 200);
    return liveStreams.filter((s) => s.category_id === selectedCatId);
  }, [selectedCatId, liveStreams]);

  // EPG fetcher
  const fetchEpg = useCallback(async (streamId: number) => {
    if (fetchingSet.has(streamId) || epgCache.has(streamId)) return;
    setFetchingSet((prev) => new Set(prev).add(streamId));
    try {
      const data = await xtreamApi.getShortEpg(streamId, 12);
      setEpgCache((prev) => {
        const next = new Map(prev);
        next.set(streamId, data);
        return next;
      });
    } catch {
      setEpgCache((prev) => {
        const next = new Map(prev);
        next.set(streamId, []);
        return next;
      });
    } finally {
      setFetchingSet((prev) => {
        const next = new Set(prev);
        next.delete(streamId);
        return next;
      });
    }
  }, [epgCache, fetchingSet]);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    viewableItems.forEach(({ item }: { item: LiveStream }) => {
      fetchEpg(item.stream_id);
    });
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 30 }).current;

  // Horizontal scroll drives scrollX (attached to the time header ScrollView)
  const onHeaderScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: true }
  );

  const padH = Math.max(insets.left, Spacing.xs);
  const padT = Math.max(insets.top, Spacing.xs);
  const padB = Math.max(insets.bottom, Spacing.xs);

  const renderChannel = useCallback(({ item }: { item: LiveStream }) => {
    const epg = epgCache.has(item.stream_id)
      ? (epgCache.get(item.stream_id) ?? [])
      : null;
    return (
      <ChannelRow
        channel={item}
        epg={epg}
        guideStart={guideStart}
        scrollX={scrollX}
        onChannelPress={() => {
          const url = xtreamApi.getLiveStreamUrl(item.stream_id);
          navigation.navigate("LivePreview", {
            streamId: item.stream_id,
            name: item.name,
            streamUrl: url,
            streamIcon: item.stream_icon,
            categoryId: item.category_id,
          });
        }}
        onEpgPress={() => {
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
  }, [epgCache, guideStart, scrollX, navigation]);

  return (
    <ThemedView style={[styles.container, { paddingTop: padT }]}>
      {/* ── Header bar ─────────────────────────────────────────────────── */}
      <View style={[styles.topBar, { paddingHorizontal: padH }]}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={20} color={Colors.dark.accent} />
        </Pressable>
        <Feather name="tv" size={16} color={Colors.dark.accent} />
        <ThemedText style={styles.topBarTitle}>TV Guide</ThemedText>
        <View style={styles.topBarSpacer} />
        <View style={styles.clockWrap}>
          <Feather name="clock" size={12} color={Colors.dark.textSecondary} />
          <ThemedText style={styles.clockText}>{clockStr}</ThemedText>
        </View>
      </View>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <View style={[styles.body, { paddingBottom: padB }]}>

        {/* Categories sidebar */}
        <View style={styles.catPanel}>
          <FlatList
            data={cats}
            keyExtractor={(c) => c.category_id}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <CatItem
                cat={item}
                selected={item.category_id === selectedCatId}
                onPress={() => setSelectedCatId(item.category_id)}
              />
            )}
          />
        </View>

        {/* EPG main area */}
        <View style={styles.epgArea}>
          {/* Time header — user scrolls this to navigate time */}
          <View style={styles.timeHeaderRow}>
            <View style={styles.channelHeaderCell}>
              <ThemedText style={styles.channelHeaderText}>CHANNEL</ThemedText>
            </View>
            <Animated.ScrollView
              ref={headerScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={onHeaderScroll}
              style={styles.timeHeaderScroll}
              contentContainerStyle={{ width: GRID_W }}
            >
              <View style={[styles.timeHeaderContent, { width: GRID_W }]}>
                <View style={[styles.nowLineLabel, { left: NOW_X - 1 }]}>
                  <View style={styles.nowLineLabelDot} />
                </View>
                {timeSlots.map((slot) => (
                  <View key={slot.label + slot.x} style={[styles.timeSlot, { left: slot.x }]}>
                    <ThemedText style={styles.timeSlotText}>{slot.label}</ThemedText>
                    <View style={styles.timeSlotTick} />
                  </View>
                ))}
              </View>
            </Animated.ScrollView>
          </View>

          {/* Channel rows — scroll vertically only */}
          <FlatList
            data={channels}
            keyExtractor={(item) => String(item.stream_id)}
            renderItem={renderChannel}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Feather name="tv" size={32} color={Colors.dark.textSecondary} />
                <ThemedText style={styles.emptyText}>No channels in this category</ThemedText>
              </View>
            }
          />

          {/* NOW indicator line — translates left as user scrolls right */}
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

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backBtn: {
    width: 34, height: 34,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  topBarTitle: {
    fontSize: 17, fontWeight: "700", color: Colors.dark.text, letterSpacing: 0.3,
  },
  topBarSpacer: { flex: 1 },
  clockWrap: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.dark.border,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
  },
  clockText: { fontSize: 13, fontWeight: "600", color: Colors.dark.text },

  // ── Body ──────────────────────────────────────────────────────────────────
  body: { flex: 1, flexDirection: "row" },

  // ── Categories ─────────────────────────────────────────────────────────────
  catPanel: {
    width: CAT_W,
    borderRightWidth: 1,
    borderRightColor: Colors.dark.border,
  },
  catItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
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
  catName: {
    fontSize: 11, color: Colors.dark.textSecondary, fontWeight: "500",
    marginLeft: Spacing.xs,
  },
  catNameActive: { color: Colors.dark.accent, fontWeight: "700" },

  // ── EPG area ───────────────────────────────────────────────────────────────
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
    width: CHANNEL_W,
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: Colors.dark.border,
  },
  channelHeaderText: {
    fontSize: 9, fontWeight: "700", color: Colors.dark.textSecondary, letterSpacing: 1.5,
  },
  timeHeaderClip: { flex: 1, overflow: "hidden" },
  timeHeaderScroll: { flex: 1 },
  timeHeaderContent: { height: HEADER_H, position: "relative" },
  timeSlot: {
    position: "absolute",
    top: 0, bottom: 0,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingLeft: 4,
  },
  timeSlotText: {
    fontSize: 11, fontWeight: "600", color: Colors.dark.textSecondary,
  },
  timeSlotTick: {
    position: "absolute",
    left: 0, top: 0, bottom: 0,
    width: 1,
    backgroundColor: Colors.dark.border,
  },
  nowLineLabel: {
    position: "absolute",
    top: 4, bottom: 4,
    alignItems: "center",
    zIndex: 10,
  },
  nowLineLabelDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 4,
  },

  // Channel rows
  row: {
    height: ROW_H,
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  channelCell: {
    width: CHANNEL_W,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.xs,
    borderRightWidth: 1,
    borderRightColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  channelCellFocused: {
    backgroundColor: Colors.dark.accentDim,
    borderRightColor: Colors.dark.accent,
  },
  channelIcon: { width: 36, height: 28, borderRadius: 3 },
  channelIconPlaceholder: {
    width: 36, height: 28, borderRadius: 3,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center", alignItems: "center",
  },
  channelName: {
    flex: 1, fontSize: 11, fontWeight: "600", color: Colors.dark.text, lineHeight: 14,
  },

  // EPG content
  epgClip: { flex: 1, overflow: "hidden" },
  epgTrack: {
    position: "absolute",
    left: 0, top: 0, bottom: 0,
    width: GRID_W,
  },
  epgBlock: {
    position: "absolute",
    top: 3, bottom: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundDefault,
    paddingHorizontal: 6,
    justifyContent: "center",
    overflow: "hidden",
  },
  epgBlockNow: { borderColor: "rgba(255,102,0,0.4)" },
  epgBlockFocused: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 6,
    elevation: 6,
  },
  epgBlockTitle: {
    fontSize: 11, fontWeight: "600", color: Colors.dark.textSecondary,
  },
  epgBlockTitleNow: { color: Colors.dark.text },
  epgBlockTime: {
    fontSize: 9, color: Colors.dark.textSecondary, marginTop: 2,
  },
  rowDivider: {
    position: "absolute", left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.dark.border,
  },
  epgSpinner: { marginTop: 12 },
  noEpgText: {
    position: "absolute",
    left: 8, top: 0, bottom: 0,
    textAlignVertical: "center",
    fontSize: 11, color: Colors.dark.textSecondary,
    lineHeight: ROW_H,
  },

  // NOW vertical line
  nowLine: {
    position: "absolute",
    top: HEADER_H,
    bottom: 0,
    width: 2,
    backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 20,
  },

  emptyState: {
    alignItems: "center", justifyContent: "center",
    paddingVertical: 60, gap: Spacing.md,
  },
  emptyText: { color: Colors.dark.textSecondary, fontSize: 14 },
});
