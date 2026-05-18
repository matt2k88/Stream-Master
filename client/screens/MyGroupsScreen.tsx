import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  FlatList,
  useWindowDimensions,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { FlashList } from "@shopify/flash-list";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useGroups, type UserGroup, type GroupType } from "@/contexts/GroupsContext";
import { useData } from "@/contexts/DataContext";
import GroupEditorModal from "@/components/GroupEditorModal";
import { getGroupIconProps } from "@/lib/group-icons";
import { xtreamApi, type LiveStream, type VodStream, type Series } from "@/lib/xtream-api";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type MyGroupsRouteProp = RouteProp<RootStackParamList, "MyGroups">;

const SIDEBAR_W = 200;

function HeaderBtn({
  onPress,
  icon,
  label,
  iconOnly,
  primary,
}: {
  onPress: () => void;
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  iconOnly?: boolean;
  primary?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || hovered || pressed;
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.headerBtn,
        iconOnly ? null : { paddingHorizontal: Spacing.sm, flexDirection: "row", gap: 6, width: undefined },
        primary && styles.headerBtnPrimary,
        isActive && (primary ? styles.headerBtnPrimaryActive : styles.headerBtnActive),
      ]}
      accessibilityLabel={label}
    >
      {isActive && !primary ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.18)", "rgba(255,102,0,0.06)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}
      <Feather
        name={icon}
        size={iconOnly ? 18 : 16}
        color={primary ? "#fff" : isActive ? Colors.dark.accent : Colors.dark.text}
      />
      {iconOnly ? null : (
        <ThemedText style={{ color: primary ? "#fff" : isActive ? Colors.dark.accent : Colors.dark.text, fontWeight: "700", fontSize: 12 }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

function GroupRow({
  group,
  itemCount,
  selected,
  onPress,
}: {
  group: UserGroup;
  itemCount: number;
  selected: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || hovered || pressed;
  const highlight = selected || isActive;
  const { Component: IconComp, name: iconName } = getGroupIconProps(group.icon_key);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.groupRow,
        selected && styles.groupRowSelected,
        isActive && !selected && styles.groupRowHover,
      ]}
    >
      {selected ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.18)", "rgba(255,102,0,0.04)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      ) : null}
      <View style={[styles.groupIconChip, { backgroundColor: group.color }]}>
        <IconComp name={iconName} size={14} color={group.color === "#FFFFFF" ? "#000" : "#fff"} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText
          style={[styles.groupName, highlight && { color: Colors.dark.accent }]}
          numberOfLines={1}
        >
          {group.name}
        </ThemedText>
        <ThemedText style={styles.groupCount}>
          {itemCount} {itemCount === 1 ? "item" : "items"}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function ContentTile({
  name,
  icon,
  type,
  width,
  height,
  onPress,
  onRemove,
  manageMode,
}: {
  name: string;
  icon: string | null;
  type: GroupType;
  width: number;
  height: number;
  onPress: () => void;
  onRemove: () => void;
  manageMode: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || hovered || pressed;
  const imgH = height - 48;
  const fallbackIcon: React.ComponentProps<typeof Feather>["name"] =
    type === "live" ? "tv" : type === "movies" ? "film" : "grid";
  return (
    <Pressable
      onPress={manageMode ? onRemove : onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.tile,
        { width, height },
        isActive && !manageMode && styles.tileActive,
        manageMode && styles.tileManage,
        manageMode && isActive && styles.tileManageActive,
      ]}
    >
      <View style={[styles.tileThumb, { width, height: imgH }]}>
        {icon ? (
          <Image
            source={{ uri: icon }}
            style={{ width: "100%", height: "100%" }}
            contentFit={type === "live" ? "contain" : "cover"}
            transition={200}
          />
        ) : (
          <View style={styles.tilePlaceholder}>
            <Feather name={fallbackIcon} size={24} color={Colors.dark.border} />
          </View>
        )}
        {manageMode ? (
          <View style={styles.removeBadge} pointerEvents="none">
            <Feather name="x" size={13} color="#fff" />
          </View>
        ) : null}
      </View>
      <View style={styles.tileInfo}>
        <ThemedText style={[styles.tileName, isActive && { color: Colors.dark.accent }]} numberOfLines={2}>
          {name}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export default function MyGroupsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<MyGroupsRouteProp>();
  const { type } = route.params;
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const { groups, getGroupsByType, getItemsByGroup, createGroup, updateGroup, deleteGroup, removeItem } = useGroups();
  const { liveStreams, vodStreams, seriesList } = useData();

  const myGroups = useMemo(() => getGroupsByType(type), [getGroupsByType, type, groups]);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<UserGroup | null>(null);
  const [manageMode, setManageMode] = useState(false);

  // Auto-select first group when groups load, or when current selection vanishes.
  React.useEffect(() => {
    if (myGroups.length === 0) {
      setSelectedGroupId(null);
      return;
    }
    if (!selectedGroupId || !myGroups.find((g) => g.id === selectedGroupId)) {
      setSelectedGroupId(myGroups[0].id);
    }
  }, [myGroups, selectedGroupId]);

  // Reset manage mode when switching groups
  React.useEffect(() => {
    setManageMode(false);
  }, [selectedGroupId]);

  const selectedGroup = useMemo(
    () => myGroups.find((g) => g.id === selectedGroupId) ?? null,
    [myGroups, selectedGroupId],
  );

  const groupItems = useMemo(
    () => (selectedGroupId ? getItemsByGroup(selectedGroupId) : []),
    [getItemsByGroup, selectedGroupId, groups],
  );

  // Lookup map: streamId → fullstream object (so we can hand a proper
  // navigation payload off to the existing Movie/Series/Live flows).
  const streamLookup = useMemo(() => {
    const m = new Map<number, LiveStream | VodStream | Series>();
    const src: any[] = type === "live" ? liveStreams : type === "movies" ? vodStreams : seriesList;
    for (const s of src) {
      const id = type === "series" ? (s as Series).series_id : (s as LiveStream | VodStream).stream_id;
      m.set(Number(id), s);
    }
    return m;
  }, [type, liveStreams, vodStreams, seriesList]);

  const typeLabel = type === "live" ? "Live TV" : type === "movies" ? "Movies" : "Series";
  const itemLabelSingular = type === "live" ? "channel" : type === "movies" ? "movie" : "series";

  const openCreate = () => {
    setEditingGroup(null);
    setEditorOpen(true);
  };

  const openEdit = () => {
    if (!selectedGroup) return;
    setEditingGroup(selectedGroup);
    setEditorOpen(true);
  };

  const handleSave = async ({ name, iconKey, color }: { name: string; iconKey: string; color: string }) => {
    if (editingGroup) {
      await updateGroup(editingGroup.id, { name, icon_key: iconKey, color });
    } else {
      const created = await createGroup({ type, name, iconKey, color });
      if (created) setSelectedGroupId(created.id);
    }
    setEditorOpen(false);
    setEditingGroup(null);
  };

  const handleDelete = async () => {
    if (!editingGroup) return;
    await deleteGroup(editingGroup.id);
    setEditorOpen(false);
    setEditingGroup(null);
  };

  const handleItemPress = useCallback(
    (streamId: number, streamName: string, streamIcon: string | null) => {
      const stream = streamLookup.get(Number(streamId));
      if (type === "series") {
        const series = stream as Series | undefined;
        navigation.navigate("SeriesDetail", {
          seriesId: Number(streamId),
          seriesName: streamName,
          cover: streamIcon ?? series?.cover ?? "",
        });
        return;
      }
      if (type === "movies") {
        const vod = stream as VodStream | undefined;
        navigation.navigate("MovieInfo", {
          streamId: Number(streamId),
          name: streamName,
          streamIcon: streamIcon ?? undefined,
          containerExtension: vod?.container_extension,
          categoryId: vod?.category_id,
        });
        return;
      }
      // live — preview screen
      const live = stream as LiveStream | undefined;
      const streamUrl = xtreamApi.getLiveStreamUrl(Number(streamId));
      navigation.navigate("LivePreview", {
        streamId: Number(streamId),
        name: streamName,
        streamUrl,
        thumbnail: streamIcon ?? live?.stream_icon ?? undefined,
        streamIcon: streamIcon ?? live?.stream_icon ?? undefined,
        categoryId: live?.category_id,
      });
    },
    [type, navigation, streamLookup],
  );

  const numColumns = useMemo(() => {
    const available = width - SIDEBAR_W - Spacing.md * 2;
    const target = type === "live" ? 110 : 130;
    return Math.max(2, Math.floor(available / target));
  }, [width, type]);

  const padH = Math.max(insets.left, Spacing.md);

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm, paddingHorizontal: padH }]}>
        <HeaderBtn icon="arrow-left" label="Back" iconOnly onPress={() => navigation.goBack()} />
        <View style={styles.headerTitleWrap}>
          <Feather name="folder" size={16} color={Colors.dark.accent} />
          <ThemedText style={styles.headerTitle}>My {typeLabel} Groups</ThemedText>
        </View>
        {selectedGroup ? (
          <>
            <HeaderBtn
              icon={manageMode ? "check" : "edit-2"}
              label={manageMode ? "Done" : "Manage Items"}
              iconOnly={!isLandscape}
              primary={manageMode}
              onPress={() => setManageMode((v) => !v)}
            />
            <HeaderBtn
              icon="edit-3"
              label="Edit Group"
              iconOnly={!isLandscape}
              onPress={openEdit}
            />
          </>
        ) : null}
        <HeaderBtn icon="plus" label="New Group" iconOnly={!isLandscape} primary onPress={openCreate} />
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      <View style={styles.body}>
        {/* Sidebar — group list */}
        <View style={[styles.sidebar, { paddingLeft: Math.max(insets.left, Spacing.xs) }]}>
          {myGroups.length === 0 ? (
            <View style={{ padding: Spacing.sm }}>
              <ThemedText style={styles.sidebarEmpty}>No groups yet</ThemedText>
            </View>
          ) : (
            <FlatList
              data={myGroups}
              keyExtractor={(g) => g.id}
              renderItem={({ item }) => (
                <GroupRow
                  group={item}
                  itemCount={getItemsByGroup(item.id).length}
                  selected={item.id === selectedGroupId}
                  onPress={() => setSelectedGroupId(item.id)}
                />
              )}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>

        <View style={styles.sidebarDivider} />

        {/* Main content */}
        <View style={styles.mainContent}>
          {myGroups.length === 0 ? (
            <EmptyHelp
              title={`Create Your First ${typeLabel} Group`}
              body={`Tap "New Group" to start. Give it a name, pick an icon and a colour — then add ${type === "live" ? "channels" : type === "movies" ? "movies" : "series"} from your ${typeLabel} list.`}
            />
          ) : !selectedGroup ? null : groupItems.length === 0 ? (
            <EmptyHelp
              title={`"${selectedGroup.name}" is empty`}
              body={`Go to ${typeLabel}, tap "Manage", select a ${itemLabelSingular} and choose "Add to ${selectedGroup.name}" to put it in this group.`}
              icon="info"
            />
          ) : (
            <FlashList
              data={groupItems}
              keyExtractor={(it) => it.id}
              numColumns={numColumns}
              contentContainerStyle={{ padding: Spacing.md }}
              renderItem={({ item }) => {
                const tileW = Math.floor((width - SIDEBAR_W - Spacing.md * 2 - 8 * (numColumns - 1)) / numColumns);
                const ratio = type === "live" ? 0.75 : 1.5;
                const tileH = tileW * ratio + 48;
                return (
                  <View style={{ marginRight: 8, marginBottom: 8 }}>
                    <ContentTile
                      name={item.stream_name}
                      icon={item.stream_icon}
                      type={type}
                      width={tileW}
                      height={tileH}
                      manageMode={manageMode}
                      onPress={() => handleItemPress(item.stream_id, item.stream_name, item.stream_icon)}
                      onRemove={() => removeItem(selectedGroup.id, item.stream_id)}
                    />
                  </View>
                );
              }}
            />
          )}
        </View>
      </View>

      <GroupEditorModal
        visible={editorOpen}
        type={type}
        editing={editingGroup}
        onCancel={() => {
          setEditorOpen(false);
          setEditingGroup(null);
        }}
        onSave={handleSave}
        onDelete={editingGroup ? handleDelete : undefined}
      />
    </ThemedView>
  );
}

