import React, { useCallback, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useProfile, type PlayerEngine } from "@/contexts/ProfileContext";
import { getApiUrl } from "@/lib/query-client";
import { saveGuestPlayerPrefs } from "@/lib/guest-prefs";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

function HoverBtn({
  style,
  activeStyle,
  onPress,
  disabled,
  children,
}: {
  style: any;
  activeStyle: any;
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode | ((isActive: boolean) => React.ReactNode);
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[style, isActive && activeStyle]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
    >
      {typeof children === "function" ? children(isActive) : children}
    </Pressable>
  );
}

function EngineToggle({
  value,
  onChange,
  disabled,
}: {
  value: PlayerEngine;
  onChange: (next: PlayerEngine) => void;
  disabled?: boolean;
}) {
  const opt = (engine: PlayerEngine, label: string, sub: string) => {
    const selected = value === engine;
    return (
      <HoverBtn
        key={engine}
        style={[styles.engineOpt, selected && styles.engineOptSelected]}
        activeStyle={styles.engineOptHover}
        onPress={() => !selected && onChange(engine)}
        disabled={disabled}
      >
        {(active) => (
          <>
            <View style={styles.engineRadio}>
              {selected ? <View style={styles.engineRadioDot} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText
                style={[
                  styles.engineLabel,
                  (selected || active) && { color: Colors.dark.accent },
                ]}
              >
                {label}
              </ThemedText>
              <ThemedText style={styles.engineSub}>{sub}</ThemedText>
            </View>
            {selected ? (
              <Feather name="check" size={16} color={Colors.dark.accent} />
            ) : null}
          </>
        )}
      </HoverBtn>
    );
  };
  return (
    <View style={styles.engineRow}>
      {opt("vlc", "VLC", "Best codec coverage (AC3/EAC3, exotic TS)")}
      {opt("expo", "Expo", "Native Media3 — smooth on some HLS streams")}
    </View>
  );
}

export default function PlayerSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { activeProfile, isGuest, updateActiveProfile, refreshActiveProfile } = useProfile();

  const [savingKey, setSavingKey] = useState<"player_vod" | "player_live" | null>(null);

  // Pull the latest player_vod / player_live every time this screen
  // gains focus, so admin-side flips show up without needing to log
  // out and back in. Skipped while a save is in flight to avoid the
  // optimistic UI snapping back mid-edit.
  useFocusEffect(
    useCallback(() => {
      if (savingKey) return;
      refreshActiveProfile();
    }, [refreshActiveProfile, savingKey]),
  );

  const vod: PlayerEngine = activeProfile?.player_vod === "expo" ? "expo" : "vlc";
  const live: PlayerEngine = activeProfile?.player_live === "expo" ? "expo" : "vlc";

  const persist = async (key: "player_vod" | "player_live", next: PlayerEngine) => {
    if (!activeProfile) return;
    const prev = activeProfile[key] === "expo" ? "expo" : "vlc";
    if (prev === next) return;
    setSavingKey(key);
    // Optimistic update so the UI feels instant; revert on failure.
    updateActiveProfile({ [key]: next } as any);

    // Guest: persist device-locally (AsyncStorage), never touch the API.
    if (isGuest) {
      try {
        await saveGuestPlayerPrefs({
          player_vod: key === "player_vod" ? next : vod,
          player_live: key === "player_live" ? next : live,
        });
      } catch (e) {
        updateActiveProfile({ [key]: prev } as any);
        Alert.alert(
          "Could not save",
          "We couldn't save your player choice on this device. Please try again.",
        );
      } finally {
        setSavingKey(null);
      }
      return;
    }

    try {
      const url = new URL(`/api/profiles/${activeProfile.id}`, getApiUrl());
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      updateActiveProfile({ [key]: prev } as any);
      Alert.alert(
        "Could not save",
        "We couldn't save your player choice. Check your connection and try again.",
      );
    } finally {
      setSavingKey(null);
    }
  };

  const padH = Math.max(insets.left + Spacing.sm, Spacing.lg);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.md);

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <HoverBtn
          style={styles.iconBtn}
          activeStyle={styles.iconBtnActive}
          onPress={() => navigation.goBack()}
        >
          {(active) => (
            <Feather
              name="arrow-left"
              size={20}
              color={active ? Colors.dark.accent : Colors.dark.text}
            />
          )}
        </HoverBtn>
        <ThemedText style={styles.headerTitle}>Player Settings</ThemedText>
        <View style={styles.iconBtnSpacer} />
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      {!activeProfile ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.body,
            { paddingHorizontal: padH, paddingBottom: padB },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.profileBadge}>
            <View
              style={[
                styles.profileAvatar,
                {
                  backgroundColor: activeProfile.avatar_color + "33",
                  borderColor: activeProfile.avatar_color,
                },
              ]}
            >
              <Feather
                name={activeProfile.avatar_icon as any}
                size={16}
                color={activeProfile.avatar_color}
              />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.profileLabel}>Saving for profile</ThemedText>
              <ThemedText
                style={[styles.profileName, { color: activeProfile.avatar_color }]}
                numberOfLines={1}
              >
                {activeProfile.name}
              </ThemedText>
            </View>
          </View>

          <View style={styles.intro}>
            <Feather name="info" size={14} color={Colors.dark.accent} />
            <ThemedText style={styles.introText}>
              Some streams play better on one engine than the other. Pick the
              player that works best for you on each tab. Changes apply the
              next time you start a stream.
            </ThemedText>
          </View>

          {/* VOD card */}
          <View style={styles.card}>
            <LinearGradient
              colors={["rgba(255,102,0,0.10)", "rgba(255,102,0,0.02)"]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <View style={styles.cardHeader}>
              <Feather name="film" size={16} color={Colors.dark.accent} />
              <ThemedText style={styles.cardTitle}>Movies &amp; Series</ThemedText>
              {savingKey === "player_vod" ? (
                <ActivityIndicator size="small" color={Colors.dark.accent} />
              ) : null}
            </View>
            <ThemedText style={styles.cardSub}>
              Used by Movies, Series and Catch Up.
            </ThemedText>
            <EngineToggle
              value={vod}
              onChange={(next) => persist("player_vod", next)}
              disabled={savingKey !== null}
            />
          </View>

          {/* Live card */}
          <View style={styles.card}>
            <LinearGradient
              colors={["rgba(255,102,0,0.10)", "rgba(255,102,0,0.02)"]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <View style={styles.cardHeader}>
              <Feather name="tv" size={16} color={Colors.dark.accent} />
              <ThemedText style={styles.cardTitle}>Live TV</ThemedText>
              {savingKey === "player_live" ? (
                <ActivityIndicator size="small" color={Colors.dark.accent} />
              ) : null}
            </View>
            <ThemedText style={styles.cardSub}>
              Used by Live TV channels and the live preview screen.
            </ThemedText>
            <EngineToggle
              value={live}
              onChange={(next) => persist("player_live", next)}
              disabled={savingKey !== null}
            />
          </View>

          <View style={styles.tipRow}>
            <Feather name="alert-circle" size={13} color={Colors.dark.textSecondary} />
            <ThemedText style={styles.tipText}>
              VLC is the default and handles AC3/EAC3 audio plus most exotic
              IPTV streams. Switch to Expo if a specific stream stutters or
              fails to start.
            </ThemedText>
          </View>
        </ScrollView>
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
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: Colors.dark.text },
  divider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.md },
  iconBtn: {
    width: 40, height: 40, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  iconBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  iconBtnSpacer: { width: 40, height: 40 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  body: { gap: Spacing.md },

  profileBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
  },
  profileAvatar: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2, justifyContent: "center", alignItems: "center",
  },
  profileLabel: {
    fontSize: 10, color: Colors.dark.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  profileName: { fontSize: 14, fontWeight: "700" },

  intro: {
    flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm,
    backgroundColor: "rgba(255,102,0,0.06)",
    borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: "rgba(255,102,0,0.25)",
    padding: Spacing.md,
  },
  introText: {
    flex: 1, fontSize: 12, color: Colors.dark.textSecondary, lineHeight: 18,
  },

  card: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: "rgba(255,102,0,0.3)",
    padding: Spacing.lg,
    gap: Spacing.sm,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
  },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: Colors.dark.text },
  cardSub: { fontSize: 12, color: Colors.dark.textSecondary, marginBottom: Spacing.xs },

  engineRow: { gap: Spacing.sm },
  engineOpt: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md,
    backgroundColor: "rgba(255,255,255,0.025)",
    borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  engineOptSelected: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accentDim,
  },
  engineOptHover: { borderColor: Colors.dark.accent },
  engineRadio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: Colors.dark.accent,
    justifyContent: "center", alignItems: "center",
  },
  engineRadioDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.dark.accent,
  },
  engineLabel: { fontSize: 14, fontWeight: "700", color: Colors.dark.text },
  engineSub: { fontSize: 11, color: Colors.dark.textSecondary, marginTop: 2 },

  tipRow: {
    flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm,
    paddingHorizontal: Spacing.xs, paddingTop: Spacing.xs,
  },
  tipText: {
    flex: 1, fontSize: 11, color: Colors.dark.textSecondary, lineHeight: 16,
  },
});
