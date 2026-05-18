import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import {
  GROUP_ICONS,
  GROUP_COLORS,
  DEFAULT_GROUP_ICON,
  DEFAULT_GROUP_COLOR,
} from "@/lib/group-icons";
import type { GroupType, UserGroup } from "@/contexts/GroupsContext";

interface Props {
  visible: boolean;
  type: GroupType;
  editing?: UserGroup | null; // when editing instead of creating
  onCancel: () => void;
  onSave: (data: { name: string; iconKey: string; color: string }) => void;
  onDelete?: () => void;
}

export default function GroupEditorModal({
  visible,
  type,
  editing,
  onCancel,
  onSave,
  onDelete,
}: Props) {
  const [name, setName] = useState("");
  const [iconKey, setIconKey] = useState(DEFAULT_GROUP_ICON);
  const [color, setColor] = useState(DEFAULT_GROUP_COLOR);

  useEffect(() => {
    if (visible) {
      setName(editing?.name ?? "");
      setIconKey(editing?.icon_key ?? DEFAULT_GROUP_ICON);
      setColor(editing?.color ?? DEFAULT_GROUP_COLOR);
    }
  }, [visible, editing]);

  const typeLabel = type === "live" ? "Live TV" : type === "movies" ? "Movie" : "Series";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <ThemedText style={styles.title}>
              {editing ? "Edit Group" : `New ${typeLabel} Group`}
            </ThemedText>
            <Pressable onPress={onCancel} style={styles.closeBtn} accessibilityLabel="Close">
              <Feather name="x" size={18} color={Colors.dark.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: Spacing.lg }}>
            {/* Name */}
            <ThemedText style={styles.sectionLabel}>Group Name</ThemedText>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Sports, Kids, Action Movies"
              placeholderTextColor={Colors.dark.textSecondary}
              maxLength={60}
              autoCapitalize="words"
              returnKeyType="done"
            />

            {/* Color */}
            <ThemedText style={[styles.sectionLabel, { marginTop: Spacing.md }]}>Colour</ThemedText>
            <View style={styles.colorRow}>
              {GROUP_COLORS.map((c) => (
                <ColorSwatch key={c} color={c} selected={c === color} onPress={() => setColor(c)} />
              ))}
            </View>

            {/* Icon */}
            <ThemedText style={[styles.sectionLabel, { marginTop: Spacing.md }]}>Icon</ThemedText>
            <View style={styles.iconGrid}>
              {GROUP_ICONS.map((def) => (
                <IconSwatch
                  key={def.key}
                  selected={def.key === iconKey}
                  color={color}
                  onPress={() => setIconKey(def.key)}
                  lib={def.lib}
                  iconName={def.name}
                  label={def.label}
                />
              ))}
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            {editing && onDelete ? (
              <FooterBtn
                label="Delete"
                icon="trash-2"
                tone="danger"
                onPress={onDelete}
              />
            ) : null}
            <View style={{ flex: 1 }} />
            <FooterBtn label="Cancel" icon="x" tone="ghost" onPress={onCancel} />
            <FooterBtn
              label={editing ? "Save" : "Create"}
              icon={editing ? "check" : "plus"}
              tone="primary"
              disabled={name.trim().length === 0}
              onPress={() => onSave({ name: name.trim(), iconKey, color })}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ColorSwatch({ color, selected, onPress }: { color: string; selected: boolean; onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isActive = focused || hovered;
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.colorSwatch,
        { backgroundColor: color },
        isActive && styles.colorSwatchActive,
        selected && styles.colorSwatchSelected,
      ]}
      accessibilityLabel={`Colour ${color}`}
    >
      {selected ? (
        <Feather name="check" size={14} color={color === "#FFFFFF" || color === "#FFD700" ? "#000" : "#fff"} />
      ) : null}
    </Pressable>
  );
}

function IconSwatch({
  selected,
  color,
  onPress,
  lib,
  iconName,
  label,
}: {
  selected: boolean;
  color: string;
  onPress: () => void;
  lib: "feather" | "mci";
  iconName: string;
  label: string;
}) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isActive = focused || hovered;
  const IconComp = lib === "feather" ? Feather : MaterialCommunityIcons;
  const tint = selected ? color : isActive ? Colors.dark.accent : Colors.dark.text;
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.iconSwatch,
        isActive && styles.iconSwatchActive,
        selected && { borderColor: color, backgroundColor: "rgba(255,255,255,0.06)" },
      ]}
      accessibilityLabel={label}
    >
      <IconComp name={iconName as any} size={20} color={tint} />
    </Pressable>
  );
}

function FooterBtn({
  label,
  icon,
  onPress,
  tone,
  disabled,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void;
  tone: "primary" | "ghost" | "danger";
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || hovered || pressed;
  const isPrimary = tone === "primary";
  const isDanger = tone === "danger";
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.footerBtn,
        isPrimary && styles.footerBtnPrimary,
        isDanger && styles.footerBtnDanger,
        isActive && !disabled && styles.footerBtnActive,
        disabled && { opacity: 0.4 },
      ]}
    >
      <Feather name={icon} size={14} color={isPrimary || isDanger ? "#fff" : Colors.dark.text} />
      <ThemedText style={{ color: isPrimary || isDanger ? "#fff" : Colors.dark.text, fontWeight: "700", fontSize: 12 }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "92%",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  title: { flex: 1, fontSize: 16, fontWeight: "700", color: Colors.dark.text },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: "center", alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
  },
  body: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: Colors.dark.textSecondary, marginBottom: 8, letterSpacing: 0.5 },
  input: {
    backgroundColor: Colors.dark.backgroundRoot,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    color: Colors.dark.text,
    fontSize: 14,
  },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  colorSwatch: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2, borderColor: "rgba(255,255,255,0.15)",
    justifyContent: "center", alignItems: "center",
  },
  colorSwatchActive: { borderColor: "rgba(255,255,255,0.45)" },
  colorSwatchSelected: { borderColor: "#fff", borderWidth: 3 },
  iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  iconSwatch: {
    width: 44, height: 44, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundRoot,
    justifyContent: "center", alignItems: "center",
  },
  iconSwatchActive: { borderColor: Colors.dark.accent, backgroundColor: "rgba(255,102,0,0.08)" },
  footer: {
    flexDirection: "row", gap: 8, alignItems: "center",
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  footerBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 9, paddingHorizontal: 14,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  footerBtnPrimary: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  footerBtnDanger: {
    backgroundColor: Colors.dark.error,
    borderColor: Colors.dark.error,
  },
  footerBtnActive: {
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9, shadowRadius: 10, elevation: 8,
    transform: [{ scale: 1.03 }],
  },
});
