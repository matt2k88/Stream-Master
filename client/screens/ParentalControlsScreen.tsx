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

/* ── All known age-rated classifications ─────────────────────────────── */
const ALL_CERTS: { label: string; age: number; color: string }[] = [
  { label: "U",     age: 0,  color: "#3CB914" },
  { label: "G",     age: 0,  color: "#3CB914" },
  { label: "PG",    age: 8,  color: "#F0A800" },
  { label: "12A",   age: 12, color: "#F07000" },
  { label: "12",    age: 12, color: "#F07000" },
  { label: "PG-13", age: 13, color: "#F07000" },
  { label: "15",    age: 15, color: "#E0408A" },
  { label: "16",    age: 16, color: "#CC1515" },
  { label: "R",     age: 17, color: "#CC1515" },
  { label: "18",    age: 18, color: "#CC0003" },
  { label: "R18",   age: 18, color: "#1060C0" },
];

const DEFAULT_MAX_AGE = 15;

/* Derive a max_age number from existing parental_controls (handles legacy
   allowed_ratings arrays stored before the age-stepper redesign). */
function deriveMaxAge(pc: ParentalControls | null | undefined): number {
  if (!pc) return DEFAULT_MAX_AGE;
  if (pc.max_age != null) return pc.max_age;
  const CERT_AGE: Record<string, number> = {
    U: 0, G: 0, PG: 8, "12A": 12, "12": 12, "15": 15, "18": 18, R18: 18,
    "PG-13": 13, R: 17, "NC-17": 18, "TV-MA": 18, "TV-14": 14, "TV-G": 0, "TV-PG": 8,
    "16": 16, "17": 17,
  };
  const allowed = pc.allowed_ratings ?? [];
  return allowed.length === 0 ? DEFAULT_MAX_AGE : Math.max(...allowed.map((r) => CERT_AGE[r] ?? 0));
}

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

  const [maxAge, setMaxAge] = useState<number>(deriveMaxAge(existing));
  const [showUnclassified, setShowUnclassified] = useState(
    existing?.show_unclassified ?? true
  );
  const [dirty, setDirty] = useState(false);

  const [pinModal, setPinModal] = useState<{
    visible: boolean;
    action: "enable" | "disable" | "save" | "changePin";
  }>({ visible: false, action: "enable" });

  const [showSetNewPin, setShowSetNewPin] = useState(false);
  const [saving, setSaving] = useState(false);

  const padH = Math.max(insets.left + Spacing.sm, Spacing.lg);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.sm, Spacing.xl);

  const isEnabled = existing?.enabled ?? false;

  const allowedCerts = ALL_CERTS.filter((c) => c.age <= maxAge);

  /* ── Save to server ─────────────────────────────────────────────────── */
  const saveSettings = useCallback(async (
    overrides: Partial<{ enabled: boolean; pin: string | null; private_viewing: boolean }>
  ) => {
    if (!activeProfile || activeProfile.id === "guest") return;
    setSaving(true);
    try {
      const controls: ParentalControls = {
        enabled: overrides.enabled ?? isEnabled,
        max_age: maxAge,
        show_unclassified: showUnclassified,
      };
      const body: Record<string, any> = { parental_controls: controls };
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
        Alert.alert("Parental Controls Enabled", "Private Viewing has been automatically disabled.");
      }
    } catch {
      Alert.alert("Error", "Failed to save parental controls. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [activeProfile, isEnabled, maxAge, showUnclassified, setActiveProfile]);

  /* ── Enable flow ─────────────────────────────────────────────────────── */
  const handleEnable = () => setPinModal({ visible: true, action: "enable" });

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
                ? `Age limit: ${maxAge} and under`
                : "All content is accessible. Enable to restrict by age."}
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
                Parental Controls let you restrict content by age. Set an age limit and only content at or below that age will be visible. Protected by a 4-digit PIN.
              </ThemedText>
            </View>

            <View style={styles.featureList}>
              {["Age-based content filtering (any rating system)", "Block unrated / unclassified content", "Hide adult live TV categories", "Protected by a 4-digit PIN"].map((f) => (
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
            {/* Age stepper */}
            <View style={styles.section}>
              <ThemedText style={styles.sectionLabel}>What age limit would you like set?</ThemedText>
              <View style={styles.ageStepper}>
                <FocusBtn
                  style={({ pressed, focused }) => [
                    styles.stepBtn,
                    (pressed || focused) && styles.stepBtnActive,
                    maxAge <= 0 && styles.stepBtnDisabled,
                  ]}
                  onPress={() => { if (maxAge > 0) { setMaxAge(maxAge - 1); setDirty(true); } }}
                  disabled={maxAge <= 0}
                >
                  <Feather name="minus" size={22} color={maxAge <= 0 ? Colors.dark.border : Colors.dark.text} />
                </FocusBtn>

                <View style={styles.ageDisplay}>
                  <ThemedText style={styles.ageNumber}>{maxAge}</ThemedText>
                  <ThemedText style={styles.ageUnit}>years &amp; under</ThemedText>
                </View>

                <FocusBtn
                  style={({ pressed, focused }) => [
                    styles.stepBtn,
                    (pressed || focused) && styles.stepBtnActive,
                    maxAge >= 18 && styles.stepBtnDisabled,
                  ]}
                  onPress={() => { if (maxAge < 18) { setMaxAge(maxAge + 1); setDirty(true); } }}
                  disabled={maxAge >= 18}
                >
                  <Feather name="plus" size={22} color={maxAge >= 18 ? Colors.dark.border : Colors.dark.text} />
                </FocusBtn>
              </View>

              {/* Classification preview */}
              <View style={styles.allowedPreview}>
                <ThemedText style={styles.allowedPreviewLabel}>
                  This will allow the following content:
                </ThemedText>
                {allowedCerts.length === 0 ? (
                  <ThemedText style={styles.noAllowedText}>No rated content will be shown</ThemedText>
                ) : (
                  <View style={styles.certBadgeRow}>
                    {allowedCerts.map((c) => (
                      <View key={c.label} style={[styles.certChip, { backgroundColor: c.color + "22", borderColor: c.color + "66" }]}>
                        <ThemedText style={[styles.certChipText, { color: c.color }]}>{c.label}</ThemedText>
                      </View>
                    ))}
                  </View>
                )}
                {maxAge >= 18 ? (
                  <ThemedText style={styles.adultWarning}>Includes adult-rated content (18+)</ThemedText>
                ) : null}
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
              Age ratings rely on TMDB classifications and may not be complete for all content. Not a substitute for active parental supervision.
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
  section: { gap: Spacing.sm },
  sectionLabel: {
    fontSize: 10, fontWeight: "700", color: Colors.dark.accent,
    textTransform: "uppercase", letterSpacing: 1,
  },

  /* Age stepper */
  ageStepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingVertical: Spacing.lg,
  },
  stepBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  stepBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  stepBtnDisabled: { opacity: 0.35 },
  ageDisplay: { alignItems: "center", minWidth: 80 },
  ageNumber: { fontSize: 52, fontWeight: "800", color: Colors.dark.accent, lineHeight: 58 },
  ageUnit: { fontSize: 11, color: Colors.dark.textSecondary, marginTop: 2 },

  /* Classification preview */
  allowedPreview: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  allowedPreviewLabel: {
    fontSize: 12, fontWeight: "600", color: Colors.dark.textSecondary,
  },
  certBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  certChip: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 6, borderWidth: 1,
  },
  certChipText: { fontSize: 12, fontWeight: "800" },
  noAllowedText: { fontSize: 12, color: Colors.dark.textSecondary, fontStyle: "italic" },
  adultWarning: {
    fontSize: 11, color: Colors.dark.error, fontWeight: "600", marginTop: 2,
  },

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
    fontSize: 11, color: Colors.dark.textSecondary, lineHeight: 16, opacity: 0.7,
  },

  /* Action row */
  actionRow: { flexDirection: "row", gap: Spacing.sm },
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
  disableBtn: {
    borderWidth: 1, borderColor: "rgba(255,59,59,0.3)",
    backgroundColor: Colors.dark.backgroundDefault,
  },
  disableBtnActive: { borderColor: Colors.dark.error, backgroundColor: "rgba(255,59,59,0.07)" },
  disableBtnText: { fontSize: 13, color: Colors.dark.error, fontWeight: "600" },
});
