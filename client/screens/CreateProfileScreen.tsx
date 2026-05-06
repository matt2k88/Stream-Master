import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/contexts/ProfileContext";
import { getApiUrl } from "@/lib/query-client";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type CreateProfileRouteProp = RouteProp<RootStackParamList, "CreateProfile">;

const AVATAR_ICONS: Array<keyof typeof Feather.glyphMap> = [
  "user", "smile", "star", "heart", "zap", "sun", "moon",
  "music", "coffee", "compass", "shield", "award",
  "camera", "film", "tv", "headphones", "globe", "feather",
];

const AVATAR_COLORS = [
  "#FF6600", "#E91E63", "#9C27B0", "#3F51B5",
  "#2196F3", "#00BCD4", "#4CAF50", "#FF9800",
  "#F44336", "#009688", "#795548", "#607D8B",
];

// ─── Focusable wrappers with hover/focus overlays ────────────────────────────
function IconBtn({ onPress, children }: { onPress: () => void; children: React.ReactNode | ((isActive: boolean) => React.ReactNode) }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[styles.iconBtn, isActive && styles.iconBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      {typeof children === "function" ? children(isActive) : children}
    </Pressable>
  );
}

function IconOption({
  ic, isSelected, color, onPress,
}: { ic: keyof typeof Feather.glyphMap; isSelected: boolean; color: string; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[
        styles.iconOption,
        { borderColor: isSelected ? color : Colors.dark.border },
        isSelected && { backgroundColor: color + "22" },
        isActive && styles.iconOptionActive,
        isActive && { borderColor: color, backgroundColor: color + "33" },
      ]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      <Feather name={ic} size={isActive ? 24 : 22} color={isSelected || isActive ? color : Colors.dark.textSecondary} />
    </Pressable>
  );
}

function ColorSwatch({ c, isSelected, onPress }: { c: string; isSelected: boolean; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[
        styles.colorSwatch,
        { backgroundColor: c },
        isSelected && styles.colorSwatchSelected,
        isActive && styles.colorSwatchActive,
      ]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      {isSelected ? <Feather name="check" size={14} color="#fff" /> : null}
    </Pressable>
  );
}

function PinToggleRow({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[
        styles.pinToggleRow,
        isActive && styles.pinToggleRowActive,
        enabled && styles.pinToggleRowEnabled,
      ]}
      onPress={onToggle}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
    >
      <View style={styles.pinToggleLeft}>
        <View style={[styles.pinIconWrap, enabled && styles.pinIconWrapEnabled]}>
          <Feather
            name="lock"
            size={16}
            color={enabled ? Colors.dark.accent : Colors.dark.textSecondary}
          />
        </View>
        <View>
          <ThemedText style={styles.pinToggleTitle}>PIN Protection</ThemedText>
          <ThemedText style={styles.pinToggleSubtitle}>
            Require a 4-digit PIN to access
          </ThemedText>
        </View>
      </View>
      {/* Custom toggle pill — no Switch, fully TV-remote focusable */}
      <View style={[styles.toggleTrack, enabled && styles.toggleTrackOn]}>
        <View style={[styles.toggleThumb, enabled && styles.toggleThumbOn]} />
      </View>
    </Pressable>
  );
}

function PinKey({ k, onPress }: { k: string; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[
        styles.pinKey,
        !k && styles.pinKeyEmpty,
        k && isActive && styles.pinKeyPressed,
      ]}
      onPress={onPress}
      onFocus={() => k ? setFocused(true) : undefined}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={!k}
    >
      <ThemedText style={[styles.pinKeyText, !k && { color: "transparent" }, isActive && k && styles.pinKeyTextActive]}>{k}</ThemedText>
    </Pressable>
  );
}

