import React, { useCallback, useState } from "react";
import SideMenuButton from "@/components/SideMenuButton";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
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
import {
  useProfile,
  getHwDecode,
  getBufferMs,
  normaliseBufferMs,
  type PlayerEngine,
  type HwDecodeMode,
  type BufferPreset,
} from "@/contexts/ProfileContext";
import { getApiUrl } from "@/lib/query-client";
import { saveGuestPlayerPrefs } from "@/lib/guest-prefs";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Side-by-side (50/50) engine cards kick in once the screen is wide enough
// to comfortably show two columns — TVs and tablets in landscape. Phones and
// narrow windows keep the stacked layout.
const WIDE_BREAKPOINT = 700;

const BUFFER_PRESETS: { ms: BufferPreset; label: string; sub: string }[] = [
  { ms: 1500,  label: "1.5s",   sub: "Minimal — closest to live, lowest tolerance for drops" },
  { ms: 3000,  label: "3s",     sub: "Balanced — recommended for most connections" },
  { ms: 5000,  label: "5s",     sub: "Standard — absorbs brief provider hiccups" },
  { ms: 10000, label: "10s",    sub: "High — for unstable or congested connections" },
  { ms: 30000, label: "30s",    sub: "Maximum — 30s behind live, very resilient" },
];

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

/** Generic radio-style option row used by both the engine and HW toggles. */
function OptionRow({
  selected,
  label,
  sub,
  onPress,
  disabled,
}: {
  selected: boolean;
  label: string;
  sub: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <HoverBtn
      style={[styles.engineOpt, selected && styles.engineOptSelected]}
      activeStyle={styles.engineOptHover}
      onPress={() => !selected && onPress()}
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
  return (
    <View style={styles.engineRow}>
      <OptionRow
        selected={value === "vlc"}
        label="VLC"
        sub="Best codec coverage (AC3/EAC3, exotic TS)"
        onPress={() => onChange("vlc")}
        disabled={disabled}
      />
      <OptionRow
        selected={value === "expo"}
        label="Expo"
        sub="Native Media3 — smooth on some HLS streams"
        onPress={() => onChange("expo")}
        disabled={disabled}
      />
    </View>
  );
}

function HwDecodeToggle({
  value,
  onChange,
  disabled,
}: {
  value: HwDecodeMode;
  onChange: (next: HwDecodeMode) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.engineRow}>
      <OptionRow
        selected={value === "auto"}
        label="Automatic"
        sub="Recommended — let the app choose for this device"
        onPress={() => onChange("auto")}
        disabled={disabled}
      />
      <OptionRow
        selected={value === "on"}
        label="On"
        sub="Use the device's video chip — smoother HD & 4K"
        onPress={() => onChange("on")}
        disabled={disabled}
      />
      <OptionRow
        selected={value === "off"}
        label="Off"
        sub="Fixes a glitchy picture, freezing or no sound on some devices"
        onPress={() => onChange("off")}
        disabled={disabled}
      />
    </View>
  );
}

