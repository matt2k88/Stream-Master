import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { xtreamApi, Category } from "@/lib/xtream-api";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type CategoryRouteProp = RouteProp<RootStackParamList, "Category">;

export default function CategoryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<CategoryRouteProp>();
  const { type, title } = route.params;

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadCategories();
  }, [type]);

  const loadCategories = async () => {
    setIsLoading(true);
    setError("");
    try {
      let data: Category[] = [];
      switch (type) {
        case "live":
          data = await xtreamApi.getLiveCategories();
          break;
        case "movies":
          data = await xtreamApi.getVodCategories();
          break;
        case "series":
          data = await xtreamApi.getSeriesCategories();
          break;
      }
      setCategories(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load categories");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategoryPress = (category: Category) => {
    navigation.navigate("ContentList", {
      type,
      categoryId: category.category_id,
      categoryName: category.category_name,
    });
  };

  const getIcon = (): keyof typeof Feather.glyphMap => {
    switch (type) {
      case "live":
        return "tv";
      case "movies":
        return "film";
      case "series":
        return "grid";
      default:
        return "folder";
    }
  };

  const renderCategory = ({ item }: { item: Category }) => (
    <Pressable
      style={({ pressed }) => [
        styles.categoryCard,
        pressed && styles.categoryCardPressed,
      ]}
      onPress={() => handleCategoryPress(item)}
    >
      <View style={styles.categoryIconContainer}>
        <Feather name={getIcon()} size={32} color={Colors.dark.accent} />
      </View>
      <ThemedText type="body" style={styles.categoryName} numberOfLines={2}>
        {item.category_name}
      </ThemedText>
    </Pressable>
  );

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={styles.loadingText}>Loading categories...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.errorContainer}>
          <Feather name="alert-circle" size={48} color={Colors.dark.error} />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <Pressable style={styles.retryButton} onPress={loadCategories}>
            <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

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
        <Pressable
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.backButtonPressed,
          ]}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={24} color={Colors.dark.text} />
        </Pressable>
        <ThemedText type="h2" style={styles.headerTitle}>
          {title}
        </ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={categories}
        renderItem={renderCategory}
        keyExtractor={(item) => item.category_id}
        numColumns={4}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingBottom: insets.bottom + Spacing.tvSafeZone,
            paddingHorizontal: insets.left + Spacing.tvSafeZone,
          },
        ]}
        columnWrapperStyle={styles.columnWrapper}
        showsVerticalScrollIndicator={false}
      />
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
    paddingBottom: Spacing.lg,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.lg,
  },
  backButtonPressed: {
    opacity: 0.7,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  headerTitle: {
    flex: 1,
    color: Colors.dark.text,
  },
  headerSpacer: {
    width: 48,
  },
  listContent: {
    paddingTop: Spacing.lg,
  },
  columnWrapper: {
    justifyContent: "flex-start",
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  categoryCard: {
    width: 200,
    height: 120,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.md,
    ...Shadows.card,
  },
  categoryCardPressed: {
    transform: [{ scale: 1.03 }],
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  categoryIconContainer: {
    marginBottom: Spacing.sm,
  },
  categoryName: {
    color: Colors.dark.text,
    textAlign: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.lg,
    color: Colors.dark.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.tvSafeZone,
  },
  errorText: {
    color: Colors.dark.error,
    marginTop: Spacing.lg,
    textAlign: "center",
  },
  retryButton: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing["2xl"],
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.accent,
    borderRadius: BorderRadius.sm,
  },
  retryButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
});
