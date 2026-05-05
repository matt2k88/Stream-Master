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

function CategoryCard({
  item,
  icon,
  onPress,
  width: cardWidth,
  height: cardHeight,
}: {
  item: Category;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  width: number;
  height: number;
}) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;

  return (
    <Pressable
      style={[
        styles.card,
        { width: cardWidth, height: cardHeight },
        isActive && styles.cardActive,
      ]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <Feather
        name={icon}
        size={20}
        color={isActive ? Colors.dark.accent : Colors.dark.textSecondary}
      />
      <ThemedText
        style={[styles.cardText, isActive && styles.cardTextActive]}
        numberOfLines={2}
      >
        {item.category_name}
      </ThemedText>
      {isActive ? <View style={styles.cardGlow} /> : null}
    </Pressable>
  );
}

export default function CategoryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<CategoryRouteProp>();
  const { type, title } = route.params;
  const { width } = useWindowDimensions();

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const padH = Math.max(insets.left + Spacing.xs, Spacing.md);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.sm);
  const gap = Spacing.sm;
  const numColumns = Math.max(2, Math.floor(width / 170));
  const cardWidth = Math.floor((width - padH * 2 - gap * (numColumns - 1)) / numColumns);
  const cardHeight = Math.max(72, Math.min(cardWidth * 0.52, 110));

  useEffect(() => { loadCategories(); }, [type]);

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

  const getIcon = (): keyof typeof Feather.glyphMap => {
    switch (type) {
      case "live": return "tv";
      case "movies": return "film";
      case "series": return "grid";
      default: return "folder";
    }
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={styles.loadingText}>Loading...</ThemedText>
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
          <Pressable style={styles.retryBtn} onPress={loadCategories}>
            <ThemedText style={styles.retryBtnText}>Retry</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={20} color={Colors.dark.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>{title}</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      <FlatList
        data={categories}
        keyExtractor={(item) => item.category_id}
        numColumns={numColumns}
        key={`cat-${numColumns}`}
        contentContainerStyle={{ paddingHorizontal: padH, paddingTop: Spacing.sm, paddingBottom: padB }}
        columnWrapperStyle={numColumns > 1 ? { gap, marginBottom: gap } : undefined}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <CategoryCard
            item={item}
            icon={getIcon()}
            onPress={() => navigation.navigate("ContentList", {
              type,
              categoryId: item.category_id,
              categoryName: item.category_name,
            })}
            width={cardWidth}
            height={cardHeight}
          />
        )}
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
  },
  backBtnPressed: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accentDim,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.dark.border,
    marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.sm,
    gap: Spacing.xs,
    overflow: "hidden",
  },
  cardActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.backgroundSecondary,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 10,
  },
  cardText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  cardTextActive: {
    color: Colors.dark.accent,
    fontWeight: "600",
  },
  cardGlow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
  },
  errorText: {
    color: Colors.dark.error,
    textAlign: "center",
    fontSize: 14,
  },
  retryBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.accent,
    borderRadius: BorderRadius.sm,
  },
  retryBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
});