export default function PlayerSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { width } = useWindowDimensions();
  const { activeProfile, isGuest, updateActiveProfile, refreshActiveProfile } = useProfile();

  const [savingKey, setSavingKey] = useState<
    "player_vod" | "player_live" | "player_hw_decode" | "player_buffer_ms" | null
  >(null);

  // Pull the latest player prefs every time this screen gains focus, so
  // admin-side flips show up without needing to log out and back in.
  // Skipped while a save is in flight to avoid the optimistic UI snapping
  // back mid-edit.
  useFocusEffect(
    useCallback(() => {
      if (savingKey) return;
      refreshActiveProfile();
    }, [refreshActiveProfile, savingKey]),
  );

  const vod: PlayerEngine = activeProfile?.player_vod === "expo" ? "expo" : "vlc";
  const live: PlayerEngine = activeProfile?.player_live === "expo" ? "expo" : "vlc";
  const hw: HwDecodeMode = getHwDecode(activeProfile);
  const bufferMs: BufferPreset = getBufferMs(activeProfile);

  const isWide = width >= WIDE_BREAKPOINT;

  const persist = async (
    key: "player_vod" | "player_live" | "player_hw_decode",
    next: PlayerEngine | HwDecodeMode,
  ) => {
    if (!activeProfile) return;
    const prev: PlayerEngine | HwDecodeMode =
      key === "player_hw_decode"
        ? getHwDecode(activeProfile)
        : activeProfile[key] === "expo"
          ? "expo"
          : "vlc";
    if (prev === next) return;
    setSavingKey(key);
    // Optimistic update so the UI feels instant; revert on failure.
    updateActiveProfile({ [key]: next } as any);

    // Guest: persist device-locally (AsyncStorage), never touch the API.
    if (isGuest) {
      try {
        await saveGuestPlayerPrefs({
          player_vod: key === "player_vod" ? (next as PlayerEngine) : vod,
          player_live: key === "player_live" ? (next as PlayerEngine) : live,
          player_hw_decode:
            key === "player_hw_decode" ? (next as HwDecodeMode) : hw,
          player_buffer_ms: bufferMs,
        });
      } catch (e) {
        updateActiveProfile({ [key]: prev } as any);
        Alert.alert(
          "Could not save",
          "We couldn't save your choice on this device. Please try again.",
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
        "We couldn't save your choice. Check your connection and try again.",
      );
    } finally {
      setSavingKey(null);
    }
  };

  const persistBuffer = async (next: BufferPreset) => {
    if (!activeProfile) return;
    const prev = bufferMs;
    if (prev === next) return;
    setSavingKey("player_buffer_ms");
    updateActiveProfile({ player_buffer_ms: next });

    if (isGuest) {
      try {
        await saveGuestPlayerPrefs({
          player_vod: vod,
          player_live: live,
          player_hw_decode: hw,
          player_buffer_ms: next,
        });
      } catch {
        updateActiveProfile({ player_buffer_ms: prev });
        Alert.alert(
          "Could not save",
          "We couldn't save your choice on this device. Please try again.",
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
        body: JSON.stringify({ player_buffer_ms: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      updateActiveProfile({ player_buffer_ms: prev });
      Alert.alert(
        "Could not save",
        "We couldn't save your choice. Check your connection and try again.",
      );
    } finally {
      setSavingKey(null);
    }
  };

  const padH = Math.max(insets.left + Spacing.sm, Spacing.lg);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.md);

  const vodCard = (
    <View style={[styles.card, isWide && styles.cardHalf]}>
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
  );

  const liveCard = (
    <View style={[styles.card, isWide && styles.cardHalf]}>
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
  );

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <SideMenuButton />
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

          {/* Engine cards: side-by-side (50/50) on wide screens, stacked otherwise */}
          <View style={isWide ? styles.cardRow : undefined}>
            {vodCard}
            {liveCard}
          </View>

          {/* Hardware decoding card — applies to both Live TV and VOD on VLC */}
          <View style={styles.card}>
            <LinearGradient
              colors={["rgba(255,102,0,0.10)", "rgba(255,102,0,0.02)"]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <View style={styles.cardHeader}>
              <Feather name="cpu" size={16} color={Colors.dark.accent} />
              <ThemedText style={styles.cardTitle}>Video Decoding</ThemedText>
              {savingKey === "player_hw_decode" ? (
                <ActivityIndicator size="small" color={Colors.dark.accent} />
              ) : null}
            </View>
            <ThemedText style={styles.cardSub}>
              Only change this if video looks glitchy, freezes, or has no sound
              on this device. Applies to both Live TV and Movies &amp; Series
              when using the VLC player.
            </ThemedText>
            <HwDecodeToggle
              value={hw}
              onChange={(next) => persist("player_hw_decode", next)}
              disabled={savingKey !== null}
            />
          </View>

          {/* Pre-buffer card — applies to both VLC and Expo engines */}
          <View style={styles.card}>
            <LinearGradient
              colors={["rgba(255,102,0,0.10)", "rgba(255,102,0,0.02)"]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <View style={styles.cardHeader}>
              <Feather name="wifi" size={16} color={Colors.dark.accent} />
              <ThemedText style={styles.cardTitle}>Stream Pre-Buffer</ThemedText>
              {savingKey === "player_buffer_ms" ? (
                <ActivityIndicator size="small" color={Colors.dark.accent} />
              ) : null}
            </View>
            <ThemedText style={styles.cardSub}>
              How far ahead of playback the player buffers the stream. A larger
              buffer absorbs brief freezes and reconnections at the cost of a
              slightly larger delay behind the live edge. Applies on the next
              stream you open.
            </ThemedText>
            <View style={styles.bufferGrid}>
              {BUFFER_PRESETS.map((preset) => {
                const selected = bufferMs === preset.ms;
                return (
                  <HoverBtn
                    key={preset.ms}
                    style={[styles.bufferOpt, selected && styles.bufferOptSelected]}
                    activeStyle={styles.bufferOptHover}
                    onPress={() => persistBuffer(preset.ms)}
                    disabled={savingKey !== null}
                  >
                    {(active) => (
                      <View style={styles.bufferOptInner}>
                        <View style={styles.bufferOptTop}>
                          <View style={styles.engineRadio}>
                            {selected ? <View style={styles.engineRadioDot} /> : null}
                          </View>
                          <ThemedText
                            style={[
                              styles.bufferLabel,
                              (selected || active) && { color: Colors.dark.accent },
                            ]}
                          >
                            {preset.label}
                          </ThemedText>
                          {selected ? (
                            <Feather name="check" size={13} color={Colors.dark.accent} />
                          ) : null}
                        </View>
                        <ThemedText style={styles.bufferSub}>{preset.sub}</ThemedText>
                      </View>
                    )}
                  </HoverBtn>
                );
              })}
            </View>
          </View>

          <View style={styles.tipRow}>
            <Feather name="alert-circle" size={13} color={Colors.dark.textSecondary} />
            <ThemedText style={styles.tipText}>
              VLC is the default and handles AC3/EAC3 audio plus most exotic
              IPTV streams. Switch to Expo if a specific stream stutters or
              fails to start. If a device shows a broken or stuttering picture
              on every channel, set Video Decoding to Off.
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

  cardRow: {
    flexDirection: "row",
    gap: Spacing.md,
    alignItems: "stretch",
  },
  card: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: "rgba(255,102,0,0.3)",
    padding: Spacing.lg,
    gap: Spacing.sm,
    overflow: "hidden",
  },
  cardHalf: { flex: 1 },
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

  bufferGrid: { gap: Spacing.xs },
  bufferOpt: {
    backgroundColor: "rgba(255,255,255,0.025)",
    borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.dark.border,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
  },
  bufferOptSelected: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accentDim,
  },
  bufferOptHover: { borderColor: Colors.dark.accent },
  bufferOptInner: { gap: 2 },
  bufferOptTop: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
  },
  bufferLabel: { flex: 1, fontSize: 13, fontWeight: "700", color: Colors.dark.text },
  bufferSub: { fontSize: 11, color: Colors.dark.textSecondary, marginLeft: 26 },

  tipRow: {
    flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm,
    paddingHorizontal: Spacing.xs, paddingTop: Spacing.xs,
  },
  tipText: {
    flex: 1, fontSize: 11, color: Colors.dark.textSecondary, lineHeight: 16,
  },
});
