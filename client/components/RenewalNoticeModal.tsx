import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  Linking,
  Alert,
  useWindowDimensions,
  Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { ExpiryStatus, formatExpiryNotice } from "@/lib/expiry";

// One-line knobs to change later — kept here so we don't have to dig.
const RENEWAL_WHATSAPP_DISPLAY = "07459683465";
const RENEWAL_WHATSAPP_INTL = "447459683465"; // UK: drop leading 0, prefix +44

interface FocusableButtonProps {
  onPress: () => void;
  variant: "primary" | "secondary" | "ghost";
  icon?: keyof typeof Feather.glyphMap;
  label: string;
  autoFocus?: boolean;
  flex?: boolean;
}

function FocusableButton({
  onPress,
  variant,
  icon,
  label,
  autoFocus,
  flex,
}: FocusableButtonProps) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isActive = focused || pressed || hovered;

  const isPrimary = variant === "primary";
  const isGhost = variant === "ghost";

  return (
    <Pressable
      hasTVPreferredFocus={autoFocus}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.btn,
        flex && { flex: 1 },
        isPrimary && styles.btnPrimary,
        !isPrimary && !isGhost && styles.btnSecondary,
        isGhost && styles.btnGhost,
        isActive && (isPrimary ? styles.btnPrimaryActive : styles.btnSecondaryActive),
      ]}
    >
      {icon ? (
        <Feather
          name={icon}
          size={16}
          color={
            isPrimary
              ? isActive ? "#fff" : Colors.dark.text
              : isActive ? Colors.dark.accent : Colors.dark.textSecondary
          }
        />
      ) : null}
      <ThemedText
        style={[
          styles.btnText,
          isPrimary
            ? { color: isActive ? "#fff" : Colors.dark.text }
            : { color: isActive ? Colors.dark.accent : Colors.dark.textSecondary },
        ]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

interface RenewalNoticeModalProps {
  visible: boolean;
  status: ExpiryStatus;
  onClose: () => void;
}

export default function RenewalNoticeModal({
  visible,
  status,
  onClose,
}: RenewalNoticeModalProps) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const [copied, setCopied] = useState(false);

  const headline = status.isExpired
    ? "Subscription expired"
    : "Subscription renewal";

  // Body sentence — uses the shared formatter then appends contact instructions.
  const body = `${formatExpiryNotice(status)}. To renew your subscription, please contact us directly on WhatsApp using the number below.`;

  const handleOpenWhatsApp = async () => {
    const url = `whatsapp://send?phone=${RENEWAL_WHATSAPP_INTL}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        return;
      }
    } catch {
    }
    // Fallback: web wa.me link works on devices without WhatsApp installed.
    try {
      await Linking.openURL(`https://wa.me/${RENEWAL_WHATSAPP_INTL}`);
    } catch {
      Alert.alert(
        "WhatsApp not available",
        `Please contact us on WhatsApp: ${RENEWAL_WHATSAPP_DISPLAY}`,
      );
    }
  };

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(RENEWAL_WHATSAPP_DISPLAY);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.dialog,
            isLandscape ? styles.dialogLandscape : styles.dialogPortrait,
          ]}
        >
          {/* Close (X) — top-right of card */}
          <CloseButton onPress={onClose} />

          <View style={styles.iconWrap}>
            <Feather name="alert-circle" size={28} color={Colors.dark.error} />
          </View>

          <ThemedText style={styles.title}>{headline}</ThemedText>
          <ThemedText style={styles.message}>{body}</ThemedText>

          {/* WhatsApp number pill — tappable, opens WhatsApp */}
          <NumberPill
            display={RENEWAL_WHATSAPP_DISPLAY}
            onPress={handleOpenWhatsApp}
          />

          <View style={[styles.btnRow, isLandscape && styles.btnRowLandscape]}>
            <FocusableButton
              variant="secondary"
              icon={copied ? "check" : "copy"}
              label={copied ? "Copied" : "Copy Number"}
              onPress={handleCopy}
              flex
            />
            <FocusableButton
              variant="primary"
              icon="message-circle"
              label="Open WhatsApp"
              onPress={handleOpenWhatsApp}
              autoFocus
              flex
            />
          </View>

          <FocusableButton
            variant="ghost"
            label="Close"
            onPress={onClose}
          />
        </View>
      </View>
    </Modal>
  );
}

function CloseButton({ onPress }: { onPress: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = hovered || focused || pressed;
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.closeBtn, isActive && styles.closeBtnActive]}
      hitSlop={10}
    >
      <Feather
        name="x"
        size={18}
        color={isActive ? "#fff" : Colors.dark.textSecondary}
      />
    </Pressable>
  );
}

function NumberPill({
  display,
  onPress,
}: {
  display: string;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = hovered || focused || pressed;
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.numberPill, isActive && styles.numberPillActive]}
    >
      <Feather
        name="phone"
        size={16}
        color={isActive ? "#fff" : Colors.dark.accent}
      />
      <ThemedText
        style={[
          styles.numberText,
          isActive && { color: "#fff" },
        ]}
      >
        {display}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  dialog: {
    width: "100%",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.dark.accent,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    alignItems: "center",
    gap: Spacing.md,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
    position: "relative",
  },
  dialogPortrait: { maxWidth: 460 },
  dialogLandscape: { maxWidth: 560 },

  closeBtn: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  closeBtnActive: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },

  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,59,59,0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(255,59,59,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 0.4,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    paddingHorizontal: Spacing.sm,
  },

  numberPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.dark.accent,
    backgroundColor: "rgba(255,102,0,0.10)",
    marginVertical: Spacing.xs,
  },
  numberPillActive: {
    backgroundColor: Colors.dark.accent,
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 14,
    elevation: 8,
  },
  numberText: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.dark.accent,
    letterSpacing: 1.2,
  },

  btnRow: {
    flexDirection: "column",
    gap: Spacing.sm,
    width: "100%",
    marginTop: Spacing.xs,
  },
  btnRowLandscape: {
    flexDirection: "row",
  },

  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    minHeight: 44,
  },
  btnPrimary: {
    backgroundColor: "rgba(255,102,0,0.15)",
    borderColor: Colors.dark.accent,
  },
  btnPrimaryActive: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
    shadowColor: Colors.dark.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 8,
  },
  btnSecondary: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: Colors.dark.border,
  },
  btnSecondaryActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: "rgba(255,102,0,0.10)",
  },
  btnGhost: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    minHeight: 36,
    paddingVertical: 6,
    width: "auto",
  },
  btnText: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
