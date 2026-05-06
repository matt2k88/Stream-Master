import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  View, StyleSheet, FlatList, Pressable, ActivityIndicator,
  ScrollView, useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { xtreamApi, EpgListing, LiveStream, Category } from "@/lib/xtream-api";
import { useData } from "@/contexts/DataContext";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const SIDEBAR_W = 170;
const DAY_TAB_H = 46;

function b64(s: string): string {
  if (!s) return "";
  try { return atob(s); } catch { return s; }
}

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function fmtDayTab(date: Date, isToday: boolean): string {
  if (isToday) return "Today";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}

// ── Sidebar category item ─────────────────────────────────────────────────────
function CatItem({
  cat, isSelected, onPress,
}: { cat: Category; isSelected: boolean; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed || isSelected;
  return (
    <Pressable
      style={[styles.catItem, isSelected && styles.catItemSelected, isActive && !isSelected && styles.catItemFocused]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      {isSelected ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.18)", "rgba(255,102,0,0.06)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}
      {isSelected ? <View style={styles.catItemAccent} /> : null}
      <ThemedText
        style={[styles.catItemText, isSelected && styles.catItemTextSelected]}
        numberOfLines={2}
      >
        {cat.category_name}
      </ThemedText>
    </Pressable>
  );
}

// ── Channel card (shown in channel list) ─────────────────────────────────────
function ChannelCard({ stream, onPress }: { stream: LiveStream; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[styles.channelCard, isActive && styles.channelCardActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      {isActive ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.15)", "rgba(255,102,0,0.04)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}
      <View style={styles.channelIconWrap}>
        {stream.stream_icon ? (
          <Image source={{ uri: stream.stream_icon }} style={styles.channelIcon} contentFit="contain" />
        ) : (
          <Feather name="tv" size={22} color={isActive ? Colors.dark.accent : Colors.dark.textSecondary} />
        )}
      </View>
      <ThemedText style={[styles.channelName, isActive && styles.channelNameActive]} numberOfLines={2}>
        {stream.name}
      </ThemedText>
      <View style={styles.archiveBadge}>
        <Feather name="clock" size={10} color={Colors.dark.accent} />
        <ThemedText style={styles.archiveBadgeText}>{stream.tv_archive_duration}d</ThemedText>
      </View>
    </Pressable>
  );
}

// ── Day tab ───────────────────────────────────────────────────────────────────
function DayTab({ label, isSelected, onPress }: { label: string; isSelected: boolean; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[styles.dayTab, isSelected && styles.dayTabSelected, isActive && !isSelected && styles.dayTabFocused]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      <ThemedText style={[styles.dayTabText, isSelected && styles.dayTabTextSelected]}>{label}</ThemedText>
    </Pressable>
  );
}

// ── Programme row ─────────────────────────────────────────────────────────────
function ProgrammeRow({ prog, onPress }: { prog: EpgListing; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  const title = b64(prog.title) || "Unknown Programme";
  const desc = b64(prog.description);
  const startFmt = fmtTime(prog.start_timestamp);
  const endFmt = fmtTime(prog.stop_timestamp);
  const durationMins = Math.round((prog.stop_timestamp - prog.start_timestamp) / 60);
  return (
    <Pressable
      style={[styles.progRow, isActive && styles.progRowActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      {isActive ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.12)", "rgba(255,102,0,0.03)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}
      <View style={styles.progTime}>
        <ThemedText style={styles.progTimeText}>{startFmt}</ThemedText>
        <ThemedText style={styles.progTimeSep}>–</ThemedText>
        <ThemedText style={styles.progTimeText}>{endFmt}</ThemedText>
      </View>
      <View style={styles.progInfo}>
        <ThemedText style={[styles.progTitle, isActive && styles.progTitleActive]} numberOfLines={1}>
          {title}
        </ThemedText>
        {desc ? (
          <ThemedText style={styles.progDesc} numberOfLines={2}>{desc}</ThemedText>
        ) : null}
        <ThemedText style={styles.progDuration}>{durationMins} min</ThemedText>
      </View>
      <View style={[styles.playIcon, isActive && styles.playIconActive]}>
        <Feather name="play" size={14} color={isActive ? "#fff" : Colors.dark.textSecondary} />
      </View>
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function CatchUpScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { liveStreams, liveCategories } = useData();

  const padH = Math.max(insets.left + Spacing.xs, Spacing.sm);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.sm);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.sm);

  // ── Catchup categories — only those with tv_archive channels ─────────────
  const catchupCatIds = useMemo(() => {
    const s = new Set<string>();
    for (const ch of liveStreams) {
      if (ch.tv_archive === 1) s.add(ch.category_id);
    }
    return s;
  }, [liveStreams]);

  const catchupCategories = useMemo(
    () => liveCategories.filter((c) => catchupCatIds.has(c.category_id)),
    [liveCategories, catchupCatIds],
  );

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(() => catchupCategories[0]?.category_id ?? "");
  const [selectedChannel, setSelectedChannel] = useState<LiveStream | null>(null);
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [epgData, setEpgData] = useState<EpgListing[]>([]);
  const [epgLoading, setEpgLoading] = useState(false);
  const epgCache = useRef<Map<number, EpgListing[]>>(new Map());

  // Keep category selection valid if categories load later
  useEffect(() => {
    if (!selectedCategoryId && catchupCategories.length > 0) {
      setSelectedCategoryId(catchupCategories[0].category_id);
    }
  }, [catchupCategories]);

  // ── Channels in selected category ─────────────────────────────────────────
  const channelsInCat = useMemo(
    () => liveStreams.filter((s) => s.category_id === selectedCategoryId && s.tv_archive === 1),
    [liveStreams, selectedCategoryId],
  );

  // ── Days available for selected channel ───────────────────────────────────
  const days = useMemo(() => {
    if (!selectedChannel) return [];
    const count = Math.min(Math.max(selectedChannel.tv_archive_duration || 3, 1), 7);
    return Array.from({ length: count }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d;
    });
  }, [selectedChannel]);

  // ── Fetch EPG when channel selected (with cache) ──────────────────────────
  useEffect(() => {
    if (!selectedChannel) return;
    const cached = epgCache.current.get(selectedChannel.stream_id);
    if (cached) { setEpgData(cached); return; }
    setEpgLoading(true);
    setEpgData([]);
    xtreamApi.getSimpleDataTable(selectedChannel.stream_id).then((listings) => {
      epgCache.current.set(selectedChannel.stream_id, listings);
      setEpgData(listings);
    }).catch(() => setEpgData([])).finally(() => setEpgLoading(false));
  }, [selectedChannel]);

  // ── Filter EPG for selected day ───────────────────────────────────────────
  const dayProgrammes = useMemo(() => {
    const day = days[selectedDayIdx];
    if (!day) return [];
    const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
    const s = dayStart.getTime(); const e = dayEnd.getTime();
    return epgData.filter((p) => {
      const ms = p.start_timestamp * 1000;
      return ms >= s && ms <= e;
    }).sort((a, b) => a.start_timestamp - b.start_timestamp);
  }, [epgData, days, selectedDayIdx]);

  // ── Play a programme as catchup VOD ──────────────────────────────────────
  const playProgramme = useCallback((prog: EpgListing) => {
    if (!selectedChannel) return;
    const durationMins = Math.max(Math.ceil((prog.stop_timestamp - prog.start_timestamp) / 60), 1);
    const url = xtreamApi.getCatchupStreamUrl(selectedChannel.stream_id, prog.start_timestamp, durationMins);
    navigation.navigate("Player", {
      streamUrl: url,
      title: b64(prog.title) || selectedChannel.name,
      type: "vod",
      streamId: String(selectedChannel.stream_id),
    });
  }, [selectedChannel, navigation]);

  const handleSelectChannel = useCallback((ch: LiveStream) => {
    setSelectedChannel(ch);
    setSelectedDayIdx(0);
  }, []);

  const handleBack = useCallback(() => {
    if (selectedChannel) { setSelectedChannel(null); return; }
    navigation.goBack();
  }, [selectedChannel, navigation]);

  const noCategories = catchupCategories.length === 0;

  return (
    <ThemedView style={styles.container}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: padT, paddingLeft: padH, paddingRight: padH }]}>
        <Pressable
          style={({ focused, pressed }) => [styles.backBtn, (focused || pressed) && styles.backBtnActive]}
          onPress={handleBack}
        >
          {({ focused, pressed }) => (
            <>
              {focused || pressed ? (
                <LinearGradient
                  colors={["rgba(255,102,0,0.18)", "rgba(255,102,0,0.06)"]}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                />
              ) : null}
              <Feather name="arrow-left" size={18} color={(focused || pressed) ? Colors.dark.accent : Colors.dark.text} />
            </>
          )}
        </Pressable>
        <Feather name="clock" size={16} color={Colors.dark.accent} style={{ marginLeft: Spacing.sm }} />
        <ThemedText style={styles.headerTitle}>
          {selectedChannel ? selectedChannel.name : "Catch Up"}
        </ThemedText>
        {selectedChannel ? (
          <View style={styles.channelHeaderIcon}>
            {selectedChannel.stream_icon ? (
              <Image source={{ uri: selectedChannel.stream_icon }} style={styles.headerChannelImg} contentFit="contain" />
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      {noCategories ? (
        <View style={styles.empty}>
          <Feather name="clock" size={48} color={Colors.dark.border} />
          <ThemedText style={styles.emptyTitle}>No Catch Up Available</ThemedText>
          <ThemedText style={styles.emptySubtitle}>Your provider has no channels with catch up enabled.</ThemedText>
        </View>
      ) : (
        <View style={[styles.body, { paddingBottom: padB }]}>

          {/* ── Left sidebar: categories ────────────────────────────────────── */}
          <View style={styles.sidebar}>
            <FlatList
              data={catchupCategories}
              keyExtractor={(c) => c.category_id}
              renderItem={({ item }) => (
                <CatItem
                  cat={item}
                  isSelected={item.category_id === selectedCategoryId}
                  onPress={() => { setSelectedCategoryId(item.category_id); setSelectedChannel(null); }}
                />
              )}
              showsVerticalScrollIndicator={false}
            />
          </View>

          {/* ── Right content ───────────────────────────────────────────────── */}
          <View style={styles.content}>
            {!selectedChannel ? (
              /* ── Channel list ──────────────────────────────────────────── */
              channelsInCat.length === 0 ? (
                <View style={styles.empty}>
                  <Feather name="tv" size={36} color={Colors.dark.border} />
                  <ThemedText style={styles.emptySubtitle}>No catch up channels in this category</ThemedText>
                </View>
              ) : (
                <FlatList
                  data={channelsInCat}
                  keyExtractor={(s) => String(s.stream_id)}
                  numColumns={3}
                  key="channels-3"
                  contentContainerStyle={styles.channelGrid}
                  columnWrapperStyle={{ gap: Spacing.sm }}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <ChannelCard stream={item} onPress={() => handleSelectChannel(item)} />
                  )}
                />
              )
            ) : (
              /* ── Programme view ────────────────────────────────────────── */
              <View style={styles.progView}>
                {/* Day tabs */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.dayTabBar}
                  contentContainerStyle={styles.dayTabBarContent}
                >
                  {days.map((d, i) => (
                    <DayTab
                      key={i}
                      label={fmtDayTab(d, i === 0)}
                      isSelected={i === selectedDayIdx}
                      onPress={() => setSelectedDayIdx(i)}
                    />
                  ))}
                </ScrollView>

                {/* Programme list */}
                {epgLoading ? (
                  <View style={styles.loadingWrap}>
                    <ActivityIndicator size="large" color={Colors.dark.accent} />
                    <ThemedText style={styles.loadingText}>Loading programme guide...</ThemedText>
                  </View>
                ) : dayProgrammes.length === 0 ? (
                  <View style={styles.empty}>
                    <Feather name="calendar" size={36} color={Colors.dark.border} />
                    <ThemedText style={styles.emptySubtitle}>No archived programmes for this day</ThemedText>
                  </View>
                ) : (
                  <FlatList
                    data={dayProgrammes}
                    keyExtractor={(p) => p.id}
                    contentContainerStyle={styles.progList}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => (
                      <ProgrammeRow prog={item} onPress={() => playProgramme(item)} />
                    )}
                  />
                )}
              </View>
            )}
          </View>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingBottom: Spacing.sm, gap: Spacing.sm,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: Colors.dark.text },
  backBtn: {
    width: 38, height: 38, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center", overflow: "hidden",
  },
  backBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  channelHeaderIcon: { width: 48, height: 28, justifyContent: "center", alignItems: "center" },
  headerChannelImg: { width: 48, height: 28 },
  divider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.xs },

  body: { flex: 1, flexDirection: "row" },

  // ── Sidebar ──────────────────────────────────────────────────────────────
  sidebar: {
    width: SIDEBAR_W,
    borderRightWidth: 1,
    borderRightColor: Colors.dark.border,
  },
  catItem: {
    paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.dark.border,
    overflow: "hidden", flexDirection: "row", alignItems: "center",
    minHeight: 44,
  },
  catItemSelected: { borderLeftWidth: 0 },
  catItemFocused: { backgroundColor: "rgba(255,255,255,0.04)" },
  catItemAccent: {
    position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
    backgroundColor: Colors.dark.accent,
  },
  catItemText: { fontSize: 12, color: Colors.dark.textSecondary, fontWeight: "500", flex: 1 },
  catItemTextSelected: { color: Colors.dark.accent, fontWeight: "700" },

  // ── Content area ─────────────────────────────────────────────────────────
  content: { flex: 1 },

  // ── Channel grid ─────────────────────────────────────────────────────────
  channelGrid: { padding: Spacing.sm, gap: Spacing.sm },
  channelCard: {
    flex: 1, aspectRatio: 1.4,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center", padding: Spacing.sm,
    gap: Spacing.xs, overflow: "hidden",
  },
  channelCardActive: { borderColor: Colors.dark.accent },
  channelIconWrap: { width: 44, height: 32, justifyContent: "center", alignItems: "center" },
  channelIcon: { width: 44, height: 32 },
  channelName: {
    fontSize: 11, fontWeight: "600", color: Colors.dark.text,
    textAlign: "center",
  },
  channelNameActive: { color: Colors.dark.accent },
  archiveBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: "rgba(255,102,0,0.12)",
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: "rgba(255,102,0,0.3)",
  },
  archiveBadgeText: { fontSize: 9, color: Colors.dark.accent, fontWeight: "700" },

  // ── Programme view ────────────────────────────────────────────────────────
  progView: { flex: 1, flexDirection: "column" },

  dayTabBar: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: Colors.dark.border },
  dayTabBarContent: { paddingHorizontal: Spacing.sm, gap: Spacing.xs, alignItems: "center", height: DAY_TAB_H },
  dayTab: {
    paddingHorizontal: Spacing.lg, height: 34,
    justifyContent: "center", alignItems: "center",
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: "transparent",
  },
  dayTabSelected: {
    backgroundColor: "rgba(255,102,0,0.15)",
    borderColor: Colors.dark.accent,
  },
  dayTabFocused: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: Colors.dark.border,
  },
  dayTabText: { fontSize: 12, fontWeight: "600", color: Colors.dark.textSecondary },
  dayTabTextSelected: { color: Colors.dark.accent },

  progList: { padding: Spacing.sm, gap: Spacing.xs },
  progRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.dark.border,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    gap: Spacing.md, overflow: "hidden", minHeight: 58,
  },
  progRowActive: { borderColor: Colors.dark.accent },
  progTime: {
    width: 80, alignItems: "center", gap: 1,
  },
  progTimeText: { fontSize: 12, fontWeight: "700", color: Colors.dark.accent },
  progTimeSep: { fontSize: 10, color: Colors.dark.textSecondary },
  progInfo: { flex: 1, gap: 2 },
  progTitle: { fontSize: 13, fontWeight: "700", color: Colors.dark.text },
  progTitleActive: { color: Colors.dark.accent },
  progDesc: { fontSize: 11, color: Colors.dark.textSecondary, lineHeight: 15 },
  progDuration: { fontSize: 10, color: Colors.dark.border, marginTop: 2 },
  playIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  playIconActive: { backgroundColor: Colors.dark.accent, borderColor: Colors.dark.accent },

  // ── Loading / Empty ───────────────────────────────────────────────────────
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center", gap: Spacing.md },
  loadingText: { color: Colors.dark.textSecondary, fontSize: 13 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: Spacing.sm, padding: Spacing.xl },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: Colors.dark.text, textAlign: "center" },
  emptySubtitle: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center" },
});