export default function CreateProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<CreateProfileRouteProp>();
  const editing = route.params?.profile;
  const { userInfo } = useAuth();
  const { setActiveProfile, clearProfile } = useProfile();
  const username = userInfo?.user_info?.username ?? "";

  const [name, setName] = useState(editing?.name ?? "");
  const [icon, setIcon] = useState(editing?.avatar_icon ?? "user");
  const [color, setColor] = useState(editing?.avatar_color ?? AVATAR_COLORS[0]);
  const [pinEnabled, setPinEnabled] = useState(!!editing?.pin);
  const [pin, setPin] = useState(editing?.pin ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [saveFocused, setSaveFocused] = useState(false);
  const [deleteFocused, setDeleteFocused] = useState(false);

  const padH = Math.max(insets.left + Spacing.sm, Spacing.lg);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.sm, Spacing.xl);

  const isValid = name.trim().length > 0 && (!pinEnabled || pin.length === 4);

  const handleSave = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    try {
      const body = {
        account_username: username,
        name: name.trim(),
        avatar_icon: icon,
        avatar_color: color,
        pin: pinEnabled && pin.length === 4 ? pin : null,
      };
      const baseUrl = getApiUrl();
      const url = editing
        ? new URL(`/api/profiles/${editing.id}`, baseUrl).toString()
        : new URL("/api/profiles", baseUrl).toString();
      const method = editing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Error", data.error ?? "Failed to save profile");
        return;
      }

      if (editing) {
        // Update the active profile in context with new data
        setActiveProfile(data);
        navigation.goBack();
      } else {
        // New profile — set as active and go straight to Home
        setActiveProfile(data);
        navigation.reset({ index: 0, routes: [{ name: "Home" }] });
      }
    } catch {
      Alert.alert("Error", "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!editing) return;
    Alert.alert(
      "Delete Profile",
      `Are you sure you want to delete "${editing.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              const url = new URL(`/api/profiles/${editing.id}`, getApiUrl()).toString();
              const res = await fetch(url, { method: "DELETE" });
              if (!res.ok) throw new Error();
              clearProfile();
              navigation.reset({ index: 0, routes: [{ name: "ProfilePicker" }] });
            } catch {
              Alert.alert("Error", "Failed to delete profile");
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <IconBtn onPress={() => navigation.goBack()}>
          {(active) => <Feather name="arrow-left" size={20} color={active ? Colors.dark.accent : Colors.dark.text} />}
        </IconBtn>
        <ThemedText style={styles.headerTitle}>
          {editing ? "Edit Profile" : "New Profile"}
        </ThemedText>
        <View style={{ width: 40 }} />
      </View>
      <View style={[styles.divider, { marginHorizontal: padH }]} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: padH, paddingBottom: padB, gap: Spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        {/* Preview */}
        <View style={styles.previewRow}>
          <View style={[styles.avatarPreviewRing, { borderColor: color, shadowColor: color }]}>
            <View style={[styles.avatarPreviewInner, { backgroundColor: color + "33" }]}>
              <Feather name={icon as any} size={36} color={color} />
            </View>
          </View>
          <ThemedText style={styles.previewName} numberOfLines={1}>
            {name.trim() || "Profile Name"}
          </ThemedText>
        </View>

        {/* Name input */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionLabel}>Profile Name</ThemedText>
          <TextInput
            style={[styles.textInput, nameFocused && styles.textInputFocused]}
            value={name}
            onChangeText={setName}
            placeholder="Enter a name"
            placeholderTextColor={Colors.dark.border}
            maxLength={24}
            autoCorrect={false}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
          />
        </View>

        {/* Icon picker */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionLabel}>Avatar</ThemedText>
          <View style={styles.iconGrid}>
            {AVATAR_ICONS.map((ic) => (
              <IconOption
                key={ic}
                ic={ic}
                isSelected={ic === icon}
                color={color}
                onPress={() => setIcon(ic)}
              />
            ))}
          </View>
        </View>

        {/* Color picker */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionLabel}>Color</ThemedText>
          <View style={styles.colorGrid}>
            {AVATAR_COLORS.map((c) => (
              <ColorSwatch
                key={c}
                c={c}
                isSelected={c === color}
                onPress={() => setColor(c)}
              />
            ))}
          </View>
        </View>

        {/* PIN protection */}
        <View style={styles.section}>
          <PinToggleRow
            enabled={pinEnabled}
            onToggle={() => { setPinEnabled((v) => { if (v) setPin(""); return !v; }); }}
          />

          {pinEnabled ? (
            <View style={styles.pinInputSection}>
              <ThemedText style={styles.pinLabel}>Enter 4-digit PIN</ThemedText>
              <View style={styles.pinDots}>
                {[0, 1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.pinDot,
                      { borderColor: pin.length > i ? Colors.dark.accent : Colors.dark.border },
                      pin.length > i && { backgroundColor: Colors.dark.accent },
                    ]}
                  />
                ))}
              </View>
              <View style={styles.pinPad}>
                {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, idx) => (
                  <PinKey
                    key={idx}
                    k={k}
                    onPress={() => {
                      if (!k) return;
                      if (k === "⌫") { setPin((p) => p.slice(0, -1)); }
                      else if (pin.length < 4) { setPin((p) => p + k); }
                    }}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </View>

        {/* Save button */}
        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            !isValid && styles.saveBtnDisabled,
            (pressed || saveFocused) && isValid && styles.saveBtnPressed,
          ]}
          onPress={handleSave}
          disabled={!isValid || saving}
          onFocus={() => setSaveFocused(true)}
          onBlur={() => setSaveFocused(false)}
        >
          <LinearGradient
            colors={isValid ? (saveFocused ? ["#FFA040", "#FF6600"] : ["#FF8C1A", "#FF5500"]) : [Colors.dark.backgroundDefault, Colors.dark.backgroundDefault]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          />
          <ThemedText style={[styles.saveBtnText, !isValid && styles.saveBtnTextDisabled]}>
            {saving ? "Saving..." : editing ? "Save Changes" : "Create Profile"}
          </ThemedText>
        </Pressable>

        {/* Delete button — only when editing */}
        {editing ? (
          <Pressable
            style={({ pressed }) => [
              styles.deleteBtn,
              (pressed || deleteFocused) && styles.deleteBtnPressed,
              deleting && styles.saveBtnDisabled,
            ]}
            onPress={handleDelete}
            disabled={deleting}
            onFocus={() => setDeleteFocused(true)}
            onBlur={() => setDeleteFocused(false)}
          >
            <Feather name="trash-2" size={16} color={Colors.dark.error} />
            <ThemedText style={styles.deleteBtnText}>
              {deleting ? "Deleting..." : "Delete Profile"}
            </ThemedText>
          </Pressable>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { flexDirection: "row", alignItems: "center", paddingBottom: Spacing.md, gap: Spacing.md },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: Colors.dark.text },
  iconBtn: {
    width: 40, height: 40, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  iconBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  divider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.md },
  previewRow: { alignItems: "center", gap: Spacing.md, paddingVertical: Spacing.sm },
  avatarPreviewRing: {
    width: 96, height: 96, borderRadius: 48, borderWidth: 3,
    justifyContent: "center", alignItems: "center",
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 16, elevation: 10,
  },
  avatarPreviewInner: { width: 80, height: 80, borderRadius: 40, justifyContent: "center", alignItems: "center" },
  previewName: { fontSize: 18, fontWeight: "700", color: Colors.dark.text },
  section: { gap: Spacing.sm },
  sectionLabel: {
    fontSize: 11, fontWeight: "700", color: Colors.dark.accent,
    textTransform: "uppercase", letterSpacing: 1,
  },
  textInput: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.dark.border,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    color: Colors.dark.text, fontSize: 16, fontWeight: "500",
  },
  textInputFocused: {
    borderColor: Colors.dark.accent,
    backgroundColor: "rgba(255,102,0,0.08)",
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 8, elevation: 4,
  },
  iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  iconOption: {
    width: 52, height: 52, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1.5, justifyContent: "center", alignItems: "center",
  },
  iconOptionActive: {
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7, shadowRadius: 10, elevation: 6,
    transform: [{ scale: 1.08 }],
  },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  colorSwatch: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: "center", alignItems: "center",
  },
  colorSwatchSelected: {
    borderWidth: 3, borderColor: "#fff",
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 8, elevation: 6,
  },
  colorSwatchActive: {
    borderWidth: 3, borderColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1, shadowRadius: 12, elevation: 8,
    transform: [{ scale: 1.12 }],
  },
  pinToggleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundDefault, borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.dark.border, padding: Spacing.md,
  },
  pinToggleRowActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: "rgba(255,102,0,0.08)",
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 8, elevation: 4,
  },
  pinToggleRowEnabled: {
    borderColor: "rgba(255,102,0,0.4)",
  },
  pinToggleLeft: { flexDirection: "row", alignItems: "center", gap: Spacing.md, flex: 1 },
  pinIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center", alignItems: "center",
  },
  pinIconWrapEnabled: {
    backgroundColor: "rgba(255,102,0,0.15)",
  },
  pinToggleTitle: { fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  pinToggleSubtitle: { fontSize: 12, color: Colors.dark.textSecondary },
  toggleTrack: {
    width: 48, height: 28, borderRadius: 14,
    backgroundColor: Colors.dark.border,
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  toggleTrackOn: {
    backgroundColor: Colors.dark.accent,
  },
  toggleThumb: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.dark.textSecondary,
    alignSelf: "flex-start",
  },
  toggleThumbOn: {
    backgroundColor: "#fff",
    alignSelf: "flex-end",
  },
  pinInputSection: { gap: Spacing.md, alignItems: "center" },
  pinLabel: { color: Colors.dark.textSecondary, fontSize: 13 },
  pinDots: { flexDirection: "row", gap: Spacing.md },
  pinDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, backgroundColor: "transparent" },
  pinPad: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm, maxWidth: 220, justifyContent: "center" },
  pinKey: {
    width: 64, height: 64, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  pinKeyEmpty: { backgroundColor: "transparent", borderColor: "transparent" },
  pinKeyPressed: { backgroundColor: Colors.dark.accentDim, borderColor: Colors.dark.accent },
  pinKeyText: { color: Colors.dark.text, fontSize: 20, fontWeight: "600" },
  pinKeyTextActive: { color: Colors.dark.accent },
  saveBtn: {
    height: 52, borderRadius: BorderRadius.sm, overflow: "hidden",
    justifyContent: "center", alignItems: "center", marginTop: Spacing.sm,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
  },
  saveBtnDisabled: { shadowOpacity: 0, elevation: 0 },
  saveBtnPressed: { opacity: 0.85 },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  saveBtnTextDisabled: { color: Colors.dark.textSecondary },
  deleteBtn: {
    height: 52, borderRadius: BorderRadius.sm,
    justifyContent: "center", alignItems: "center",
    flexDirection: "row", gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: "rgba(255,59,59,0.4)",
  },
  deleteBtnPressed: { backgroundColor: "rgba(255,59,59,0.08)", borderColor: Colors.dark.error },
  deleteBtnText: { color: Colors.dark.error, fontWeight: "700", fontSize: 15 },
});
