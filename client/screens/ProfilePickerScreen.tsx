import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  Animated,
  Easing,
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

/* ------------------------------------------------------------------ */
/* Avatar — concentric rings with a soft gradient fill.               */
/* The outer ring is the profile's accent colour, the inner disc fades*/
/* the same colour into the dark background for depth.                */
/* ------------------------------------------------------------------ */
function ProfileAvatar({
  icon,
  color,
  size,
  active,
}: {
  icon: string;
  color: string;
  size: number;
  active: boolean;
}) {
  const ring = size + 14;
  return (
    <View style={{ width: ring, height: ring, alignItems: "center", justifyContent: "center" }}>
      {/* Outer halo glow (only when active) */}
      {active ? (
        <View
          style={[
            styles.haloOuter,
            {
              width: ring + 22,
              height: ring + 22,
              borderRadius: (ring + 22) / 2,
              shadowColor: color,
              backgroundColor: color + "1A",
            },
          ]}
        />
      ) : null}

      {/* Coloured ring */}
      <View
        style={[
          styles.avatarRing,
          {
            width: ring,
            height: ring,
            borderRadius: ring / 2,
            borderColor: color,
            shadowColor: color,
            shadowOpacity: active ? 0.95 : 0.45,
            shadowRadius: active ? 18 : 10,
            elevation: active ? 14 : 6,
          },
        ]}
      >
        {/* Inner gradient disc */}
        <LinearGradient
          colors={[color + "55", color + "22", "rgba(0,0,0,0.55)"]}
          start={{ x: 0.3, y: 0.1 }}
          end={{ x: 0.7, y: 1 }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Feather name={icon as any} size={size * 0.46} color="#fff" />
        </LinearGradient>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Profile card                                                        */
/* ------------------------------------------------------------------ */
function ProfileCard({
  profile,
  onPress,
  size,
  avatarSize,
}: {
  profile: Profile;
  onPress: () => void;
  size: number;
  avatarSize: number;
}) {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isActive = pressed || focused || hovered;

  // Subtle scale animation on activation
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(scale, {
      toValue: isActive ? 1.07 : 1,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [isActive, scale]);

  return (
    <Pressable
      style={{ width: size }}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <Animated.View
        style={[
          styles.profileCard,
          isActive && styles.profileCardActive,
          { transform: [{ scale }] },
        ]}
      >
        <View style={styles.avatarWrap}>
          <ProfileAvatar
            icon={profile.avatar_icon}
            color={profile.avatar_color}
            size={avatarSize}
            active={isActive}
          />
          {profile.pin ? (
            <View style={[styles.lockBadge, { backgroundColor: profile.avatar_color }]}>
              <Feather name="lock" size={10} color="#fff" />
            </View>
          ) : null}
        </View>

        {/* Name pill — fills with the profile's accent colour when active */}
        <View
          style={[
            styles.namePill,
            isActive && {
              backgroundColor: profile.avatar_color + "22",
              borderColor: profile.avatar_color,
            },
          ]}
        >
          <ThemedText
            style={[styles.profileName, isActive && { color: "#fff" }]}
            numberOfLines={1}
          >
            {profile.name}
          </ThemedText>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Add profile card                                                    */
/* ------------------------------------------------------------------ */
function AddProfileCard({
  onPress,
  size,
  avatarSize,
}: {
  onPress: () => void;
  size: number;
  avatarSize: number;
}) {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isActive = pressed || focused || hovered;

  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(scale, {
      toValue: isActive ? 1.07 : 1,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [isActive, scale]);

  const ring = avatarSize + 14;

  return (
    <Pressable
      style={{ width: size }}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <Animated.View
        style={[
          styles.profileCard,
          isActive && styles.profileCardActive,
          { transform: [{ scale }] },
        ]}
      >
        <View style={{ width: ring, height: ring, alignItems: "center", justifyContent: "center" }}>
          {isActive ? (
            <View
              style={[
                styles.haloOuter,
                {
                  width: ring + 22,
                  height: ring + 22,
                  borderRadius: (ring + 22) / 2,
                  shadowColor: Colors.dark.accent,
                  backgroundColor: Colors.dark.accent + "1A",
                },
              ]}
            />
          ) : null}
          <View
            style={[
              styles.addRing,
              {
                width: ring,
                height: ring,
                borderRadius: ring / 2,
                borderColor: isActive ? Colors.dark.accent : Colors.dark.border,
                shadowColor: Colors.dark.accent,
                shadowOpacity: isActive ? 0.7 : 0,
                shadowRadius: isActive ? 14 : 0,
                elevation: isActive ? 10 : 0,
              },
            ]}
          >
            <View
              style={[
                styles.addInner,
                {
                  width: avatarSize,
                  height: avatarSize,
                  borderRadius: avatarSize / 2,
                  backgroundColor: isActive ? Colors.dark.accentDim : "rgba(255,255,255,0.03)",
                },
              ]}
            >
              <Feather
                name="plus"
                size={avatarSize * 0.5}
                color={isActive ? Colors.dark.accent : Colors.dark.textSecondary}
              />
            </View>
          </View>
        </View>

        <View
          style={[
            styles.namePill,
            isActive && { backgroundColor: Colors.dark.accentDim, borderColor: Colors.dark.accent },
          ]}
        >
          <ThemedText
            style={[
              styles.profileName,
              { color: isActive ? Colors.dark.accent : Colors.dark.textSecondary },
            ]}
            numberOfLines={1}
          >
            Add Profile
          </ThemedText>
        </View>
      </Animated.View>
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

  // Tighter, larger cards. Cap container at 1100px and centre it so the grid
  // never feels lost on big TV screens.
  const maxContentW = 1100;
  const numCols = isLandscape ? 4 : 3;
  const gap = Spacing.xl;
  const containerW = Math.min(width, maxContentW) - padH * 2;
  const cardSize = Math.floor((containerW - gap * (numCols - 1)) / numCols);
  const avatarSize = Math.max(72, Math.min(110, Math.floor(cardSize * 0.55)));

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      fetchProfiles(username)
        .then((p) => {
          if (active) {
            setProfiles(p);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [username]),
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
      {/* Layered ambient background — subtle vertical gradient + two radial-ish */}
      {/* glow blobs in opposite corners for depth (kept very faint).            */}
      <LinearGradient
        colors={["#0E0805", "#080808", "#0B0604"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
      />
      <View style={[styles.glowBlob, styles.glowBlobTopLeft]} pointerEvents="none" />
      <View style={[styles.glowBlob, styles.glowBlobBottomRight]} pointerEvents="none" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        {fromHome ? (
          <Pressable
            style={({ pressed, focused, hovered }) => [
              styles.iconBtn,
              (pressed || focused || hovered) && styles.iconBtnActive,
            ]}
            onPress={() => navigation.goBack()}
          >
            {({ pressed, focused, hovered }) => (
              <Feather
                name="arrow-left"
                size={20}
                color={pressed || focused || hovered ? Colors.dark.accent : Colors.dark.text}
              />
            )}
          </Pressable>
        ) : (
          <View style={{ width: 44 }} />
        )}

        <View style={styles.headerCenter}>
          <ThemedText style={styles.eyebrow}>ULTRA CAST</ThemedText>
          <ThemedText style={styles.title}>Who's Watching?</ThemedText>
          <ThemedText style={styles.subtitle}>Choose a profile to continue</ThemedText>
        </View>

        <View style={{ width: 44 }} />
      </View>

      {/* Accent divider with a subtle gradient fade on each end */}
      <View style={[styles.dividerWrap, { marginHorizontal: padH }]}>
        <LinearGradient
          colors={["transparent", Colors.dark.accent + "AA", "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.dividerLine}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
        </View>
      ) : (
        <View style={styles.gridOuter}>
          <FlatList
            data={items}
            keyExtractor={(item) => (item === "add" ? "__add__" : (item as Profile).id)}
            numColumns={numCols}
            key={`profiles-${numCols}`}
            contentContainerStyle={[
              styles.grid,
              {
                paddingHorizontal: padH,
                paddingBottom: padB,
                gap,
                maxWidth: maxContentW,
                alignSelf: "center",
                width: "100%",
              },
            ]}
            columnWrapperStyle={numCols > 1 ? { gap, justifyContent: "center" } : undefined}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              if (item === "add") {
                return (
                  <AddProfileCard
                    size={cardSize}
                    avatarSize={avatarSize}
                    onPress={() => navigation.navigate("CreateProfile", {})}
                  />
                );
              }
              const p = item as Profile;
              return (
                <ProfileCard
                  profile={p}
                  size={cardSize}
                  avatarSize={avatarSize}
                  onPress={() => handleSelect(p)}
                />
              );
            }}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Feather name="users" size={40} color={Colors.dark.border} />
                <ThemedText style={styles.emptyText}>No profiles yet</ThemedText>
                <ThemedText style={styles.emptySubText}>
                  Create a profile to get started
                </ThemedText>
              </View>
            }
          />
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },

  /* Ambient glow blobs */
  glowBlob: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: Colors.dark.accent,
    opacity: 0.06,
  },
  glowBlobTopLeft: { top: -180, left: -160 },
  glowBlobBottomRight: { bottom: -200, right: -160, opacity: 0.04 },

  /* Header */
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  headerCenter: { flex: 1, alignItems: "center", gap: 2 },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.accent,
    letterSpacing: 3,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 0.4,
    marginTop: 2,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.dark.textSecondary,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
  },
  iconBtnActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accentDim,
    shadowColor: Colors.dark.accent,
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 6,
  },

  /* Divider */
  dividerWrap: { marginBottom: Spacing["2xl"], marginTop: Spacing.xs },
  dividerLine: { height: 1, width: "100%" },

  /* Grid */
  gridOuter: { flex: 1 },
  grid: { paddingTop: Spacing.lg, paddingBottom: Spacing["3xl"] },

  /* Profile card */
  profileCard: {
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  profileCardActive: {
    borderColor: "rgba(255,102,0,0.35)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },

  /* Avatar */
  avatarWrap: { position: "relative", alignItems: "center", justifyContent: "center" },
  haloOuter: {
    position: "absolute",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 28,
    elevation: 12,
  },
  avatarRing: {
    borderWidth: 2.5,
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 0 },
    backgroundColor: "#000",
  },
  lockBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundRoot,
  },

  /* Name pill */
  namePill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "rgba(255,255,255,0.04)",
    minWidth: 80,
    maxWidth: "95%",
    alignItems: "center",
  },
  profileName: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0.2,
  },

  /* Add card */
  addRing: {
    borderWidth: 2,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 0 },
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  addInner: { justifyContent: "center", alignItems: "center" },

  /* Empty / loading */
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
    paddingTop: Spacing["4xl"],
  },
  emptyText: { color: Colors.dark.text, fontSize: 16, fontWeight: "600" },
  emptySubText: { color: Colors.dark.textSecondary, fontSize: 13 },
});
