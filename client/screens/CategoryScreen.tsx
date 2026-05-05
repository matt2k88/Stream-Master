import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { xtreamApi, Category } from "@/lib/xtream-api";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type CategoryRouteProp = RouteProp<RootStackParamList, "Category">;

export default function CategoryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<CategoryRouteProp>();
  const { type, title } = route.params;
  const { width, height } = useWindowDimensions();

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const padH = Math.max(insets.left + Spacing.sm, Spacing.md);
  const padT = Math.max(insets.top + Spacing.sm, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.sm, Spacing.md);
  const cardGap = Spacing.sm;

  const numColumns = Math.max(2, Math.floor(width / 180));
  const totalPad = padH * 2 + cardGap * (numColumns - 1);
  const cardWidth = Math.floor((width - totalPad) / numColumns);
  const cardHeight = Math.max(80, Math.min(cardWidth * 0.55, 120));

  useEffect(() => {
    loadCategories();
  }, [type]);

  const loadCategories = async () => {
    setIsLoading(true);
    setError("");
    try {
      let data: Category[] = [];
      switch (type) {
        case "live": data = await xtreamApi.getLiveCategories(); break;
        case "movies": data = await xtreamApi.getVodCategories(); break;
        case "series": data = await xtreamApi.getSeriesCategories(); break;
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
      case "live": return "tv";
      case "movies": return "film";
      case "series": return "grid";
      default: return "folder";
    }
  };

  const renderCategory = ({ item }: { item: Category }) => (
    <Pressable
      style={({ pressed }) => [
        styles.categoryCard,
        { width: cardWidth, height: cardHeight },
        pressed && styles.categoryCardPressed,
      ]}
      onPress={() => handleCategoryPress(item)}
    >
      <Feather name={getIcon()} size={22} color={Colors.dark.accent} />
      <ThemedText style={styles.categoryName} numberOfLines={2}>
        {item.category_name}
      </ThemedText>
    </Pressable>
  );

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={styles.loadingText}>Loading categories...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centered}>
          <Feather name="alert-circle" size={40} color={Colors.dark.error} />
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
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={22} color={Colors.dark.text} />
        </Pressable>
        <ThemedText type="h3" style={styles.headerTitle}>{title}</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={categories}
        renderItem={renderCategory}
        keyExtractor={(item) => item.category_id}
        numColumns={numColumns}
        key={`cols-${numColumns}`}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: padB, paddingHorizontal: padH },
        ]}
        columnWrapperStyle={numColumns > 1 ? { gap: cardGap, marginBottom: cardGap } : undefined}
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
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    justifyContent: "center",
    alignItems: "center",
  },
  iconBtnPressed: {
    opacity: 0.7,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  headerTitle: {
    flex: 1,
    color: Colors.dark.text,
  },
  headerSpacer: {
    width: 40,
  },
  listContent: {
    paddingTop: Spacing.sm,
  },
  categoryCard: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  categoryCardPressed: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  categoryName: {
    color: Colors.dark.text,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "500",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.dark.textSecondary,
  },
  errorText: {
    color: Colors.dark.error,
    textAlign: "center",
  },
  retryButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.accent,
    borderRadius: BorderRadius.sm,
  },
  retryButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
});