function EmptyHelp({
  title,
  body,
  icon = "folder-plus",
}: {
  title: string;
  body: string;
  icon?: React.ComponentProps<typeof Feather>["name"];
}) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconCircle}>
        <Feather name={icon} size={36} color={Colors.dark.accent} />
      </View>
      <ThemedText style={styles.emptyTitle}>{title}</ThemedText>
      <ThemedText style={styles.emptyBody}>{body}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingBottom: Spacing.sm,
  },
  headerTitleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: Colors.dark.text },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: "center", alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1, borderColor: Colors.dark.border,
    overflow: "hidden",
  },
  headerBtnActive: { borderColor: Colors.dark.accent },
  headerBtnPrimary: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  headerBtnPrimaryActive: {
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1, shadowRadius: 10, elevation: 10,
    transform: [{ scale: 1.04 }],
  },
  divider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: 4 },
  body: { flex: 1, flexDirection: "row" },
  sidebar: {
    width: SIDEBAR_W,
    paddingVertical: Spacing.xs,
  },
  sidebarEmpty: { color: Colors.dark.textSecondary, fontSize: 12 },
  sidebarDivider: { width: 1, backgroundColor: Colors.dark.border },
  mainContent: { flex: 1 },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    borderRadius: BorderRadius.sm,
    marginVertical: 2,
    marginRight: Spacing.xs,
    overflow: "hidden",
  },
  groupRowSelected: { backgroundColor: "rgba(255,102,0,0.10)" },
  groupRowHover: { backgroundColor: "rgba(255,255,255,0.04)" },
  groupIconChip: {
    width: 30, height: 30, borderRadius: 15,
    justifyContent: "center", alignItems: "center",
  },
  groupName: { color: Colors.dark.text, fontSize: 13, fontWeight: "700" },
  groupCount: { color: Colors.dark.textSecondary, fontSize: 10, marginTop: 1 },

  emptyWrap: {
    flex: 1, justifyContent: "center", alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyIconCircle: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: "rgba(255,102,0,0.10)",
    justifyContent: "center", alignItems: "center",
    marginBottom: Spacing.md,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: Colors.dark.text, textAlign: "center", marginBottom: 8 },
  emptyBody: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center", lineHeight: 19, maxWidth: 460 },

  tile: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  tileActive: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85, shadowRadius: 12, elevation: 8,
  },
  tileManage: { borderColor: "rgba(255,59,59,0.55)" },
  tileManageActive: {
    borderColor: Colors.dark.error,
    shadowColor: Colors.dark.error, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85, shadowRadius: 14, elevation: 10,
  },
  tileThumb: { backgroundColor: Colors.dark.backgroundRoot, overflow: "hidden" },
  tilePlaceholder: { width: "100%", height: "100%", justifyContent: "center", alignItems: "center" },
  removeBadge: {
    position: "absolute", top: 6, right: 6,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.dark.error,
    justifyContent: "center", alignItems: "center",
    zIndex: 5,
  },
  tileInfo: { padding: 6, height: 48, justifyContent: "center" },
  tileName: { color: Colors.dark.text, fontSize: 11, fontWeight: "700", lineHeight: 14 },
});
