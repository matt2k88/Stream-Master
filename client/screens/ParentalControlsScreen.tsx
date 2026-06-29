import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useProfile, ParentalControls } from "@/contexts/ProfileContext";
import { getApiUrl } from "@/lib/query-client";
import PinPadModal from "@/components/PinPadModal";

/* ── BBFC rating definitions ──────────────────────────────────────────── */
const BBFC_RATINGS: { code: string; label: string; color: string; desc: string }[] = [
  { code: "U",   label: "U",   color: "#67AE3F", desc: "Universal — suitable for all" },
  { code: "PG",  label: "PG",  color: "#FCB017", desc: "Parental Guidance suggested" },
  { code: "12A", label: "12A", color: "#029FD8", desc: "12A — cinema; under-12s with adult" },
  { code: "12",  label: "12",  color: "#029FD8", desc: "12 — not suitable under 12" },
  { code: "15",  label: "15",  color: "#ED6623", desc: "15 — not suitable under 15" },
  { code: "18",  label: "18",  color: "#CC0003", desc: "18 — adults only" },
  { code: "R18", label: "R18", color: "#CC0003", desc: "R18 — restricted adult content" },
];

const DEFAULT_RATINGS = ["U", "PG", "12A", "12", "15"];

/* ── Small components ────────────────────────────────────────────────── */
function BackBtn({ onPress }: { onPress: () => void }) {
  const [active, setActive] = useState(false);
  return (
    <Pressable
      style={[styles.backBtn, active && styles.backBtnActive]}
      onPress={onPress}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      onPressIn={() => setActive(true)}
      onPressOut={() => setActive(false)}
    >
      <Feather name="arrow-left" size={20} color={active ? Colors.dark.accent : Colors.dark.text} />
    </Pressable>
  );
}

function RatingCheckbox({
  rating,
  checked,
  onToggle,
}: {
  rating: typeof BBFC_RATINGS[number];
  checked: boolean;
  onToggle: () => void;
}) {
  const [active, setActive] = useState(false);
  return (
    <Pressable
      style={[styles.ratingRow, active && styles.ratingRowActive, checked && styles.ratingRowChecked]}
      onPress={onToggle}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      onPressIn={() => setActive(true)}
      onPressOut={() => setActive(false)}
    >
      <View style={[styles.ratingBadge, { backgroundColor: rating.color }]}>
        <ThemedText style={styles.ratingBadgeText}>{rating.label}</ThemedText>
      </View>
      <View style={styles.ratingInfo}>
        <ThemedText style={styles.ratingLabel}>{rating.desc}</ThemedText>
      </View>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <Feather name="check" size={13} color="#fff" /> : null}
      </View>
    </Pressable>
  );
}

function ToggleRow({
  label,
  value,
  onToggle,
  subtitle,
}: {
  label: string;
  value: boolean;
  onToggle: () => void;
  subtitle?: string;
}) {
  const [active, setActive] = useState(false);
  return (
    <Pressable
      style={[styles.toggleRow, active && styles.toggleRowActive]}
      onPress={onToggle}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      onPressIn={() => setActive(true)}
      onPressOut={() => setActive(false)}
    >
      <View style={styles.toggleRowLeft}>
        <ThemedText style={styles.toggleLabel}>{label}</ThemedText>
        {subtitle ? <ThemedText style={styles.toggleSub}>{subtitle}</ThemedText> : null}
      </View>
      <View style={[styles.track, value && styles.trackOn]}>
        <View style={[styles.thumb, value && styles.thumbOn]} />
      </View>
    </Pressable>
  );
}

/** Pressable that reacts to both touch-press AND D-pad / pointer focus */
function FocusBtn({
  style,
  onPress,
  disabled,
  children,
}: {
  style: (state: { pressed: boolean; focused: boolean }) => any;
  onPress?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      style={({ pressed }) => style({ pressed, focused })}
      onPress={onPress}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {children}
    </Pressable>
  );
}

