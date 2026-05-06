import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
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
  size,
}: {
  profile: Profile;
  onPress: () => void;
  size: number;
}) {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const isActive = pressed || focused;

  return (
    <Pressable
      style={[styles.profileCard, { width: size }, isActive && styles.profileCardActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <View style={[styles.avatarWrap, isActive && { transform: [{ scale: 1.08 }] }]}>
        <ProfileAvatar icon={profile.avatar_icon} color={profile.avatar_color} size={54} />
        {profile.pin ? (
          <View style={[styles.lockBadge, { backgroundColor: profile.avatar_color }]}>
            <Feather name="lock" size={9} color="#fff" />
          </View>
        ) : null}
      </View>
      <ThemedText style={[styles.profileName, isActive && styles.profileNameActive]} numberOfLines={1}>
        {profile.name}
      </ThemedText>
    </Pressable>
  );
}

function AddProfileCard({ onPress, size }: { onPress: () => void; size: number }) {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const isActive = pressed || focused;
  return (
    <Pressable
      style={[styles.addCard, { width: size }, isActive && styles.addCardActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <View style={[styles.addIconWrap, isActive && styles.addIconWrapActive]}>
        <Feather name="plus" size={26} color={Colors.dark.accent} />
      </View>
      <ThemedText style={[styles.addText, isActive && styles.addTextActive]}>Add Profile</ThemedText>
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

  const padH = Math.max(insets.left + Spacing.sm, Spacing["3xl"]);
  const padT = Math.max(insets.top + Spacing.sm, Spacing.lg);
  const padB = Math.max(insets.bottom + Spacing.sm, Spacing.lg);

  const numCols = isLandscape ? 4 : 3;
  const gap = Spacing.lg;
  const cardSize = Math.floor((Math.min(width, 800) - padH * 2 - gap * (numCols - 1)) / numCols);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      fetchProfiles(username)
        .then((p) => { if (active) { setProfiles(p); setLoading(false); } })
        .catch(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }, [username])
  );

  const handleSelect = (profile: Profile) => {
    if (profile.pin) {
      navigation.navigate("PinEntry", { profile, fromHome });
    } else {
      setActiveProfile(profile);
      if (fromHome) {
        navigation.goBack();
      } else {
        navigation.reset({ index: 0, routes: [{ name: "Home" }] });
      }
    }
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
            style={({ pressed, focused }) => [styles.iconBtn, (pressed || focused) && styles.iconBtnActive]}
            onPress={() => navigation.goBack()}
          >
            {({ pressed, focused }) => (
              <Feather name="arrow-left" size={20} color={(pressed || focused) ? Colors.dark.accent : Colors.dark.text} />
            )}
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}

        <View style={styles.headerCenter}>
          <ThemedText style={styles.title}>Who's Watching?</ThemedText>
        </View>

        <View style={{ width: 40 }} />
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
          contentContainerStyle={[styles.grid, { paddingHorizontal: padH, paddingBottom: padB, gap }]}
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
                onPress={() => handleSelect(p)}
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
    flexDirection: "row", alignItems: "center",
    paddingBottom: Spacing.md, gap: Spacing.md,
  },
  headerCenter: { flex: 1, alignItems: "center" },
  title: { fontSize: 22, fontWeight: "700", color: Colors.dark.text, letterSpacing: 0.3 },
  iconBtn: {
    width: 40, height: 40, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  iconBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  divider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.xl },
  grid: { paddingTop: Spacing.sm },
  profileCard: {
    alignItems: "center", gap: Spacing.sm, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md, borderWidth: 2, borderColor: "transparent",
    paddingHorizontal: Spacing.sm,
  },
  profileCardActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accentDim,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 12, elevation: 8,
  },
  profileNameActive: { color: Colors.dark.accent },
  avatarWrap: { position: "relative" },
  avatarRing: {
    borderWidth: 2, justifyContent: "center", alignItems: "center",
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 6,
  },
  avatarInner: { justifyContent: "center", alignItems: "center" },
  lockBadge: {
    position: "absolute", bottom: 0, right: 0,
    width: 20, height: 20, borderRadius: 10,
    justifyContent: "center", alignItems: "center",
    borderWidth: 2, borderColor: Colors.dark.backgroundRoot,
  },
  profileName: {
    color: Colors.dark.text, fontSize: 13, fontWeight: "600",
    textAlign: "center", maxWidth: "90%",
  },
  addCard: {
    alignItems: "center", gap: Spacing.sm, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md, borderWidth: 2, borderColor: "transparent",
    paddingHorizontal: Spacing.sm,
  },
  addCardActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accentDim,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 12, elevation: 8,
  },
  addIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 2, borderColor: Colors.dark.border, borderStyle: "dashed",
    justifyContent: "center", alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
  },
  addIconWrapActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  addText: { color: Colors.dark.textSecondary, fontSize: 13, fontWeight: "500" },
  addTextActive: { color: Colors.dark.accent },
  centered: {
    flex: 1, justifyContent: "center", alignItems: "center",
    gap: Spacing.md, paddingTop: Spacing["4xl"],
  },
  emptyText: { color: Colors.dark.text, fontSize: 16, fontWeight: "600" },
  emptySubText: { color: Colors.dark.textSecondary, fontSize: 13 },
});
