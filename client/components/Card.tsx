import React, { useRef } from "react";
import { StyleSheet, Pressable, ViewStyle, Animated } from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

interface CardProps {
  elevation?: number;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}

const getBackgroundColorForElevation = (elevation: number, theme: any): string => {
  switch (elevation) {
    case 1: return theme.backgroundDefault;
    case 2: return theme.backgroundSecondary;
    case 3: return theme.backgroundTertiary;
    default: return theme.backgroundRoot;
  }
};

export function Card({ elevation = 1, title, description, children, onPress, style }: CardProps) {
  const { theme } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const cardBackgroundColor = getBackgroundColorForElevation(elevation, theme);

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, damping: 15, stiffness: 150 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 15, stiffness: 150 }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.card, { backgroundColor: cardBackgroundColor }]}
      >
        {title ? (
          <ThemedText type="h4" style={styles.cardTitle}>
            {title}
          </ThemedText>
        ) : null}
        {description ? (
          <ThemedText type="small" style={styles.cardDescription}>
            {description}
          </ThemedText>
        ) : null}
        {children}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.xl,
    borderRadius: BorderRadius["2xl"],
  },
  cardTitle: {
    marginBottom: Spacing.sm,
  },
  cardDescription: {
    opacity: 0.7,
  },
});
