import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import { useMessages, Message } from "@/contexts/MessageContext";

function MessageRow({ item, seen }: { item: Message; seen: boolean }) {
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const isActive = focused || pressed;

  const date = new Date(item.created_at).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });

  return (
    <Pressable
      style={[styles.row, seen && styles.rowSeen, isActive && styles.rowActive]}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      {isActive ? (
        <LinearGradient
          colors={["rgba(255,102,0,0.08)", "transparent"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      ) : null}
      <View style={[styles.rowIcon, seen && styles.rowIconSeen]}>
        <Feather
          name={seen ? "check-circle" : "bell"}
          size={16}
          color={seen ? Colors.dark.textSecondary : Colors.dark.accent}
        />
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowMeta}>
          <ThemedText style={[styles.rowUser, seen && styles.rowUserSeen]}>
            @{item.username}
          </ThemedText>
          <ThemedText style={styles.rowDate}>{date}</ThemedText>
        </View>
        <ThemedText style={[styles.rowMessage, seen && styles.rowMessageSeen]}>
          {item.message}
        </ThemedText>
      </View>
      {!seen ? <View style={styles.unreadDot} /> : null}
    </Pressable>
  );
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { userMessages, seenIds } = useMessages();
  const [backFocused, setBackFocused] = useState(false);
  const [backPressed, setBackPressed] = useState(false);
  const backActive = backFocused || backPressed;

  const padH = Math.max(insets.left + Spacing.sm, Spacing.lg);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.md);

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <Pressable
          style={[styles.iconBtn, backActive && styles.iconBtnActive]}
          onPress={() => navigation.goBack()}
          onFocus={() => setBackFocused(true)}
          onBlur={() => setBackFocused(false)}
          onPressIn={() => setBackPressed(true)}
          onPressOut={() => setBackPressed(false)}
        >
          <Feather name="arrow-left" size={20} color={Colors.dark.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Messages</ThemedText>
        <View style={styles.headerBadge}>
          <ThemedText style={styles.headerBadgeText}>{userMessages.length}</ThemedText>
        </View>
      </View>

      <View style={[styles.divider, { marginHorizontal: padH }]} />

      {userMessages.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="inbox" size={44} color={Colors.dark.border} />
          <ThemedText style={styles.emptyTitle}>No Messages</ThemedText>
          <ThemedText style={styles.emptyText}>No system messages have been sent yet</ThemedText>
        </View>
      ) : (
        <FlatList
          data={userMessages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: padH, paddingBottom: padB, gap: Spacing.sm }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <MessageRow item={item} seen={seenIds.has(item.id)} />
          )}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingBottom: Spacing.md, gap: Spacing.md,
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: Colors.dark.text },
  headerBadge: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 3, minWidth: 32, alignItems: "center",
  },
  headerBadgeText: { fontSize: 12, color: Colors.dark.textSecondary },
  iconBtn: {
    width: 40, height: 40, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  iconBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  divider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.md },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255,102,0,0.25)",
    padding: Spacing.md,
    overflow: "hidden",
  },
  rowSeen: {
    borderColor: Colors.dark.border,
    opacity: 0.7,
  },
  rowActive: {
    borderColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 8, elevation: 6,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.accentDim,
    borderWidth: 1, borderColor: Colors.dark.accent,
    justifyContent: "center", alignItems: "center",
    flexShrink: 0,
  },
  rowIconSeen: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderColor: Colors.dark.border,
  },
  rowContent: { flex: 1 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: 4 },
  rowUser: { fontSize: 12, fontWeight: "700", color: Colors.dark.accent },
  rowUserSeen: { color: Colors.dark.textSecondary },
  rowDate: { fontSize: 11, color: Colors.dark.textSecondary },
  rowMessage: { fontSize: 13, color: Colors.dark.text, lineHeight: 19 },
  rowMessageSeen: { color: Colors.dark.textSecondary },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.dark.accent,
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 4,
    alignSelf: "center", flexShrink: 0,
  },

  empty: { flex: 1, justifyContent: "center", alignItems: "center", gap: Spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: Colors.dark.text },
  emptyText: { color: Colors.dark.textSecondary, fontSize: 13, textAlign: "center" },
});
