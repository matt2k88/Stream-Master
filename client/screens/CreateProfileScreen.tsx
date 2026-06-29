import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  Image,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
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

function IconOption({ ic, isSelected, color, onPress }: { ic: keyof typeof Feather.glyphMap; isSelected: boolean; color: string; onPress: () => void }) {
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
      style={[styles.pinToggleRow, isActive && styles.pinToggleRowActive, enabled && styles.pinToggleRowEnabled]}
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
          <Feather name="lock" size={16} color={enabled ? Colors.dark.accent : Colors.dark.textSecondary} />
        </View>
        <View>
          <ThemedText style={styles.pinToggleTitle}>PIN Protection</ThemedText>
          <ThemedText style={styles.pinToggleSubtitle}>Require a 4-digit PIN to access</ThemedText>
        </View>
      </View>
      <View style={[styles.toggleTrack, enabled && styles.toggleTrackOn]}>
        <View style={[styles.toggleThumb, enabled && styles.toggleThumbOn]} />
      </View>
    </Pressable>
  );
}

const BBFC_RATINGS_CREATE = [
  { code: "U",   color: "#67AE3F", desc: "Universal — suitable for all" },
  { code: "PG",  color: "#FCB017", desc: "Parental Guidance suggested" },
  { code: "12A", color: "#029FD8", desc: "12A — under-12s with an adult" },
  { code: "12",  color: "#029FD8", desc: "12 — not suitable under 12" },
  { code: "15",  color: "#ED6623", desc: "15 — not suitable under 15" },
  { code: "18",  color: "#CC0003", desc: "18 — adults only" },
  { code: "R18", color: "#CC0003", desc: "R18 — restricted adult content" },
];

