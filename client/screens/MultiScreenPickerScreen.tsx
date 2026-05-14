// Multi Screen — channel picker.
//
// Opened with `slotIndex` route param when the user taps an empty box on
// the multi-screen grid. Shows live categories on the left and channels
// inside the selected category on the right (mirrors ContentListScreen's
// sidebar pattern but stripped of editing / favourites controls).
//
// Picking a channel emits the choice over `multiScreenBus` so the
// MultiScreen grid can fill the originating slot, then pops back.

import React, { useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  Platform,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useData } from "@/contexts/DataContext";
import { multiScreenBus } from "@/lib/multiscreen-bus";
import { LiveStream } from "@/lib/xtream-api";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, "MultiScreenPicker">;

export default function MultiScreenPickerScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const slotIndex = route.params.slotIndex;

  const { liveCategories, liveStreams } = useData();
  const [selectedCat, setSelectedCat] = useState<string>(
    liveCategories[0]?.category_id ?? ""
  );
  const [query, setQuery] = useState("");

  // Channels in the active category (or full list if 'all')
  const channels = useMemo(() => {
    let list: LiveStream[] = selectedCat === "all"
      ? liveStreams
      : liveStreams.filter((s) => String(s.category_id) === String(selectedCat));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }
    return list;
  }, [selectedCat, liveStreams, query]);

  const onPick = (s: LiveStream) => {
    multiScreenBus.emit({ slotIndex, stream: s });
    navigation.goBack();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.md }]}>
      {/* Header */}
      <View style={[styles.headerRow, { paddingHorizontal: Math.max(insets.left, Spacing.xl) }]}>
        <BackBtn onPress={() => navigation.goBack()} />
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.title}>Pick a Channel</ThemedText>
          <ThemedText style={styles.subtitle}>Slot {slotIndex + 1}</ThemedText>
        </View>
      </View>

      <View style={styles.body}>
        {/* Sidebar — categories */}
        <View style={[styles.sidebar, { paddingLeft: Math.max(insets.left, Spacing.xs), paddingBottom: insets.bottom + Spacing.lg }]}>
          <FlatList
            data={[{ category_id: "all", category_name: "All Channels", parent_id: 0 }, ...liveCategories]}
            keyExtractor={(c) => String(c.category_id)}
            renderItem={({ item }) => (
              <SidebarRow
                label={item.category_name}
                selected={String(item.category_id) === String(selectedCat)}
                onPress={() => setSelectedCat(String(item.category_id))}
              />
            )}
            initialNumToRender={20}
            removeClippedSubviews={false}
          />
        </View>

        <View style={styles.sidebarDivider} />

        {/* Right pane — search + channels */}
        <View style={styles.mainContent}>
          <View style={[styles.searchBar, query.length > 0 && styles.searchBarActive]}>
            <Feather name="search" size={15} color={query ? Colors.dark.accent : Colors.dark.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search channels"
              placeholderTextColor={Colors.dark.textSecondary}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>

          <FlatList
            data={channels}
            keyExtractor={(s) => String(s.stream_id)}
            renderItem={({ item }) => <ChannelRow item={item} onPress={() => onPick(item)} />}
            contentContainerStyle={{ paddingVertical: Spacing.sm, paddingBottom: insets.bottom + Spacing.lg }}
            initialNumToRender={20}
            removeClippedSubviews={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Feather name="tv" size={36} color={Colors.dark.border} />
                <ThemedText style={styles.emptyText}>No channels here</ThemedText>
              </View>
            }
          />
        </View>
      </View>
    </View>
  );
}

// ─── Sidebar row ───────────────────────────────────────────────────────────
function SidebarRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hot = focused || hovered;
  return (
    <Pressable
      style={[styles.sidebarRow, selected && styles.sidebarRowSelected, hot && styles.sidebarRowHot]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <ThemedText
        numberOfLines={1}
        style={[styles.sidebarLabel, selected && styles.sidebarLabelSelected, hot && styles.sidebarLabelHot]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

// ─── Channel row ───────────────────────────────────────────────────────────
function ChannelRow({ item, onPress }: { item: LiveStream; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const hot = focused || hovered || pressed;
  return (
    <Pressable
      style={[styles.channelRow, hot && styles.channelRowHot]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      <View style={styles.channelLogo}>
        {item.stream_icon ? (
          <Image source={{ uri: item.stream_icon }} style={StyleSheet.absoluteFill} contentFit="contain" />
        ) : (
          <Feather name="tv" size={16} color={Colors.dark.textSecondary} />
        )}
      </View>
      <ThemedText style={[styles.channelName, hot && { color: Colors.dark.accent }]} numberOfLines={1}>
        {item.name}
      </ThemedText>
      <Feather name="plus" size={16} color={hot ? Colors.dark.accent : Colors.dark.textSecondary} />
    </Pressable>
  );
}

function BackBtn({ onPress }: { onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hot = focused || hovered;
  return (
    <Pressable
      style={[styles.backBtn, hot && styles.backBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <Feather name="arrow-left" size={18} color={hot ? Colors.dark.accent : Colors.dark.text} />
    </Pressable>
  );
}

const SIDEBAR_W = 200;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  headerRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md, marginBottom: Spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: Colors.dark.text },
  subtitle: { fontSize: 12, color: Colors.dark.accent, marginTop: 2, fontWeight: "700" },

  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  backBtnActive: { borderColor: Colors.dark.accent },

  body: { flex: 1, flexDirection: "row" },

  sidebar: { width: SIDEBAR_W, paddingRight: Spacing.xs },
  sidebarDivider: { width: 1, backgroundColor: Colors.dark.border },
  sidebarRow: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm, marginBottom: 2,
    borderWidth: 1, borderColor: "transparent",
  },
  sidebarRowSelected: { backgroundColor: "rgba(255,102,0,0.12)" },
  sidebarRowHot: { borderColor: Colors.dark.accent, backgroundColor: "rgba(255,102,0,0.18)" },
  sidebarLabel: { color: Colors.dark.text, fontSize: 12 },
  sidebarLabelSelected: { color: Colors.dark.accent, fontWeight: "700" },
  sidebarLabelHot: { color: Colors.dark.accent, fontWeight: "700" },

  mainContent: { flex: 1, paddingHorizontal: Spacing.lg },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Platform.OS === "ios" ? Spacing.sm : Spacing.xs,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.dark.border,
    marginVertical: Spacing.sm,
  },
  searchBarActive: { borderColor: Colors.dark.accent },
  searchInput: { flex: 1, color: Colors.dark.text, fontSize: 14, paddingVertical: 0 },

  channelRow: {
    flexDirection: "row", alignItems: "center", gap: Spacing.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm, marginBottom: 4,
    borderWidth: 1, borderColor: "transparent",
    backgroundColor: Colors.dark.backgroundDefault,
  },
  channelRowHot: { borderColor: Colors.dark.accent, backgroundColor: "rgba(255,102,0,0.08)" },
  channelLogo: {
    width: 40, height: 28, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.05)",
    justifyContent: "center", alignItems: "center", overflow: "hidden",
  },
  channelName: { flex: 1, color: Colors.dark.text, fontSize: 13 },

  empty: { alignItems: "center", justifyContent: "center", padding: Spacing["3xl"], gap: Spacing.sm },
  emptyText: { color: Colors.dark.textSecondary, fontSize: 13 },
});
