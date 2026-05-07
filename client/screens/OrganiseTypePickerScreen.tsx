import React, { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

function BackBtn({ onPress }: { onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isActive = focused || pressed || hovered;
  return (
    <Pressable
      style={[styles.backBtn, isActive && styles.backBtnActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <Feather name="arrow-left" size={20} color={isActive ? Colors.dark.accent : Colors.dark.text} />
    </Pressable>
  );
}

function TypeCard({
  icon,
  label,
  description,
  onPress,
  autoFocus,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  description: string;
  onPress: () => void;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isActive = focused || pressed || hovered;
  return (
    <Pressable
      style={[styles.typeCard, isActive && styles.typeCardActive]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      autoFocus={autoFocus as any}
      hasTVPreferredFocus={!!autoFocus}
    >
      {isActive ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.18)", "rgba(255,102,0,0.04)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}
      <View style={[styles.typeIconWrap, isActive && styles.typeIconWrapActive]}>
        <Feather name={icon} size={28} color={Colors.dark.accent} />
      </View>
      <View style={styles.typeTextWrap}>
        <ThemedText style={[styles.typeLabel, isActive && styles.typeLabelActive]}>{label}</ThemedText>
        <ThemedText style={styles.typeDesc}>{description}</ThemedText>
      </View>
      <Feather name="chevron-right" size={20} color={isActive ? Colors.dark.accent : Colors.dark.textSecondary} />
    </Pressable>
  );
}

export default function OrganiseTypePickerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();

  const padH = Math.max(insets.left + Spacing.sm, Spacing.lg);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.md);

  const go = (type: "live" | "movies" | "series") =>
    navigation.navigate("OrganiseCategories", { type });

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <BackBtn onPress={() => navigation.goBack()} />
        <ThemedText style={styles.headerTitle}>Organise Categories</ThemedText>
        <View style={{ width: 40 }} />
      </View>
      <View style={[styles.divider, { marginHorizontal: padH }]} />

      <View style={[styles.body, { paddingHorizontal: padH, paddingBottom: padB }]}>
        <ThemedText style={styles.subtitle}>
          Pick which section you want to reorder or hide categories in. Changes are saved per profile.
        </ThemedText>

        <View style={styles.cards}>
          <TypeCard
            icon="tv"
            label="Live TV"
            description="Reorder or hide live channel categories"
            onPress={() => go("live")}
            autoFocus
          />
          <TypeCard
            icon="film"
            label="Movies"
            description="Reorder or hide movie categories"
            onPress={() => go("movies")}
          />
          <TypeCard
            icon="grid"
            label="Series"
            description="Reorder or hide series categories"
            onPress={() => go("series")}
          />
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { flexDirection: "row", alignItems: "center", paddingBottom: Spacing.md, gap: Spacing.md },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: Colors.dark.text },
  divider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.lg },
  backBtn: {
    width: 40, height: 40, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center", overflow: "hidden",
  },
  backBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  body: { flex: 1, gap: Spacing.lg, maxWidth: 720, alignSelf: "center", width: "100%" },
  subtitle: { color: Colors.dark.textSecondary, fontSize: 13, lineHeight: 18 },
  cards: { gap: Spacing.md },
  typeCard: {
    flexDirection: "row", alignItems: "center", gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.dark.border,
    padding: Spacing.lg, overflow: "hidden",
  },
  typeCardActive: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
  },
  typeIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  typeIconWrapActive: { backgroundColor: Colors.dark.accentDim, borderColor: Colors.dark.accent },
  typeTextWrap: { flex: 1, gap: 4 },
  typeLabel: { fontSize: 16, fontWeight: "700", color: Colors.dark.text },
  typeLabelActive: { color: Colors.dark.accent },
  typeDesc: { fontSize: 12, color: Colors.dark.textSecondary },
});