/* ── Main screen ─────────────────────────────────────────────────────── */
export default function ParentalControlsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const { activeProfile, setActiveProfile } = useProfile();

  const existing = activeProfile?.parental_controls;
  const hasPin = !!(activeProfile?.parental_pin);

  // Local editing state (mirrors DB until saved)
  const [allowedRatings, setAllowedRatings] = useState<string[]>(
    existing?.allowed_ratings ?? DEFAULT_RATINGS
  );
  const [showUnclassified, setShowUnclassified] = useState(
    existing?.show_unclassified ?? true
  );

  // Dirty tracking
  const [dirty, setDirty] = useState(false);

  // Modal state
  const [pinModal, setPinModal] = useState<{
    visible: boolean;
    action: "enable" | "disable" | "save" | "changePin";
  }>({ visible: false, action: "enable" });

  // Change PIN flow: after verifying old PIN, show set-new-PIN modal
  const [showSetNewPin, setShowSetNewPin] = useState(false);

  const [saving, setSaving] = useState(false);

  const padH = Math.max(insets.left + Spacing.sm, Spacing.lg);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.sm, Spacing.xl);

  const isEnabled = existing?.enabled ?? false;

  /* ── Toggle a rating ────────────────────────────────────────────────── */
  const toggleRating = (code: string) => {
    setAllowedRatings((prev) =>
      prev.includes(code) ? prev.filter((r) => r !== code) : [...prev, code]
    );
    setDirty(true);
  };

  /* ── Save to server ─────────────────────────────────────────────────── */
  const saveSettings = useCallback(async (
    overrides: Partial<{ enabled: boolean; pin: string | null; private_viewing: boolean }>
  ) => {
    if (!activeProfile || activeProfile.id === "guest") return;
    setSaving(true);
    try {
      const controls: ParentalControls = {
        enabled: overrides.enabled ?? isEnabled,
        allowed_ratings: allowedRatings,
        show_unclassified: showUnclassified,
      };
      const body: Record<string, any> = {
        parental_controls: controls,
      };
      if (overrides.pin !== undefined) body.parental_pin = overrides.pin;
      if (overrides.enabled === false) {
        body.parental_pin = null;
        body.parental_controls = null;
      }
      if (overrides.enabled === true && activeProfile.private_viewing) {
        body.private_viewing = false;
      }

      const url = new URL(`/api/profiles/${activeProfile.id}`, getApiUrl()).toString();
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setActiveProfile(updated);
      setDirty(false);
      if (overrides.enabled === true && activeProfile.private_viewing) {
        Alert.alert(
          "Parental Controls Enabled",
          "Private Viewing has been automatically disabled."
        );
      }
    } catch {
      Alert.alert("Error", "Failed to save parental controls. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [activeProfile, isEnabled, allowedRatings, showUnclassified, setActiveProfile]);

  /* ── Enable flow ─────────────────────────────────────────────────────── */
  const handleEnable = () => {
    if (hasPin) {
      setPinModal({ visible: true, action: "enable" });
    } else {
      setPinModal({ visible: true, action: "enable" });
    }
  };

  /* ── PIN modal outcomes ──────────────────────────────────────────────── */
  const handleVerified = useCallback(async () => {
    setPinModal((m) => ({ ...m, visible: false }));
    const { action } = pinModal;
    if (action === "disable") {
      await saveSettings({ enabled: false, pin: null });
    } else if (action === "save") {
      await saveSettings({ enabled: true });
    } else if (action === "changePin") {
      setTimeout(() => setShowSetNewPin(true), 300);
    } else if (action === "enable") {
      await saveSettings({ enabled: true });
    }
  }, [pinModal, saveSettings]);

  const handleNewPinSet = useCallback(async (newPin: string) => {
    setShowSetNewPin(false);
    await saveSettings({ enabled: true, pin: newPin });
  }, [saveSettings]);

  const handleEnablePinSet = useCallback(async (newPin: string) => {
    setPinModal((m) => ({ ...m, visible: false }));
    await saveSettings({ enabled: true, pin: newPin });
  }, [saveSettings]);

  /* ── Status indicator colour ─────────────────────────────────────────── */
  const statusColor = isEnabled ? Colors.dark.accent : Colors.dark.border;

  return (
    <ThemedView style={styles.container}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <BackBtn onPress={() => navigation.goBack()} />
        <ThemedText style={styles.headerTitle}>Parental Controls</ThemedText>
        <View style={{ width: 40 }} />
      </View>
      <View style={[styles.divider, { marginHorizontal: padH }]} />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingHorizontal: padH, paddingBottom: padB, maxWidth: isLandscape ? 800 : undefined, alignSelf: "center", width: "100%" },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Status card ────────────────────────────────────────────── */}
        <View style={[styles.statusCard, { borderColor: statusColor + "55" }]}>
          <LinearGradient
            colors={isEnabled ? ["rgba(255,102,0,0.14)", "rgba(255,102,0,0.04)"] : ["rgba(255,255,255,0.04)", "transparent"]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            pointerEvents="none"
          />
          <View style={[styles.statusDot, { backgroundColor: isEnabled ? Colors.dark.accent : Colors.dark.border }]} />
          <View style={styles.statusText}>
            <ThemedText style={styles.statusTitle}>
              {isEnabled ? "Parental Controls Active" : "Parental Controls Disabled"}
            </ThemedText>
            <ThemedText style={styles.statusSub}>
              {isEnabled
                ? `Filtering ${allowedRatings.length === 0 ? "all" : BBFC_RATINGS.filter(r => !allowedRatings.includes(r.code)).length === 0 ? "no" : "some"} content by age rating`
                : "All content is accessible. Enable to restrict by age rating."}
            </ThemedText>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: isEnabled ? "rgba(255,102,0,0.18)" : Colors.dark.backgroundDefault }]}>
            <Feather name="shield" size={20} color={isEnabled ? Colors.dark.accent : Colors.dark.border} />
          </View>
        </View>

        {!isEnabled ? (
          /* ── Enable section ──────────────────────────────────────────── */
          <View style={styles.enableSection}>
            <View style={styles.descCard}>
              <Feather name="info" size={14} color={Colors.dark.accent} style={{ marginTop: 1 }} />
              <ThemedText style={styles.descText}>
                Parental Controls let you restrict content by age classification. You will set a 4-digit PIN to protect these settings. Once enabled, only content matching your chosen ratings will be visible.
              </ThemedText>
            </View>

            <View style={styles.featureList}>
              {["BBFC age-rating filters (U through R18)", "Block unrated / unclassified content", "Hide adult live TV categories", "Protected by a 4-digit PIN"].map((f) => (
                <View key={f} style={styles.featureRow}>
                  <Feather name="check-circle" size={14} color={Colors.dark.accent} />
                  <ThemedText style={styles.featureText}>{f}</ThemedText>
                </View>
              ))}
            </View>

            <FocusBtn
              style={({ pressed, focused }) => [styles.enableBtn, (pressed || focused) && styles.enableBtnPressed, saving && { opacity: 0.6 }]}
              onPress={handleEnable}
              disabled={saving}
            >
              <LinearGradient
                colors={["#FF8C1A", "#FF5500"]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              />
              <Feather name="shield" size={16} color="#fff" />
              <ThemedText style={styles.enableBtnText}>
                {saving ? "Enabling..." : "Enable Parental Controls"}
              </ThemedText>
            </FocusBtn>
          </View>
        ) : (
          /* ── Settings section (enabled) ──────────────────────────────── */
          <>
            {/* Ratings selector */}
            <View style={styles.section}>
              <ThemedText style={styles.sectionLabel}>Allowed Classifications</ThemedText>
              <View style={styles.ratingsGrid}>
                {BBFC_RATINGS.map((r) => (
                  <RatingCheckbox
                    key={r.code}
                    rating={r}
                    checked={allowedRatings.includes(r.code)}
                    onToggle={() => toggleRating(r.code)}
                  />
                ))}
              </View>
            </View>

            {/* Unclassified toggle */}
            <ToggleRow
              label="Show Unclassified Content"
              subtitle="Content with no age rating assigned"
              value={showUnclassified}
              onToggle={() => { setShowUnclassified((v) => !v); setDirty(true); }}
            />

            {/* Legal note */}
            <ThemedText style={styles.disclaimerNote}>
              Age ratings rely on BBFC/TMDB classifications and may not be complete for all content. Not a substitute for active parental supervision.
            </ThemedText>

            {/* Action row: Save · Change PIN · Disable */}
            <View style={styles.actionRow}>
              <FocusBtn
                style={({ pressed, focused }) => [styles.actionBtn, styles.saveBtnSmall, !dirty && styles.saveBtnDisabled, (pressed || focused) && dirty && styles.saveBtnPressed, saving && { opacity: 0.6 }]}
                onPress={() => {
                  if (!dirty) return;
                  if (hasPin) setPinModal({ visible: true, action: "save" });
                  else saveSettings({ enabled: true });
                }}
                disabled={!dirty || saving}
              >
                <LinearGradient
                  colors={dirty ? ["#FF8C1A", "#FF5500"] : [Colors.dark.backgroundDefault, Colors.dark.backgroundDefault]}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                />
                <ThemedText style={[styles.actionBtnText, !dirty && styles.saveBtnTextDim]}>
                  {saving ? "Saving…" : "Save Changes"}
                </ThemedText>
              </FocusBtn>

              <FocusBtn
                style={({ pressed, focused }) => [styles.actionBtn, styles.changePinBtn, (pressed || focused) && styles.pinActionBtnActive]}
                onPress={() => setPinModal({ visible: true, action: "changePin" })}
              >
                <Feather name="key" size={13} color={Colors.dark.textSecondary} />
                <ThemedText style={styles.changePinText}>Change PIN</ThemedText>
              </FocusBtn>

              <FocusBtn
                style={({ pressed, focused }) => [styles.actionBtn, styles.disableBtn, (pressed || focused) && styles.disableBtnActive]}
                onPress={() => setPinModal({ visible: true, action: "disable" })}
              >
                <Feather name="shield-off" size={13} color={Colors.dark.error} />
                <ThemedText style={styles.disableBtnText}>Disable</ThemedText>
              </FocusBtn>
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Verify existing PIN modal ─────────────────────────────────── */}
      <PinPadModal
        visible={pinModal.visible && pinModal.action !== "enable"}
        mode="verify"
        existingPin={activeProfile?.parental_pin}
        onVerified={handleVerified}
        onClose={() => setPinModal((m) => ({ ...m, visible: false }))}
        title={
          pinModal.action === "disable" ? "Confirm PIN to Disable" :
          pinModal.action === "changePin" ? "Verify Current PIN" :
          "Confirm PIN to Save"
        }
      />

      {/* ── Enable flow: set new PIN ──────────────────────────────────── */}
      <PinPadModal
        visible={pinModal.visible && pinModal.action === "enable"}
        mode={hasPin ? "verify" : "set"}
        existingPin={activeProfile?.parental_pin}
        onVerified={async () => {
          setPinModal((m) => ({ ...m, visible: false }));
          await saveSettings({ enabled: true });
        }}
        onPinSet={handleEnablePinSet}
        onClose={() => setPinModal((m) => ({ ...m, visible: false }))}
        title={hasPin ? "Enter PIN to Enable" : "Create Parental PIN"}
      />

      {/* ── Change PIN: set new PIN (after verifying old) ────────────── */}
      <PinPadModal
        visible={showSetNewPin}
        mode="set"
        onPinSet={handleNewPinSet}
        onClose={() => setShowSetNewPin(false)}
        title="Set New Parental PIN"
      />
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
  backBtn: {
    width: 40, height: 40, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  backBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  divider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.md },
  scroll: { gap: Spacing.sm, paddingTop: Spacing.xs },

  /* Status card */
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    overflow: "hidden",
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { flex: 1 },
  statusTitle: { fontSize: 14, fontWeight: "700", color: Colors.dark.text },
  statusSub: { fontSize: 11, color: Colors.dark.textSecondary, marginTop: 1, lineHeight: 15 },
  statusBadge: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: "center", alignItems: "center",
  },

  /* Enable section */
  enableSection: { gap: Spacing.md },
  descCard: {
    flexDirection: "row",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.2)",
    padding: Spacing.md,
  },
  descText: { flex: 1, fontSize: 13, color: Colors.dark.textSecondary, lineHeight: 20 },
  featureList: { gap: Spacing.sm },
  featureRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  featureText: { fontSize: 13, color: Colors.dark.text },
  enableBtn: {
    height: 52, borderRadius: BorderRadius.sm, overflow: "hidden",
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  enableBtnPressed: { opacity: 0.85 },
  enableBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  /* Settings section */
  section: { gap: Spacing.xs },
  sectionLabel: {
    fontSize: 10, fontWeight: "700", color: Colors.dark.accent,
    textTransform: "uppercase", letterSpacing: 1,
  },
  sectionHint: { fontSize: 11, color: Colors.dark.textSecondary, lineHeight: 15 },

  /* Ratings 2-column grid */
  ratingsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },

  /* Rating checkbox row */
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.sm,
    minWidth: "48%",
    flex: 1,
  },
  ratingRowActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  ratingRowChecked: { borderColor: "rgba(255,102,0,0.4)" },
  ratingBadge: {
    width: 32, height: 32, borderRadius: 5,
    justifyContent: "center", alignItems: "center",
  },
  ratingBadgeText: { fontSize: 11, fontWeight: "800", color: "#fff" },
  ratingInfo: { flex: 1 },
  ratingLabel: { fontSize: 12, color: Colors.dark.text, fontWeight: "500" },
  checkbox: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 2, borderColor: Colors.dark.border,
    backgroundColor: "transparent",
    justifyContent: "center", alignItems: "center",
  },
  checkboxChecked: { backgroundColor: Colors.dark.accent, borderColor: Colors.dark.accent },

  /* Toggle row */
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
  },
  toggleRowActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  toggleRowLeft: { flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: "600" },
  toggleSub: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: 2 },
  track: {
    width: 48, height: 28, borderRadius: 14,
    backgroundColor: Colors.dark.border,
    justifyContent: "center", paddingHorizontal: 3,
  },
  trackOn: { backgroundColor: Colors.dark.accent },
  thumb: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.dark.textSecondary, alignSelf: "flex-start",
  },
  thumbOn: { backgroundColor: "#fff", alignSelf: "flex-end" },

  /* Disclaimer */
  disclaimerNote: {
    fontSize: 11, color: Colors.dark.textSecondary, lineHeight: 16,
    opacity: 0.7,
  },

  /* Action row */
  actionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  actionBtn: {
    flex: 1, height: 46, borderRadius: BorderRadius.sm, overflow: "hidden",
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
  },
  saveBtnSmall: {
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  saveBtnDisabled: { shadowOpacity: 0 },
  saveBtnPressed: { opacity: 0.85 },
  actionBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  saveBtnTextDim: { color: Colors.dark.textSecondary },

  changePinBtn: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  changePinText: { fontSize: 13, color: Colors.dark.textSecondary, fontWeight: "600" },
  pinActionBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },

  /* Disable action button */
  disableBtn: {
    borderWidth: 1, borderColor: "rgba(255,59,59,0.3)",
    backgroundColor: Colors.dark.backgroundDefault,
  },
  disableBtnActive: { borderColor: Colors.dark.error, backgroundColor: "rgba(255,59,59,0.07)" },
  disableBtnText: { fontSize: 13, color: Colors.dark.error, fontWeight: "600" },
});
