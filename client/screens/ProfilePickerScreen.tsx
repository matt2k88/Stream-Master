import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Profile, useProfile } from "@/contexts/ProfileContext";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ProfilePickerRouteProp = RouteProp<RootStackParamList, "ProfilePicker">;

function ProfileAvatar({ icon, color, size = 64 }: { icon: string; color: string; size?: number }) {
  return (
    <View
      style={[
        styles.avatarRing,
        { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, borderColor: color, shadowColor: color },
      ]}
    >
      <View style={[styles.avatarInner, { width: size, height: size, borderRadius: size / 2, backgroundColor: color + "33" }]}>
        <Feather name={icon as any} size={size * 0.44} color={color} />
      </View>
    </View>
  );
}

function ProfileCard({
  profile,
  onPress,
  onDelete,
  editMode,
  size,
}: {
  profile: Profile;
  onPress: () => void;
  onDelete: () => void;
  editMode: boolean;
  size: number;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      style={[styles.profileCard, { width: size }, pressed && !editMode && styles.profileCardActive]}
      onPress={editMode ? undefined : onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onLongPress={() => onDelete()}
    >
      <View style={styles.avatarWrap}>
        <ProfileAvatar icon={profile.avatar_icon} color={profile.avatar_color} size={54} />
        {profile.pin ? (
          <View style={[styles.lockBadge, { backgroundColor: profile.avatar_color }]}>
            <Feather name="lock" size={9} color="#fff" />
          </View>
        ) : null}
        {editMode ? (
          <Pressable style={styles.deleteBadge} onPress={onDelete} hitSlop={8}>
            <Feather name="x" size={11} color="#fff" />
          </Pressable>
        ) : null}
      </View>
      <ThemedText style={styles.profileName} numberOfLines={1}>
        {profile.name}
      </ThemedText>
    </Pressable>
  );
}

function AddProfileCard({ onPress, size }: { onPress: () => void; size: number }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      style={[styles.addCard, { width: size }, pressed && styles.addCardActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      <View style={styles.addIconWrap}>
        <Feather name="plus" size={26} color={Colors.dark.accent} />
      </View>
      <ThemedText style={styles.addText}>Add Profile</ThemedText>
    </Pressable>
  );
}

async function fetchProfiles(username: string): Promise<Profile[]> {
  const base = new URL("/api/profiles", getApiUrl());
  base.searchParams.set("username", username);
  const res = await fetch(base.toString());
  if (!res.ok) throw new Error("Failed to fetch profiles");
  return res.json();
}

async function deleteProfile(id: string): Promise<void> {
  const url = new URL(`/api/profiles/${id}`, getApiUrl());
  const res = await fetch(url.toString(), { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete profile");
}

export default function ProfilePickerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ProfilePickerRouteProp>();
  const fromHome = route.params?.fromHome ?? false;
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const { setActiveProfile } = useProfile();
  const { userInfo } = useAuth();
  const username = userInfo?.user_info?.username ?? "";

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);

  const padH = Math.max(insets.left + Spacing.sm, Spacing["3xl"]);
  const padT = Math.max(insets.top + Spacing.sm, Spacing.lg);
  const padB = Math.max(insets.bottom + Spacing.sm, Spacing.lg);

  // Card sizing: 4-5 per row landscape, 3 portrait
  const numCols = isLandscape ? 4 : 3;
  const gap = Spacing.lg;
  const cardSize = Math.floor((Math.min(width, 800) - padH * 2 - gap * (numCols - 1)) / numCols);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      fetchProfiles(username).then((p) => {
        if (active) { setProfiles(p); setLoading(false); }
      }).catch(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }, [username])
  );

  const handleSelect = (profile: Profile) => {
    if (profile.pin) {
      navigation.navigate("PinEntry", { profile, fromHome });
    } else {
      setActiveProfile(profile);
      if (fromHome) navigation.goBack();
    }
  };

  const handleDelete = (profile: Profile) => {
    Alert.alert(
      "Delete Profile",
      `Remove "${profile.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteProfile(profile.id);
              setProfiles((prev) => prev.filter((p) => p.id !== profile.id));
            } catch {
              Alert.alert("Error", "Failed to delete profile");
            }
          },
        },
      ]
    );
  };

  const canAddMore = profiles.length < 10;

  const items: Array<Profile | "add"> = canAddMore ? [...profiles, "add"] : profiles;

  return (
    <ThemedView style={styles.container}>
      <LinearGradient
        colors={["rgba(255,102,0,0.06)", "transparent", "rgba(255,102,0,0.03)"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        {fromHome ? (
          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnActive]}
            onPress={() => navigation.goBack()}
          >
            <Feather name="arrow-left" size={20} color={Colors.dark.text} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}

        <View style={styles.headerCenter}>
          <ThemedText style={styles.title}>Who's Watching?</ThemedText>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.iconBtn,
            editMode && styles.iconBtnEdit,
            pressed && styles.iconBtnActive,
          ]}
          onPress={() => setEditMode((e) => !e)}
        >
          <Feather name={editMode ? "check" : "edit-2"} size={16} color={editMode ? Colors.dark.accent : Colors.dark.textSecondary} />
        </Pressable>
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => (item === "add" ? "__add__" : (item as Profile).id)}
          numColumns={numCols}
          key={`profiles-${numCols}`}
          contentContainerStyle={[
            styles.grid,
            { paddingHorizontal: padH, paddingBottom: padB, gap },
          ]}
          columnWrapperStyle={numCols > 1 ? { gap } : undefined}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            if (item === "add") {
              return (
                <AddProfileCard
                  size={cardSize}
                  onPress={() => navigation.navigate("CreateProfile", {})}
                />
              );
            }
            const p = item as Profile;
            return (
              <ProfileCard
                profile={p}
                size={cardSize}
                editMode={editMode}
                onPress={() => handleSelect(p)}
                onDelete={() => handleDelete(p)}
              />
            );
          }}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Feather name="users" size={40} color={Colors.dark.border} />
              <ThemedText style={styles.emptyText}>No profiles yet</ThemedText>
              <ThemedText style={styles.emptySubText}>Create a profile to get started</ThemedText>
            </View>
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  headerCenter: { flex: 1, alignItems: "center" },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 0.3,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  iconBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  iconBtnEdit: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  divider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.xl },
  grid: { paddingTop: Spacing.sm },
  profileCard: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  profileCardActive: { opacity: 0.75 },
  avatarWrap: { position: "relative" },
  avatarRing: {
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  avatarInner: { justifyContent: "center", alignItems: "center" },
  lockBadge: {
    position: "absolute", bottom: 0, right: 0,
    width: 20, height: 20, borderRadius: 10,
    justifyContent: "center", alignItems: "center",
    borderWidth: 2, borderColor: Colors.dark.backgroundRoot,
  },
  deleteBadge: {
    position: "absolute", top: -2, right: -2,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: Colors.dark.error,
    justifyContent: "center", alignItems: "center",
    borderWidth: 2, borderColor: Colors.dark.backgroundRoot,
  },
  profileName: {
    color: Colors.dark.text, fontSize: 13, fontWeight: "600",
    textAlign: "center", maxWidth: "90%",
  },
  addCard: {
    alignItems: "center", gap: Spacing.sm, paddingVertical: Spacing.sm,
  },
  addCardActive: { opacity: 0.7 },
  addIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 2, borderColor: Colors.dark.border,
    borderStyle: "dashed",
    justifyContent: "center", alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
  },
  addText: { color: Colors.dark.textSecondary, fontSize: 13, fontWeight: "500" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: Spacing.md, paddingTop: Spacing["4xl"] },
  emptyText: { color: Colors.dark.text, fontSize: 16, fontWeight: "600" },
  emptySubText: { color: Colors.dark.textSecondary, fontSize: 13 },
});