function PinKey({ k, onPress }: { k: string; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;
  return (
    <Pressable
      style={[styles.pinKey, !k && styles.pinKeyEmpty, k && isActive && styles.pinKeyPressed]}
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
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
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

  // QR photo upload — lazy (token only generated when user opens the modal)
  const [avatarToken, setAvatarToken] = useState<string | null>(null);
  const [avatarImage, setAvatarImage] = useState<string | null>(editing?.avatar_image ?? null);
  const [pendingAvatarImage, setPendingAvatarImage] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [qrImageLoading, setQrImageLoading] = useState(true);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarBtnFocused, setAvatarBtnFocused] = useState(false);
  const [removeFocused, setRemoveFocused] = useState(false);
  const [confirmFocused, setConfirmFocused] = useState(false);
  const [cancelModalFocused, setCancelModalFocused] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Parental controls state (new profile or editing a profile without existing controls)
  const [parentalEnabled, setParentalEnabled] = useState(!!editing?.parental_controls?.enabled);
  const [parentalPin, setParentalPin] = useState("");
  const [parentalPinConfirm, setParentalPinConfirm] = useState("");
  const [parentalPinStep, setParentalPinStep] = useState<"idle" | "set" | "confirm" | "done">(
    editing?.parental_controls?.enabled ? "done" : "idle"
  );
  const [allowedRatings, setAllowedRatings] = useState<string[]>(
    editing?.parental_controls?.allowed_ratings ?? ["U", "PG", "12A", "12", "15"]
  );
  const [showUnclassified, setShowUnclassified] = useState(
    editing?.parental_controls?.show_unclassified ?? true
  );

  // Poll only while the modal is open and we don't have a pending image yet
  useEffect(() => {
    if (!showQrModal || !avatarToken || pendingAvatarImage) return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(new URL(`/api/avatar-status/${avatarToken}`, getApiUrl()).toString());
        const d = await r.json();
        if (d.ready && d.imageData) {
          setPendingAvatarImage(d.imageData);
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
        if (d.expired) {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          setShowQrModal(false);
        }
      } catch {}
    }, 2500);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [showQrModal, avatarToken, pendingAvatarImage]);

  const padH = Math.max(insets.left + Spacing.sm, Spacing.lg);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.sm, Spacing.xl);

  const isValid =
    name.trim().length > 0 &&
    (!pinEnabled || pin.length === 4) &&
    (!!editing?.parental_controls?.enabled || !parentalEnabled || parentalPinStep === "done");

  const handleOpenAvatarModal = async () => {
    setGeneratingToken(true);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await fetch(new URL("/api/avatar-token", getApiUrl()).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId: editing?.id ?? null }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (d.token) {
          setAvatarToken(d.token);
          setQrUrl(d.qrUrl ?? d.uploadUrl);
          setQrImageLoading(true);
          setPendingAvatarImage(null);
          setShowQrModal(true);
          setGeneratingToken(false);
          return;
        }
        throw new Error("No token returned");
      } catch {
        if (attempt < 3) await new Promise<void>((res) => setTimeout(res, 700 * attempt));
      }
    }
    setGeneratingToken(false);
    Alert.alert("Connection Error", "Could not generate the upload link after several attempts. Please try again in a moment.");
  };

  const handleCancelModal = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setShowQrModal(false);
    setPendingAvatarImage(null);
  };

  // Remove photo — clears locally and immediately saves to server in edit mode
  const handleRemovePhoto = async () => {
    setAvatarImage(null);
    if (!editing) return;
    try {
      const r = await fetch(new URL(`/api/profiles/${editing.id}`, getApiUrl()).toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_image: null }),
      });
      if (r.ok) { const updated = await r.json(); setActiveProfile(updated); }
    } catch { /* local state already cleared — silently ignore */ }
  };

  const handleConfirmAvatar = async () => {
    if (!pendingAvatarImage) return;
    // Create mode: store locally — image will be sent when the profile is created
    if (!editing) {
      setAvatarImage(pendingAvatarImage);
      setShowQrModal(false);
      setPendingAvatarImage(null);
      return;
    }
    // Edit mode: save to server immediately
    setSavingAvatar(true);
    try {
      const r = await fetch(new URL(`/api/profiles/${editing.id}`, getApiUrl()).toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_image: pendingAvatarImage }),
      });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setAvatarImage(pendingAvatarImage);
      setActiveProfile(updated);
      setShowQrModal(false);
      setPendingAvatarImage(null);
    } catch {
      Alert.alert("Error", "Failed to save photo. Please try again.");
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    try {
      const body: Record<string, any> = {
        account_username: username,
        name: name.trim(),
        avatar_icon: icon,
        avatar_color: color,
        pin: pinEnabled && pin.length === 4 ? pin : null,
        avatar_image: avatarImage ?? null,
      };
      // Parental controls: only applied when the profile doesn't already have
      // them configured (existing controls are managed via ParentalControlsScreen).
      if (!editing?.parental_controls?.enabled) {
        if (parentalEnabled && parentalPinStep === "done") {
          body.parental_pin = parentalPin.length === 4 ? parentalPin : null;
          body.parental_controls = {
            enabled: true,
            allowed_ratings: allowedRatings,
            show_unclassified: showUnclassified,
          };
          body.private_viewing = false;
        } else {
          body.parental_pin = null;
          body.parental_controls = null;
        }
      }
      const baseUrl = getApiUrl();
      const url = editing
        ? new URL(`/api/profiles/${editing.id}`, baseUrl).toString()
        : new URL("/api/profiles", baseUrl).toString();
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { Alert.alert("Error", data.error ?? "Failed to save profile"); return; }
      if (editing) {
        setActiveProfile(data);
        navigation.goBack();
      } else {
        setActiveProfile(data);
        navigation.reset({ index: 0, routes: [{ name: "Home" }] });
      }
    } catch { Alert.alert("Error", "Failed to save profile"); }
    finally { setSaving(false); }
  };

  const handleDelete = () => {
    if (!editing) return;
    Alert.alert("Delete Profile", `Are you sure you want to delete "${editing.name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          setDeleting(true);
          try {
            const url = new URL(`/api/profiles/${editing.id}`, getApiUrl()).toString();
            const res = await fetch(url, { method: "DELETE" });
            if (!res.ok) throw new Error();
            clearProfile();
            navigation.reset({ index: 0, routes: [{ name: "ProfilePicker" }] });
          } catch { Alert.alert("Error", "Failed to delete profile"); }
          finally { setDeleting(false); }
        },
      },
    ]);
  };

  /* ── Custom Avatar section ───────────────────────────────────────────── */
  const customAvatarSection = (
    <View style={styles.section}>
      <ThemedText style={styles.sectionLabel}>Custom Avatar</ThemedText>
      {avatarImage ? (
        <View style={styles.avatarPhotoCard}>
          <View style={[styles.avatarPhotoThumb, { borderColor: color }]}>
            <Image source={{ uri: avatarImage }} style={styles.avatarPhotoThumbImg} />
          </View>
          <View style={styles.avatarPhotoInfo}>
            <ThemedText style={styles.avatarPhotoTitle}>Custom photo active</ThemedText>
            <ThemedText style={styles.avatarPhotoSub}>
              {editing ? "Photo saved to your profile" : "Photo will be saved when you create the profile"}
            </ThemedText>
            <Pressable
              style={({ pressed }) => [styles.avatarRemoveBtn, (pressed || removeFocused) && styles.avatarRemoveBtnFocused]}
              onPress={handleRemovePhoto}
              onFocus={() => setRemoveFocused(true)}
              onBlur={() => setRemoveFocused(false)}
              onHoverIn={() => setRemoveFocused(true)}
              onHoverOut={() => setRemoveFocused(false)}
            >
              <Feather name="x" size={11} color={removeFocused ? Colors.dark.text : Colors.dark.error} />
              <ThemedText style={[styles.avatarRemoveText, removeFocused && styles.avatarRemoveTextFocused]}>
                Remove photo
              </ThemedText>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.avatarUploadBtn, (pressed || avatarBtnFocused) && styles.avatarUploadBtnFocused]}
          onPress={handleOpenAvatarModal}
          onFocus={() => setAvatarBtnFocused(true)}
          onBlur={() => setAvatarBtnFocused(false)}
          onHoverIn={() => setAvatarBtnFocused(true)}
          onHoverOut={() => setAvatarBtnFocused(false)}
          disabled={generatingToken}
        >
          <View style={[styles.avatarUploadIconWrap, avatarBtnFocused && styles.avatarUploadIconWrapFocused]}>
            {generatingToken
              ? <ActivityIndicator size="small" color={Colors.dark.accent} />
              : <Feather name="camera" size={20} color={avatarBtnFocused ? Colors.dark.accent : Colors.dark.textSecondary} />
            }
          </View>
          <View style={styles.avatarUploadText}>
            <ThemedText style={[styles.avatarUploadTitle, avatarBtnFocused && styles.avatarUploadTitleFocused]}>
              {generatingToken ? "Preparing..." : "Custom Avatar"}
            </ThemedText>
            <ThemedText style={styles.avatarUploadDesc}>
              Upload a custom photo as your profile picture
            </ThemedText>
          </View>
          <Feather name="chevron-right" size={16} color={avatarBtnFocused ? Colors.dark.accent : Colors.dark.border} />
        </Pressable>
      )}
    </View>
  );

  /* ── Avatar upload modal ─────────────────────────────────────────────── */
  const avatarModal = (
    <Modal visible={showQrModal} transparent animationType="fade" onRequestClose={handleCancelModal}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>Custom Avatar</ThemedText>
            <IconBtn onPress={handleCancelModal}>
              {(active) => <Feather name="x" size={18} color={active ? Colors.dark.accent : Colors.dark.textSecondary} />}
            </IconBtn>
          </View>

          {pendingAvatarImage ? (
            <>
              <View style={styles.modalPhotoWrap}>
                <View style={[styles.modalPhotoRing, { borderColor: color, shadowColor: color }]}>
                  <Image source={{ uri: pendingAvatarImage }} style={styles.modalPhotoImg} />
                </View>
              </View>
              <ThemedText style={styles.modalPhotoTitle}>Photo ready!</ThemedText>
              <ThemedText style={styles.modalPhotoSub}>
                Tap Confirm to set this as your profile photo. It will be saved immediately.
              </ThemedText>
              <View style={styles.modalBtnRow}>
                <Pressable
                  style={({ pressed }) => [styles.modalCancelBtn, (pressed || cancelModalFocused) && styles.modalCancelBtnFocused]}
                  onPress={handleCancelModal}
                  onFocus={() => setCancelModalFocused(true)}
                  onBlur={() => setCancelModalFocused(false)}
                  onHoverIn={() => setCancelModalFocused(true)}
                  onHoverOut={() => setCancelModalFocused(false)}
                >
                  <ThemedText style={[styles.modalCancelText, cancelModalFocused && styles.modalCancelTextFocused]}>Cancel</ThemedText>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.modalConfirmBtn, (pressed || confirmFocused) && styles.modalConfirmBtnFocused, savingAvatar && styles.modalConfirmBtnDisabled]}
                  onPress={handleConfirmAvatar}
                  onFocus={() => setConfirmFocused(true)}
                  onBlur={() => setConfirmFocused(false)}
                  onHoverIn={() => setConfirmFocused(true)}
                  onHoverOut={() => setConfirmFocused(false)}
                  disabled={savingAvatar}
                >
                  {savingAvatar
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Feather name="check" size={15} color="#fff" />
                  }
                  <ThemedText style={styles.modalConfirmText}>{savingAvatar ? "Saving..." : "Confirm"}</ThemedText>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.modalQrWrap}>
                {qrUrl ? (
                  <>
                    <Image
                      source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrUrl)}&margin=2` }}
                      style={styles.modalQrImg}
                      onLoadEnd={() => setQrImageLoading(false)}
                      onError={() => setQrImageLoading(false)}
                    />
                    {qrImageLoading ? (
                      <View style={styles.modalQrLoadingOverlay}>
                        <ActivityIndicator color={Colors.dark.accent} size="large" />
                      </View>
                    ) : null}
                  </>
                ) : (
                  <ActivityIndicator color={Colors.dark.accent} size="large" />
                )}
              </View>
              <ThemedText style={styles.modalScanTitle}>
                {qrImageLoading ? "Generating QR code..." : "Scan with your phone"}
              </ThemedText>
              <ThemedText style={styles.modalScanDesc}>
                {qrImageLoading
                  ? "Please wait a moment while we prepare your secure upload link."
                  : "Open the link on your phone to choose and crop a photo for this profile."}
              </ThemedText>
              {!qrImageLoading ? (
                <View style={styles.modalWaitRow}>
                  <View style={styles.modalPulseDot} />
                  <ThemedText style={styles.modalWaitText}>Waiting for photo...</ThemedText>
                </View>
              ) : null}
              <Pressable
                style={({ pressed }) => [styles.modalCancelBtn, (pressed || cancelModalFocused) && styles.modalCancelBtnFocused, { alignSelf: "center", paddingHorizontal: Spacing.xl }]}
                onPress={handleCancelModal}
                onFocus={() => setCancelModalFocused(true)}
                onBlur={() => setCancelModalFocused(false)}
                onHoverIn={() => setCancelModalFocused(true)}
                onHoverOut={() => setCancelModalFocused(false)}
              >
                <ThemedText style={[styles.modalCancelText, cancelModalFocused && styles.modalCancelTextFocused]}>Cancel</ThemedText>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  /* ── shared sub-sections ─────────────────────────────────────────────── */
  const avatarPreview = (
    <View style={styles.avatarPreviewRing} pointerEvents="none">
      <View style={[styles.avatarPreviewRingBorder, { borderColor: color, shadowColor: color }]}>
        <View style={[styles.avatarPreviewInner, { backgroundColor: color + "33" }]}>
          <Feather name={icon as any} size={36} color={color} />
        </View>
      </View>
    </View>
  );

  const iconPickerSection = (
    <View style={[styles.section, avatarImage ? { opacity: 0.3 } : null]} pointerEvents={avatarImage ? "none" : "auto"}>
      <ThemedText style={styles.sectionLabel}>Avatar Icon</ThemedText>
      <View style={styles.iconGrid}>
        {AVATAR_ICONS.map((ic) => (
          <IconOption key={ic} ic={ic} isSelected={ic === icon} color={color} onPress={() => setIcon(ic)} />
        ))}
      </View>
    </View>
  );

  const colorPickerSection = (
    <View style={styles.section}>
      <ThemedText style={styles.sectionLabel}>Colour</ThemedText>
      <View style={styles.colorGrid}>
        {AVATAR_COLORS.map((c) => (
          <ColorSwatch key={c} c={c} isSelected={c === color} onPress={() => setColor(c)} />
        ))}
      </View>
    </View>
  );

  const parentalSection = (
    <View style={styles.section}>
      <ThemedText style={styles.sectionLabel}>Parental Controls</ThemedText>
      {editing && editing.parental_controls?.enabled ? (
        <Pressable
          style={({ pressed }) => [styles.pinToggleRow, styles.pinToggleRowEnabled, pressed && styles.pinToggleRowActive]}
          onPress={() => (navigation as any).navigate("ParentalControls")}
        >
          <View style={styles.pinToggleLeft}>
            <View style={[styles.pinIconWrap, styles.pinIconWrapEnabled]}>
              <Feather name="shield" size={16} color={Colors.dark.accent} />
            </View>
            <View>
              <ThemedText style={styles.pinToggleTitle}>Parental Controls</ThemedText>
              <ThemedText style={styles.pinToggleSubtitle}>On — manage in Settings</ThemedText>
            </View>
          </View>
          <Feather name="chevron-right" size={16} color={Colors.dark.textSecondary} />
        </Pressable>
      ) : (
        <>
          <Pressable
            style={({ pressed }) => [styles.pinToggleRow, parentalEnabled && styles.pinToggleRowEnabled, pressed && styles.pinToggleRowActive]}
            onPress={() => {
              const next = !parentalEnabled;
              setParentalEnabled(next);
              if (next) {
                setParentalPinStep("set");
              } else {
                setParentalPin("");
                setParentalPinConfirm("");
                setParentalPinStep("idle");
              }
            }}
          >
            <View style={styles.pinToggleLeft}>
              <View style={[styles.pinIconWrap, parentalEnabled && styles.pinIconWrapEnabled]}>
                <Feather name="shield" size={16} color={parentalEnabled ? Colors.dark.accent : Colors.dark.textSecondary} />
              </View>
              <View>
                <ThemedText style={styles.pinToggleTitle}>Parental Controls</ThemedText>
                <ThemedText style={styles.pinToggleSubtitle}>Restrict content by age rating</ThemedText>
              </View>
            </View>
            <View style={[styles.toggleTrack, parentalEnabled && styles.toggleTrackOn]}>
              <View style={[styles.toggleThumb, parentalEnabled && styles.toggleThumbOn]} />
            </View>
          </Pressable>
          {parentalEnabled && parentalPinStep !== "done" ? (
            <View style={styles.pinInputSection}>
              <ThemedText style={styles.pinLabel}>
                {parentalPinStep === "set" ? "Set a 4-digit Parental PIN" : "Confirm your Parental PIN"}
              </ThemedText>
              <View style={styles.pinDots}>
                {[0,1,2,3].map((i) => {
                  const val = parentalPinStep === "confirm" ? parentalPinConfirm : parentalPin;
                  return (
                    <View key={i} style={[styles.pinDot, { borderColor: val.length > i ? Colors.dark.accent : Colors.dark.border }, val.length > i && { backgroundColor: Colors.dark.accent }]} />
                  );
                })}
              </View>
              <View style={styles.pinPad}>
                {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, idx) => (
                  <PinKey key={idx} k={k} onPress={() => {
                    if (!k) return;
                    const isConfirm = parentalPinStep === "confirm";
                    const curr = isConfirm ? parentalPinConfirm : parentalPin;
                    const setVal = isConfirm ? setParentalPinConfirm : setParentalPin;
                    if (k === "⌫") { setVal((p) => p.slice(0, -1)); }
                    else if (curr.length < 4) {
                      const next = curr + k;
                      setVal(next);
                      if (next.length === 4) {
                        if (!isConfirm) {
                          setTimeout(() => setParentalPinStep("confirm"), 100);
                        } else {
                          setTimeout(() => {
                            if (next === parentalPin) {
                              setParentalPinStep("done");
                            } else {
                              setParentalPin(""); setParentalPinConfirm(""); setParentalPinStep("set");
                              Alert.alert("PIN Mismatch", "The PINs don't match. Please try again.");
                            }
                          }, 100);
                        }
                      }
                    }
                  }} />
                ))}
              </View>
              {parentalPinStep === "confirm" ? (
                <Pressable onPress={() => { setParentalPinConfirm(""); setParentalPinStep("set"); }}>
                  <ThemedText style={styles.pinToggleSubtitle}>Back</ThemedText>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {parentalEnabled && parentalPinStep === "done" ? (
            <View style={{ gap: 6, marginTop: 4 }}>
              <ThemedText style={styles.pinToggleSubtitle}>Select the highest rating to allow:</ThemedText>
              {BBFC_RATINGS_CREATE.map((r) => (
                <Pressable
                  key={r.code}
                  style={({ pressed }) => [styles.pinToggleRow, allowedRatings.includes(r.code) && styles.pinToggleRowEnabled, pressed && styles.pinToggleRowActive]}
                  onPress={() => setAllowedRatings((prev) => prev.includes(r.code) ? prev.filter((x) => x !== r.code) : [...prev, r.code])}
                >
                  <View style={styles.pinToggleLeft}>
                    <View style={[styles.pinIconWrap, { backgroundColor: r.color + "33" }]}>
                      <ThemedText style={{ fontSize: 10, fontWeight: "800", color: r.color }}>{r.code}</ThemedText>
                    </View>
                    <ThemedText style={styles.pinToggleSubtitle}>{r.desc}</ThemedText>
                  </View>
                  <View style={[styles.pcCheckbox, allowedRatings.includes(r.code) && styles.pcCheckboxOn]}>
                    {allowedRatings.includes(r.code) ? <Feather name="check" size={11} color="#fff" /> : null}
                  </View>
                </Pressable>
              ))}
              <Pressable
                style={({ pressed }) => [styles.pinToggleRow, showUnclassified && styles.pinToggleRowEnabled, pressed && styles.pinToggleRowActive]}
                onPress={() => setShowUnclassified((v) => !v)}
              >
                <View style={styles.pinToggleLeft}>
                  <View style={styles.pinIconWrap}>
                    <Feather name="help-circle" size={16} color={Colors.dark.textSecondary} />
                  </View>
                  <ThemedText style={styles.pinToggleSubtitle}>Show Unclassified Content</ThemedText>
                </View>
                <View style={[styles.toggleTrack, showUnclassified && styles.toggleTrackOn]}>
                  <View style={[styles.toggleThumb, showUnclassified && styles.toggleThumbOn]} />
                </View>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </View>
  );

  const pinSection = (
    <View style={styles.section}>
      <PinToggleRow enabled={pinEnabled} onToggle={() => { setPinEnabled((v) => { if (v) setPin(""); return !v; }); }} />
      {pinEnabled ? (
        <View style={styles.pinInputSection}>
          <ThemedText style={styles.pinLabel}>Enter 4-digit PIN</ThemedText>
          <View style={styles.pinDots}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[styles.pinDot, { borderColor: pin.length > i ? Colors.dark.accent : Colors.dark.border }, pin.length > i && { backgroundColor: Colors.dark.accent }]} />
            ))}
          </View>
          <View style={styles.pinPad}>
            {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, idx) => (
              <PinKey key={idx} k={k} onPress={() => {
                if (!k) return;
                if (k === "⌫") { setPin((p) => p.slice(0, -1)); }
                else if (pin.length < 4) { setPin((p) => p + k); }
              }} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );

  const actionButtons = (
    <>
      <Pressable
        style={({ pressed }) => [styles.saveBtn, !isValid && styles.saveBtnDisabled, (pressed || saveFocused) && isValid && styles.saveBtnPressed]}
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
      {editing ? (
        <Pressable
          style={({ pressed }) => [styles.deleteBtn, (pressed || deleteFocused) && styles.deleteBtnPressed, deleting && styles.saveBtnDisabled]}
          onPress={handleDelete}
          disabled={deleting}
          onFocus={() => setDeleteFocused(true)}
          onBlur={() => setDeleteFocused(false)}
        >
          <Feather name="trash-2" size={16} color={Colors.dark.error} />
          <ThemedText style={styles.deleteBtnText}>{deleting ? "Deleting..." : "Delete Profile"}</ThemedText>
        </Pressable>
      ) : null}
    </>
  );

  /* ── LANDSCAPE / TV LAYOUT ───────────────────────────────────────────── */
  if (isLandscape) {
    return (
      <ThemedView style={styles.container}>
        {/* Full-width header */}
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

        {/* Two-column body */}
        <View style={styles.lsBody}>
          {/* LEFT — live preview panel */}
          <View style={[styles.lsLeft, { paddingBottom: padB }]}>
            <LinearGradient
              colors={[color + "18", "transparent"]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              pointerEvents="none"
            />
            {/* Large avatar */}
            <View style={[styles.lsAvatarRing, { borderColor: color, shadowColor: color }]}>
              {avatarImage ? (
                <Image source={{ uri: avatarImage }} style={styles.lsAvatarImg} />
              ) : (
                <View style={[styles.lsAvatarInner, { backgroundColor: color + "33" }]}>
                  <Feather name={icon as any} size={48} color={color} />
                </View>
              )}
            </View>
            {/* Live name preview */}
            <ThemedText style={[styles.lsProfileName, { color }]} numberOfLines={1}>
              {name.trim() || "Profile Name"}
            </ThemedText>
            <ThemedText style={styles.lsProfileSub}>
              {editing ? "Editing profile" : "New profile"}
            </ThemedText>
            {pinEnabled ? (
              <View style={styles.lsPinBadge}>
                <Feather name="lock" size={11} color={Colors.dark.accent} />
                <ThemedText style={styles.lsPinBadgeText}>PIN protected</ThemedText>
              </View>
            ) : null}
            {/* Accent bar */}
            <View style={[styles.lsAccentBar, { backgroundColor: color }]} />
          </View>

          {/* RIGHT — controls */}
          <ScrollView
            style={styles.lsRight}
            contentContainerStyle={[styles.lsRightContent, { paddingBottom: padB, paddingRight: Math.max(insets.right + Spacing.sm, Spacing.lg) }]}
            showsVerticalScrollIndicator={false}
          >
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

            {customAvatarSection}
            {iconPickerSection}
            {colorPickerSection}
            {pinSection}
            {parentalSection}

            <View style={styles.lsActions}>
              {actionButtons}
            </View>
          </ScrollView>
        </View>
        {avatarModal}
      </ThemedView>
    );
  }

  /* ── PORTRAIT LAYOUT (unchanged) ────────────────────────────────────── */
  return (
    <ThemedView style={styles.container}>
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
        <View style={styles.previewRow}>
          <View style={[styles.avatarPreviewRingBorder, { borderColor: color, shadowColor: color }]}>
            {avatarImage ? (
              <Image source={{ uri: avatarImage }} style={styles.portraitAvatarImg} />
            ) : (
              <View style={[styles.avatarPreviewInner, { backgroundColor: color + "33" }]}>
                <Feather name={icon as any} size={36} color={color} />
              </View>
            )}
          </View>
          <ThemedText style={styles.previewName} numberOfLines={1}>
            {name.trim() || "Profile Name"}
          </ThemedText>
        </View>

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

        {customAvatarSection}
        {iconPickerSection}
        {colorPickerSection}
        {pinSection}
        {parentalSection}

        {actionButtons}
      </ScrollView>
      {avatarModal}
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

  /* Portrait preview */
  avatarPreviewRing: { alignItems: "center" },
  previewRow: { alignItems: "center", gap: Spacing.md, paddingVertical: Spacing.sm },
  avatarPreviewRingBorder: {
    width: 96, height: 96, borderRadius: 48, borderWidth: 3,
    justifyContent: "center", alignItems: "center",
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 16, elevation: 10,
  },
  avatarPreviewInner: { width: 80, height: 80, borderRadius: 40, justifyContent: "center", alignItems: "center" },
  previewName: { fontSize: 18, fontWeight: "700", color: Colors.dark.text },

  /* Landscape layout */
  lsBody: { flex: 1, flexDirection: "row" },
  lsLeft: {
    width: 260,
    borderRightWidth: 1, borderRightColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
    gap: Spacing.sm, paddingHorizontal: Spacing.lg,
    overflow: "hidden",
  },
  lsAvatarRing: {
    width: 130, height: 130, borderRadius: 65, borderWidth: 3,
    justifyContent: "center", alignItems: "center",
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 24, elevation: 16,
    marginBottom: Spacing.sm,
  },
  lsAvatarInner: { width: 112, height: 112, borderRadius: 56, justifyContent: "center", alignItems: "center" },
  lsAvatarImg: { width: 124, height: 124, borderRadius: 62 },
  portraitAvatarImg: { width: 74, height: 74, borderRadius: 37 },

  /* Custom avatar upload button */
  avatarUploadBtn: {
    flexDirection: "row", alignItems: "center", gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.dark.border,
    padding: Spacing.md,
  },
  avatarUploadBtnFocused: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  avatarUploadIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.dark.backgroundDefault, borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  avatarUploadIconWrapFocused: { borderColor: Colors.dark.accent },
  avatarUploadText: { flex: 1, gap: 3 },
  avatarUploadTitle: { fontSize: 14, fontWeight: "700" },
  avatarUploadTitleFocused: { color: Colors.dark.accent },
  avatarUploadDesc: { fontSize: 11, color: Colors.dark.textSecondary, lineHeight: 15 },

  /* Photo already set card */
  avatarPhotoCard: {
    flexDirection: "row", alignItems: "center", gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.dark.border,
    padding: Spacing.md,
  },
  avatarPhotoThumb: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, overflow: "hidden" },
  avatarPhotoThumbImg: { width: 64, height: 64 },
  avatarPhotoInfo: { flex: 1, gap: 3 },
  avatarPhotoTitle: { fontSize: 13, fontWeight: "700" },
  avatarPhotoSub: { fontSize: 11, color: Colors.dark.textSecondary, lineHeight: 15 },
  avatarRemoveBtn: {
    flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4, alignSelf: "flex-start",
    paddingVertical: 5, paddingHorizontal: 9, borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: "transparent",
  },
  avatarRemoveBtnFocused: { borderColor: Colors.dark.border, backgroundColor: Colors.dark.backgroundDefault },
  avatarRemoveText: { fontSize: 11, color: Colors.dark.error },
  avatarRemoveTextFocused: { color: Colors.dark.text },

  /* Avatar upload modal */
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.78)",
    justifyContent: "center", alignItems: "center", padding: Spacing.xl,
  },
  modalCard: {
    width: "100%", maxWidth: 400,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.dark.border,
    padding: Spacing.lg, gap: Spacing.md,
    shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 8 },
    elevation: 20,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  modalTitle: { fontSize: 16, fontWeight: "800" },
  modalQrWrap: {
    alignSelf: "center", width: 190, height: 190,
    borderRadius: BorderRadius.md, overflow: "hidden", backgroundColor: "#fff",
    justifyContent: "center", alignItems: "center", marginTop: Spacing.xs,
  },
  modalQrImg: { width: 190, height: 190 },
  modalQrLoadingOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#fff", justifyContent: "center", alignItems: "center" },
  modalScanTitle: { fontSize: 15, fontWeight: "700", textAlign: "center", marginTop: 2 },
  modalScanDesc: { fontSize: 12, color: Colors.dark.textSecondary, textAlign: "center", lineHeight: 18 },
  modalWaitRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 2 },
  modalPulseDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.dark.accent },
  modalWaitText: { fontSize: 12, color: Colors.dark.textSecondary },
  modalPhotoWrap: { alignItems: "center", paddingVertical: Spacing.sm },
  modalPhotoRing: {
    width: 120, height: 120, borderRadius: 60, borderWidth: 3, overflow: "hidden",
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 16, elevation: 12,
  },
  modalPhotoImg: { width: 120, height: 120 },
  modalPhotoTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  modalPhotoSub: { fontSize: 12, color: Colors.dark.textSecondary, textAlign: "center", lineHeight: 18 },
  modalBtnRow: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.xs },
  modalCancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.dark.border, backgroundColor: Colors.dark.backgroundDefault,
    alignItems: "center", justifyContent: "center",
  },
  modalCancelBtnFocused: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  modalCancelText: { fontSize: 14, fontWeight: "600", color: Colors.dark.textSecondary },
  modalCancelTextFocused: { color: Colors.dark.accent },
  modalConfirmBtn: {
    flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    paddingVertical: 13, borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.accent,
  },
  modalConfirmBtnFocused: { backgroundColor: "#FF8400" },
  modalConfirmBtnDisabled: { opacity: 0.6 },
  modalConfirmText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  lsProfileName: { fontSize: 22, fontWeight: "800", textAlign: "center", letterSpacing: 0.3 },
  lsProfileSub: { fontSize: 11, color: Colors.dark.textSecondary, textTransform: "uppercase", letterSpacing: 1 },
  lsPinBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.accentDim,
    borderWidth: 1, borderColor: Colors.dark.accent + "55",
    marginTop: 2,
  },
  lsPinBadgeText: { fontSize: 10, fontWeight: "700", color: Colors.dark.accent, textTransform: "uppercase", letterSpacing: 0.8 },
  lsAccentBar: { position: "absolute", bottom: 0, left: 32, right: 32, height: 2, borderRadius: 1, opacity: 0.5 },
  lsRight: { flex: 1 },
  lsRightContent: { paddingLeft: Spacing.lg, paddingTop: Spacing.sm, gap: Spacing.lg },
  lsActions: { gap: Spacing.sm, marginTop: Spacing.xs },

  /* Shared form styles */
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
  colorSwatch: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
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
    borderColor: Colors.dark.accent, backgroundColor: "rgba(255,102,0,0.08)",
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 8, elevation: 4,
  },
  pinToggleRowEnabled: { borderColor: "rgba(255,102,0,0.4)" },
  pcCheckbox: {
    width: 22, height: 22, borderRadius: 5,
    borderWidth: 2, borderColor: Colors.dark.border,
    backgroundColor: "transparent",
    justifyContent: "center", alignItems: "center",
  },
  pcCheckboxOn: { backgroundColor: Colors.dark.accent, borderColor: Colors.dark.accent },
  pinToggleLeft: { flexDirection: "row", alignItems: "center", gap: Spacing.md, flex: 1 },
  pinIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.dark.backgroundSecondary, justifyContent: "center", alignItems: "center" },
  pinIconWrapEnabled: { backgroundColor: "rgba(255,102,0,0.15)" },
  pinToggleTitle: { fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  pinToggleSubtitle: { fontSize: 12, color: Colors.dark.textSecondary },
  toggleTrack: { width: 48, height: 28, borderRadius: 14, backgroundColor: Colors.dark.border, justifyContent: "center", paddingHorizontal: 3 },
  toggleTrackOn: { backgroundColor: Colors.dark.accent },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.dark.textSecondary, alignSelf: "flex-start" },
  toggleThumbOn: { backgroundColor: "#fff", alignSelf: "flex-end" },
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
