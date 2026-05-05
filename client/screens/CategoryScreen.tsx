import React, { useState } from "react";
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
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Category } from "@/lib/xtream-api";
import { useData } from "@/contexts/DataContext";
import { useFavourites } from "@/contexts/FavouritesContext";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type CategoryRouteProp = RouteProp<RootStackParamList, "Category">;

function FavouritesButton({
  type,
  count,
  onPress,
}: {
  type: "live" | "movies" | "series";
  count: number;
  onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const isActive = pressed || focused;

  return (
    <Pressable
      style={[styles.favButton, isActive && styles.favButtonActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <LinearGradient
        colors={["rgba(255,102,0,0.18)", "rgba(255,102,0,0.06)"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      />
      <View style={styles.favLeft}>
        <View style={styles.favIconWrap}>
          <Feather name="star" size={18} color={Colors.dark.accent} />
        </View>
        <ThemedText style={styles.favTitle}>Favourites</ThemedText>
      </View>
      <View style={styles.favRight}>
        {count > 0 ? (
          <View style={styles.favCountBadge}>
            <ThemedText style={styles.favCountText}>{count}</ThemedText>
          </View>
        ) : null}
        <Feather name="chevron-right" size={18} color={Colors.dark.accent} />
      </View>
      <View style={styles.favBottomBar} />
    </Pressable>
  );
}

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
      style={[styles.card, { width: cardWidth, height: cardHeight }, isActive && styles.cardActive]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {isActive ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.14)", "rgba(255,102,0,0.04)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      ) : null}
      <Feather name={icon} size={20} color={isActive ? Colors.dark.accent : Colors.dark.textSecondary} />
      <ThemedText style={[styles.cardText, isActive && styles.cardTextActive]} numberOfLines={2}>
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
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const { liveCategories, vodCategories, seriesCategories, isSyncing } = useData();
  const { getFavouritesByType } = useFavourites();

  const padH = Math.max(insets.left + Spacing.xs, Spacing.md);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.sm);
  const gap = Spacing.sm;

  const numColumns = isLandscape ? 2 : Math.max(2, Math.floor(width / 170));
  const cardWidth = Math.floor((width - padH * 2 - gap * (numColumns - 1)) / numColumns);
  const cardHeight = Math.max(72, Math.min(cardWidth * 0.42, 100));

  const categories: Category[] =
    type === "live" ? liveCategories :
    type === "movies" ? vodCategories :
    seriesCategories;

  const getIcon = (): keyof typeof Feather.glyphMap => {
    switch (type) {
      case "live": return "tv";
      case "movies": return "film";
      case "series": return "grid";
      default: return "folder";
    }
  };

  const favCount = getFavouritesByType(type).length;

  if (isSyncing && categories.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={styles.loadingText}>Loading...</ThemedText>
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
        ListHeaderComponent={
          <FavouritesButton
            type={type}
            count={favCount}
            onPress={() =>
              navigation.navigate("ContentList", {
                type,
                categoryId: "favourites",
                categoryName: "Favourites",
              })
            }
          />
        }
        contentContainerStyle={{
          paddingHorizontal: padH,
          paddingTop: Spacing.sm,
          paddingBottom: padB,
          gap,
        }}
        columnWrapperStyle={numColumns > 1 ? { gap } : undefined}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <CategoryCard
            item={item}
            icon={getIcon()}
            onPress={() =>
              navigation.navigate("ContentList", {
                type,
                categoryId: item.category_id,
                categoryName: item.category_name,
              })
            }
            width={cardWidth}
            height={cardHeight}
          />
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { flexDirection: "row", alignItems: "center", paddingBottom: Spacing.md, gap: Spacing.md },
  backBtn: {
    width: 40, height: 40, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  backBtnPressed: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: Colors.dark.text },
  divider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.sm },
  favButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm, borderWidth: 1.5, borderColor: Colors.dark.accent,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm, overflow: "hidden",
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
  },
  favButtonActive: { shadowOpacity: 0.8, shadowRadius: 18, elevation: 14 },
  favLeft: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  favIconWrap: {
    width: 36, height: 36, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.accentDim, borderWidth: 1, borderColor: Colors.dark.accent,
    justifyContent: "center", alignItems: "center",
  },
  favTitle: { fontSize: 15, fontWeight: "700", color: Colors.dark.accent, letterSpacing: 0.3 },
  favRight: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  favCountBadge: {
    backgroundColor: Colors.dark.accent, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 2, minWidth: 28, alignItems: "center",
  },
  favCountText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  favBottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
    backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 6,
  },
  card: {
    flex: 1, backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
    padding: Spacing.sm, gap: Spacing.xs, overflow: "hidden",
  },
  cardActive: {
    borderColor: Colors.dark.accent, backgroundColor: Colors.dark.backgroundSecondary,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7, shadowRadius: 12, elevation: 10,
  },
  cardText: { color: Colors.dark.textSecondary, fontSize: 13, fontWeight: "500", textAlign: "center" },
  cardTextActive: { color: Colors.dark.accent, fontWeight: "600" },
  cardGlow: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
    backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 4,
  },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: Spacing.md },
  loadingText: { color: Colors.dark.textSecondary, fontSize: 14 },
});
