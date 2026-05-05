import React from "react";
import { View, StyleSheet, Pressable, Image, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface CategoryBoxProps {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  isLandscape: boolean;
}

function CategoryBox({ title, icon, onPress, isLandscape }: CategoryBoxProps) {
  const iconSize = isLandscape ? 48 : 40;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.categoryBox,
        pressed && styles.categoryBoxPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.categoryIconContainer}>
        <Feather name={icon} size={iconSize} color={Colors.dark.text} />
      </View>
      <ThemedText type="h3" style={styles.categoryTitle}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const safeH = Math.min(insets.left + Spacing.lg, Spacing["2xl"]);
  const safeV = Math.min(insets.top + Spacing.sm, Spacing["2xl"]);

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.header,
          {
            paddingTop: safeV,
            paddingHorizontal: safeH,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <Image
            source={require("../../assets/images/icon.png")}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <ThemedText type="h3" style={styles.headerTitle}>
            IPTV Player
          </ThemedText>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.accountButton,
            pressed && styles.accountButtonPressed,
          ]}
          onPress={() => navigation.navigate("AccountInfo")}
        >
          <Feather name="user" size={20} color={Colors.dark.text} />
        </Pressable>
      </View>

      <View
        style={[
          styles.content,
          {
            paddingBottom: Math.max(insets.bottom, Spacing.md),
            paddingHorizontal: safeH,
            flexDirection: isLandscape ? "row" : "column",
          },
        ]}
      >
        <CategoryBox
          title="Live TV"
          icon="tv"
          onPress={() => navigation.navigate("Category", { type: "live", title: "Live TV" })}
          isLandscape={isLandscape}
        />
        <CategoryBox
          title="Movies"
          icon="film"
          onPress={() => navigation.navigate("Category", { type: "movies", title: "Movies" })}
          isLandscape={isLandscape}
        />
        <CategoryBox
          title="Series"
          icon="grid"
          onPress={() => navigation.navigate("Category", { type: "series", title: "Series" })}
          isLandscape={isLandscape}
        />
      </View>
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerLogo: {
    width: 32,
    height: 32,
    marginRight: Spacing.sm,
  },
  headerTitle: {
    color: Colors.dark.text,
  },
  accountButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  accountButtonPressed: {
    opacity: 0.7,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.lg,
  },
  categoryBox: {
    flex: 1,
    width: "100%",
    maxHeight: 180,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.border,
    ...Shadows.card,
  },
  categoryBoxPressed: {
    transform: [{ scale: 1.03 }],
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  categoryIconContainer: {
    marginBottom: Spacing.sm,
  },
  categoryTitle: {
    color: Colors.dark.text,
    textAlign: "center",
  },
});
