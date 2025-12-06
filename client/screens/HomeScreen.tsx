import React from "react";
import { View, StyleSheet, Pressable, Image } from "react-native";
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
}

function CategoryBox({ title, icon, onPress }: CategoryBoxProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.categoryBox,
        pressed && styles.categoryBoxPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.categoryIconContainer}>
        <Feather name={icon} size={72} color={Colors.dark.text} />
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

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Spacing.lg,
            paddingHorizontal: insets.left + Spacing.tvSafeZone,
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
          <Feather name="user" size={24} color={Colors.dark.text} />
        </Pressable>
      </View>

      <View
        style={[
          styles.content,
          {
            paddingBottom: insets.bottom + Spacing.tvSafeZone,
            paddingHorizontal: insets.left + Spacing.tvSafeZone,
          },
        ]}
      >
        <View style={styles.categoriesContainer}>
          <CategoryBox
            title="Live TV"
            icon="tv"
            onPress={() => navigation.navigate("Category", { type: "live", title: "Live TV" })}
          />
          <CategoryBox
            title="Movies"
            icon="film"
            onPress={() => navigation.navigate("Category", { type: "movies", title: "Movies" })}
          />
          <CategoryBox
            title="Series"
            icon="grid"
            onPress={() => navigation.navigate("Category", { type: "series", title: "Series" })}
          />
        </View>
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
    paddingBottom: Spacing.lg,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerLogo: {
    width: 40,
    height: 40,
    marginRight: Spacing.md,
  },
  headerTitle: {
    color: Colors.dark.text,
  },
  accountButton: {
    width: 48,
    height: 48,
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
  },
  categoriesContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing["3xl"],
  },
  categoryBox: {
    width: 280,
    height: 200,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.lg,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.border,
    ...Shadows.card,
  },
  categoryBoxPressed: {
    transform: [{ scale: 1.05 }],
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  categoryIconContainer: {
    marginBottom: Spacing.lg,
  },
  categoryTitle: {
    color: Colors.dark.text,
    textAlign: "center",
  },
});
