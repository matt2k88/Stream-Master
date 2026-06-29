import React, { useState, useCallback } from "react";
import {
  View,
  Modal,
  StyleSheet,
  Pressable,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

interface Props {
  visible: boolean;
  mode: "verify" | "set";
  existingPin?: string | null;
  onVerified?: () => void;
  onPinSet?: (pin: string) => void;
  onClose: () => void;
  title?: string;
}

function PinKey({ label, onPress, empty }: { label: string; onPress: () => void; empty?: boolean }) {
  const [active, setActive] = useState(false);
  if (empty) return <View style={styles.keyEmpty} />;
  return (
    <Pressable
      style={[styles.key, active && styles.keyActive]}
      onPress={onPress}
      onPressIn={() => setActive(true)}
      onPressOut={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      {label === "⌫" ? (
        <Feather name="delete" size={20} color={active ? Colors.dark.accent : Colors.dark.text} />
      ) : (
        <ThemedText style={[styles.keyText, active && styles.keyTextActive]}>{label}</ThemedText>
      )}
    </Pressable>
  );
}

export default function PinPadModal({
  visible,
  mode,
  existingPin,
  onVerified,
  onPinSet,
  onClose,
  title,
}: Props) {
  const [step, setStep] = useState<"enter" | "confirm">(mode === "set" ? "enter" : "enter");
  const [pin, setPin] = useState("");
  const [pinFirst, setPinFirst] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep("enter");
    setPin("");
    setPinFirst("");
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleKey = useCallback((k: string) => {
    if (k === "⌫") {
      setPin((p) => p.slice(0, -1));
      setError(null);
      return;
    }
    setPin((p) => {
      if (p.length >= 4) return p;
      const next = p + k;
      if (next.length === 4) {
        setTimeout(() => handleComplete(next), 80);
      }
      return next;
    });
    setError(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleComplete = useCallback((entered: string) => {
    if (mode === "verify") {
      if (entered === existingPin) {
        reset();
        onVerified?.();
      } else {
        setPin("");
        setError("Incorrect PIN. Please try again.");
      }
    } else {
      if (step === "enter") {
        setPinFirst(entered);
        setPin("");
        setStep("confirm");
      } else {
        if (entered === pinFirst) {
          reset();
          onPinSet?.(entered);
        } else {
          setPin("");
          setPinFirst("");
          setStep("enter");
          setError("PINs did not match. Please try again.");
        }
      }
    }
  }, [mode, existingPin, step, pinFirst, reset, onVerified, onPinSet]);

  const heading = title ?? (mode === "verify" ? "Enter Parental PIN" : step === "enter" ? "Create Parental PIN" : "Confirm PIN");
  const subtitle = mode === "set"
    ? step === "enter"
      ? "Choose a 4-digit PIN to protect parental controls"
      : "Enter your PIN again to confirm"
    : "Enter your parental controls PIN to continue";

  const KEYS: (string | null)[] = ["1","2","3","4","5","6","7","8","9",null,"0","⌫"];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconRing}>
              <Feather name="shield" size={20} color={Colors.dark.accent} />
            </View>
            <Pressable style={styles.closeBtn} onPress={handleClose}>
              <Feather name="x" size={18} color={Colors.dark.textSecondary} />
            </Pressable>
          </View>

          <ThemedText style={styles.heading}>{heading}</ThemedText>
          <ThemedText style={styles.subtitle}>{subtitle}</ThemedText>

          {/* PIN dots */}
          <View style={styles.dotsRow}>
            {[0,1,2,3].map((i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { borderColor: pin.length > i ? Colors.dark.accent : Colors.dark.border },
                  pin.length > i && { backgroundColor: Colors.dark.accent },
                ]}
              />
            ))}
          </View>

          {/* Error */}
          {error ? (
            <View style={styles.errorRow}>
              <Feather name="alert-circle" size={13} color={Colors.dark.error} />
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          ) : null}

          {/* Keypad */}
          <View style={styles.keypad}>
            {KEYS.map((k, idx) => {
              if (k === null) return <View key={idx} style={styles.keyEmpty} />;
              return (
                <PinKey
                  key={idx}
                  label={k}
                  onPress={() => handleKey(k)}
                />
              );
            })}
          </View>

          <Pressable style={styles.cancelLink} onPress={handleClose}>
            <ThemedText style={styles.cancelText}>Cancel</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.82)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 24,
  },
  header: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  iconRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,102,0,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
  },
  heading: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.dark.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 16,
    marginVertical: Spacing.md,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    backgroundColor: "transparent",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,59,59,0.1)",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255,59,59,0.25)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    width: "100%",
  },
  errorText: {
    fontSize: 12,
    color: Colors.dark.error,
    flex: 1,
  },
  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    maxWidth: 220,
    justifyContent: "center",
    marginTop: Spacing.sm,
  },
  key: {
    width: 64,
    height: 60,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
  },
  keyActive: {
    backgroundColor: Colors.dark.accentDim,
    borderColor: Colors.dark.accent,
  },
  keyEmpty: {
    width: 64,
    height: 60,
  },
  keyText: {
    fontSize: 22,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  keyTextActive: {
    color: Colors.dark.accent,
  },
  cancelLink: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  cancelText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textDecorationLine: "underline",
  },
});
