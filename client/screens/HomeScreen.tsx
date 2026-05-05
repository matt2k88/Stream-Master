import React, { useState } from "react";
import { View, StyleSheet, Pressable, Image, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { LinearGradient } from "expo-linear-gradient";
import { useData } from "@/contexts/DataContext";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface NavButtonProps {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  large?: boolean;
  tall?: boolean;
}

function NavButton({ title, icon, onPress, large, tall }: NavButtonProps) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;

  return (
    <Pressable
      style={[
        styles.navButton,
        large && styles.navButtonLarge,
        tall && styles.navButtonTall,
        isActive && styles.navButtonActive,
      ]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {isActive ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.18)", "rgba(255,102,0,0.06)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}

      <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
        <Feather
          name={icon}
          size={large || tall ? 34 : 26}
          color={isActive ? Colors.dark.accent : Colors.dark.textSecondary}
        />
      </View>
      <ThemedText
        style={[
          styles.navButtonText,
          (large || tall) && styles.navButtonTextLarge,
          isActive && styles.navButtonTextActive,
        ]}
      >
        {title}
      </ThemedText>

      {isActive ? <View style={styles.activeIndicator} /> : null}
    </Pressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const { refresh } = useData();
  const [refreshing, setRefreshing] = useState(false);

  const padH = Math.max(insets.left + Spacing.sm, Spacing.lg);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.md);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <View style={styles.headerBrand}>
          <Image
            source={require("../../assets/images/icon.png")}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <View>
            <ThemedText style={styles.appName}>Ultra Cast</ThemedText>
            <ThemedText style={styles.appVersion}>v3</ThemedText>
          </View>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnActive]}
            onPress={handleRefresh}
            disabled={refreshing}
          >
            <Feather
              name="refresh-cw"
              size={16}
              color={refreshing ? Colors.dark.accent : Colors.dark.textSecondary}
            />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnActive]}
            onPress={() => navigation.navigate("AccountInfo")}
          >
            <Feather name="user" size={18} color={Colors.dark.accent} />
          </Pressable>
        </View>
      </View>

      {/* Divider */}
      <View style={[styles.headerDivider, { marginHorizontal: padH }]} />

      {/* Body */}
      {isLandscape ? (
        <View style={[styles.bodyLandscape, { paddingHorizontal: padH, paddingBottom: padB }]}>
          {/* Left panel */}
          <View style={styles.leftPanel}>
            <NavButton
              title="Live TV"
              icon="tv"
              onPress={() => navigation.navigate("Category", { type: "live", title: "Live TV" })}
              large
            />
            <View style={styles.subRow}>
              <NavButton
                title="Movies"
                icon="film"
                onPress={() => navigation.navigate("Category", { type: "movies", title: "Movies" })}
                tall
              />
              <NavButton
                title="Series"
                icon="grid"
                onPress={() => navigation.navigate("Category", { type: "series", title: "Series" })}
                tall
              />
            </View>
          </View>

          {/* Right panel */}
          <View style={styles.rightPanel}>
            <View style={styles.futurePanel}>
              <LinearGradient
                colors={["rgba(255,102,0,0.04)", "transparent"]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
              />
              <Feather name="zap" size={28} color="rgba(255,102,0,0.2)" />
              <ThemedText style={styles.futurePanelText}>Coming Soon</ThemedText>
            </View>
          </View>
        </View>
      ) : (
        /* Portrait layout */
        <View style={[styles.bodyPortrait, { paddingHorizontal: padH, paddingBottom: padB }]}>
          <View style={styles.portraitNav}>
            <NavButton
              title="Live TV"
              icon="tv"
              onPress={() => navigation.navigate("Category", { type: "live", title: "Live TV" })}
              large
            />
            <View style={styles.subRow}>
              <NavButton
                title="Movies"
                icon="film"
                onPress={() => navigation.navigate("Category", { type: "movies", title: "Movies" })}
              />
              <NavButton
                title="Series"
                icon="grid"
                onPress={() => navigation.navigate("Category", { type: "series", title: "Series" })}
              />
            </View>
          </View>

          <View style={styles.portraitFuture}>
            <LinearGradient
              colors={["rgba(255,102,0,0.05)", "transparent"]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
            />
            <Feather name="zap" size={24} color="rgba(255,102,0,0.2)" />
            <ThemedText style={styles.futurePanelText}>Coming Soon</ThemedText>
          </View>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: Spacing.md,
  },
  headerBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerLogo: {
    width: 36,
    height: 36,
  },
  appName: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 0.5,
  },
  appVersion: {
    fontSize: 11,
    color: Colors.dark.accent,
    fontWeight: "600",
    letterSpacing: 1,
  },
  headerActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    alignItems: "center",
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
  },
  headerBtnActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accentDim,
  },
  headerDivider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginBottom: Spacing.md,
  },
  bodyLandscape: {
    flex: 1,
    flexDirection: "row",
    gap: Spacing.lg,
  },
  leftPanel: {
    flex: 1,
    flexDirection: "column",
    gap: Spacing.md,
  },
  rightPanel: {
    flex: 1,
  },
  bodyPortrait: {
    flex: 1,
    flexDirection: "column",
    gap: Spacing.md,
  },
  portraitNav: {
    gap: Spacing.md,
  },
  portraitFuture: {
    flex: 1,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
    overflow: "hidden",
    minHeight: 120,
  },
  subRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  navButton: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
    gap: Spacing.sm,
    overflow: "hidden",
    minHeight: 80,
  },
  navButtonLarge: {
    minHeight: 120,
    padding: Spacing.xl,
    flex: 2,
  },
  navButtonTall: {
    minHeight: 160,
    padding: Spacing.xl,
  },
  navButtonActive: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 12,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  iconWrapActive: {
    backgroundColor: Colors.dark.accentDim,
    borderColor: Colors.dark.accent,
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textSecondary,
    letterSpacing: 0.3,
  },
  navButtonTextLarge: {
    fontSize: 18,
    fontWeight: "700",
  },
  navButtonTextActive: {
    color: Colors.dark.accent,
  },
  activeIndicator: {
    position: "absolute",
    bottom: 0,
    left: "20%",
    right: "20%",
    height: 2,
    backgroundColor: Colors.dark.accent,
    borderRadius: 1,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
  },
  futurePanel: {
    flex: 1,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
    overflow: "hidden",
  },
  futurePanelText: {
    color: "rgba(255,102,0,0.3)",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
