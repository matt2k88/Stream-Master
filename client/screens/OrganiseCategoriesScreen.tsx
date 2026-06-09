import React, { useState, useEffect, useMemo, useRef } from "react";
import SideMenuButton from "@/components/SideMenuButton";
import {
  View,
  StyleSheet,
  Pressable,
  FlatList,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useData } from "@/contexts/DataContext";
import { useCategoryOrder } from "@/contexts/CategoryOrderContext";
import { useProfile } from "@/contexts/ProfileContext";
import GuestPrompt from "@/components/GuestPrompt";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteP = RouteProp<RootStackParamList, "OrganiseCategories">;
type ActionKind = "top" | "up" | "down" | "bottom";

// ─── HoverPressable ───────────────────────────────────────────────────────────
const HoverPressable = React.forwardRef<View, {
  children: (active: boolean) => React.ReactNode;
  style: any;
  activeStyle: any;
  onPress: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  keepFocusableWhenDisabled?: boolean;
}>(function HoverPressable(
  { children, style, activeStyle, onPress, disabled, autoFocus, keepFocusableWhenDisabled },
  ref,
) {
  const [f, setF] = useState(false);
  const [p, setP] = useState(false);
  const [h, setH] = useState(false);
  const active = !disabled && (f || p || h);
  // When keepFocusableWhenDisabled is set, never pass `disabled` to the
  // underlying Pressable — Android TV drops focus from a view the moment it
  // becomes truly disabled, which would bounce focus to the back button.
  const isHardDisabled = !!disabled && !keepFocusableWhenDisabled;
  return (
    <Pressable
      ref={ref as any}
      style={[style, active && activeStyle, disabled && { opacity: 0.35 }]}
      onPress={() => { if (!disabled) onPress(); }}
      disabled={isHardDisabled}
      onFocus={() => setF(true)}
      onBlur={() => setF(false)}
      onPressIn={() => setP(true)}
      onPressOut={() => setP(false)}
      onHoverIn={() => setH(true)}
      onHoverOut={() => setH(false)}
      hasTVPreferredFocus={!!autoFocus}
    >
      {children(active)}
    </Pressable>
  );
});

// ─── BackBtn ─────────────────────────────────────────────────────────────────
function BackBtn({ onPress }: { onPress: () => void }) {
  return (
    <HoverPressable
      style={styles.iconBtn}
      activeStyle={styles.iconBtnActive}
      onPress={onPress}
    >
      {(active) => (
        <Feather name="arrow-left" size={20} color={active ? Colors.dark.accent : Colors.dark.text} />
      )}
    </HoverPressable>
  );
}

// ─── ResetBtn ────────────────────────────────────────────────────────────────
function ResetBtn({ onPress }: { onPress: () => void }) {
  return (
    <HoverPressable
      style={styles.resetBtn}
      activeStyle={styles.resetBtnActive}
      onPress={onPress}
    >
      {(active) => (
        <>
          <Feather name="rotate-ccw" size={13} color={active ? Colors.dark.accent : Colors.dark.textSecondary} />
          <ThemedText style={[styles.resetText, active && { color: Colors.dark.accent }]}>
            Reset to Default
          </ThemedText>
        </>
      )}
    </HoverPressable>
  );
}

// ─── ActionBtn ───────────────────────────────────────────────────────────────
// autoFocus here maps directly to hasTVPreferredFocus on the underlying
// Pressable. We use this to restore focus after a reorder without any
// imperative ref.focus() calls (which are unreliable when FlatList scrolls).
const ActionBtn = React.forwardRef<View, {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  tone?: "default" | "warn";
  autoFocus?: boolean;
}>(function ActionBtn({ icon, onPress, disabled, tone = "default", autoFocus }, ref) {
  return (
    <HoverPressable
      ref={ref}
      style={styles.actionBtn}
      activeStyle={tone === "warn" ? styles.actionBtnWarnActive : styles.actionBtnActive}
      onPress={onPress}
      disabled={disabled}
      autoFocus={autoFocus}
      keepFocusableWhenDisabled
    >
      {(active) => (
        <Feather
          name={icon}
          size={16}
          color={active ? (tone === "warn" ? Colors.dark.error : Colors.dark.accent) : Colors.dark.textSecondary}
        />
      )}
    </HoverPressable>
  );
});

// ─── CategoryRow ─────────────────────────────────────────────────────────────
function CategoryRow({
  categoryId,
  index,
  total,
  name,
  hidden,
  onToggle,
  onUp,
  onDown,
  onTop,
  onBottom,
  initialFocus,
  focusKind,          // which action button should receive TV preferred focus
}: {
  categoryId: string;
  index: number;
  total: number;
  name: string;
  hidden: boolean;
  onToggle: () => void;
  onUp: () => void;
  onDown: () => void;
  onTop: () => void;
  onBottom: () => void;
  initialFocus?: boolean;
  focusKind?: ActionKind | null; // null = no action button should focus
}) {
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <View style={styles.row}>
      {/* Tick + name */}
      <HoverPressable
        style={styles.tickArea}
        activeStyle={styles.tickAreaActive}
        onPress={onToggle}
        autoFocus={initialFocus}
      >
        {(active) => (
          <>
            <View
              style={[
                styles.checkbox,
                !hidden && styles.checkboxOn,
                active && styles.checkboxActive,
              ]}
            >
              {!hidden ? <Feather name="check" size={14} color="#fff" /> : null}
            </View>
            <View style={styles.rowTextWrap}>
              <ThemedText
                style={[styles.rowName, hidden && styles.rowNameHidden, active && styles.rowNameActive]}
                numberOfLines={1}
              >
                {name}
              </ThemedText>
              <ThemedText style={[styles.rowMeta, hidden && { color: Colors.dark.error }]}>
                {hidden ? "Hidden" : "Showing"}  •  Position {index + 1}
              </ThemedText>
            </View>
          </>
        )}
      </HoverPressable>

      {/* Move buttons — autoFocus drives hasTVPreferredFocus natively */}
      <View style={styles.actions}>
        <ActionBtn
          icon="chevrons-up"
          onPress={onTop}
          disabled={isFirst}
          autoFocus={focusKind === "top"}
        />
        <ActionBtn
          icon="chevron-up"
          onPress={onUp}
          disabled={isFirst}
          autoFocus={focusKind === "up"}
        />
        <ActionBtn
          icon="chevron-down"
          onPress={onDown}
          disabled={isLast}
          autoFocus={focusKind === "down"}
        />
        <ActionBtn
          icon="chevrons-down"
          onPress={onBottom}
          disabled={isLast}
          autoFocus={focusKind === "bottom"}
        />
      </View>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function OrganiseCategoriesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteP>();
  const { type } = route.params;

  const { liveCategories, vodCategories, seriesCategories } = useData();
  const { isGuest } = useProfile();
  const {
    buildOrganiseList,
    toggleHidden,
    moveUp,
    moveDown,
    moveToTop,
    moveToBottom,
    resetType,
    commitDisplayOrder,
  } = useCategoryOrder();

  const allCats = useMemo(() => {
    if (type === "live") return liveCategories;
    if (type === "movies") return vodCategories;
    return seriesCategories;
  }, [type, liveCategories, vodCategories, seriesCategories]);

  // Seed the order on mount so up/down/top/bottom are predictable.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (!allCats.length) return;
    seededRef.current = true;
    const ids = buildOrganiseList(type, allCats).map((c) => c.category_id);
    commitDisplayOrder(type, ids);
  }, [type, allCats, buildOrganiseList, commitDisplayOrder]);

  const list = useMemo(() => buildOrganiseList(type, allCats), [type, allCats, buildOrganiseList]);

  // Only the very first row on initial mount gets TV preferred focus.
  const initialFocusIdRef = useRef<string | null>(null);
  if (initialFocusIdRef.current === null && list.length > 0) {
    initialFocusIdRef.current = list[0].category_id;
  }

  // ── Focus restoration via hasTVPreferredFocus ─────────────────────────────
  // Instead of imperative ref.focus() (unreliable when FlatList scrolls /
  // recycles views), we drive hasTVPreferredFocus as a React prop.  After each
  // move we record which {id, kind} should receive focus in the NEXT render.
  // The useEffect below clears it shortly after so subsequent presses can
  // re-trigger the mechanism.
  const [focusTarget, setFocusTarget] = useState<{ id: string; kind: ActionKind } | null>(null);

  useEffect(() => {
    if (!focusTarget) return;
    // Keep hasTVPreferredFocus=true for one render cycle, then clear.
    const t = setTimeout(() => setFocusTarget(null), 400);
    return () => clearTimeout(t);
  }, [focusTarget]);

  // Compute which kind to refocus based on the PREDICTED new position so we
  // don't depend on stale closures or FlatList scroll state.
  const requestFocus = (id: string, kind: ActionKind, newIndex: number, total: number) => {
    const isNewFirst = newIndex === 0;
    const isNewLast  = newIndex === total - 1;
    // If the same button is still enabled at the new position, keep it.
    // Otherwise fall back to the logical neighbour.
    let resolved = kind;
    if ((kind === "up"   || kind === "top")    && isNewFirst) resolved = "down";
    if ((kind === "down" || kind === "bottom") && isNewLast)  resolved = "up";
    setFocusTarget({ id, kind: resolved });
  };

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const padH = Math.max(insets.left + Spacing.sm, Spacing.lg);
  const padT = Math.max(insets.top + Spacing.xs, Spacing.md);
  const padB = Math.max(insets.bottom + Spacing.xs, Spacing.md);

  const title =
    type === "live" ? "Live TV Categories" :
    type === "movies" ? "Movie Categories" :
    "Series Categories";

  const visibleCount = list.filter((c) => !c.hidden).length;

  if (isGuest) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
          <SideMenuButton />
          <BackBtn onPress={() => navigation.goBack()} />
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.headerTitle} numberOfLines={1}>{title}</ThemedText>
          </View>
        </View>
        <View style={[styles.divider, { marginHorizontal: padH }]} />
        <GuestPrompt
          icon="sliders"
          title="Save Your Category Layout"
          message="Create a profile to organise and save your categories."
          onCreateProfile={() => navigation.navigate("ProfilePicker", { fromHome: true })}
        />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: padT, paddingHorizontal: padH }]}>
        <SideMenuButton />
        <BackBtn onPress={() => navigation.goBack()} />
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.headerTitle} numberOfLines={1}>{title}</ThemedText>
          <ThemedText style={styles.headerSub}>
            {visibleCount} of {list.length} showing
          </ThemedText>
        </View>
        <ResetBtn onPress={() => setShowResetConfirm(true)} />
      </View>
      <View style={[styles.divider, { marginHorizontal: padH }]} />

      <FlatList
        data={list}
        keyExtractor={(item) => item.category_id}
        contentContainerStyle={{
          paddingHorizontal: padH,
          paddingBottom: padB,
          gap: Spacing.xs,
        }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => {
          const total = list.length;
          // focusKind is only set for the row that just moved
          const focusKind =
            focusTarget?.id === item.category_id ? focusTarget.kind : null;

          return (
            <CategoryRow
              categoryId={item.category_id}
              index={index}
              total={total}
              name={item.category_name}
              hidden={item.hidden}
              onToggle={() => toggleHidden(type, item.category_id)}
              onUp={() => {
                moveUp(type, item.category_id);
                requestFocus(item.category_id, "up", index - 1, total);
              }}
              onDown={() => {
                moveDown(type, item.category_id);
                requestFocus(item.category_id, "down", index + 1, total);
              }}
              onTop={() => {
                moveToTop(type, item.category_id);
                requestFocus(item.category_id, "top", 0, total);
              }}
              onBottom={() => {
                moveToBottom(type, item.category_id);
                requestFocus(item.category_id, "bottom", total - 1, total);
              }}
              initialFocus={item.category_id === initialFocusIdRef.current}
              focusKind={focusKind}
            />
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="folder" size={36} color={Colors.dark.border} />
            <ThemedText style={styles.emptyText}>No categories to organise</ThemedText>
          </View>
        }
      />

      <Modal visible={showResetConfirm} transparent animationType="fade" onRequestClose={() => setShowResetConfirm(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Feather name="rotate-ccw" size={26} color={Colors.dark.accent} />
            <ThemedText style={styles.modalTitle}>Reset to Default?</ThemedText>
            <ThemedText style={styles.modalBody}>
              All categories will be shown again in the original order.
            </ThemedText>
            <View style={styles.modalRow}>
              <HoverPressable
                style={styles.modalCancel}
                activeStyle={styles.modalCancelActive}
                onPress={() => setShowResetConfirm(false)}
              >
                {() => <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>}
              </HoverPressable>
              <HoverPressable
                style={styles.modalConfirm}
                activeStyle={styles.modalConfirmActive}
                onPress={async () => {
                  await resetType(type);
                  seededRef.current = false;
                  setShowResetConfirm(false);
                }}
              >
                {() => <ThemedText style={styles.modalConfirmText}>Reset</ThemedText>}
              </HoverPressable>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.backgroundRoot },
  header: { flexDirection: "row", alignItems: "center", paddingBottom: Spacing.md, gap: Spacing.md },
  headerTitle: { fontSize: 18, fontWeight: "700", color: Colors.dark.text },
  headerSub: { fontSize: 11, color: Colors.dark.textSecondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: Colors.dark.border, marginBottom: Spacing.sm },
  iconBtn: {
    width: 40, height: 40, borderRadius: BorderRadius.full,
    backgroundColor: Colors.dark.backgroundDefault,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  iconBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },

  resetBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundDefault,
  },
  resetBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  resetText: { fontSize: 11, fontWeight: "700", color: Colors.dark.textSecondary, letterSpacing: 0.4 },

  row: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.dark.border,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
  },
  tickArea: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: Spacing.md,
    paddingVertical: Spacing.xs, paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: "transparent",
  },
  tickAreaActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accentDim,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 5,
    borderWidth: 2, borderColor: Colors.dark.border,
    backgroundColor: "transparent",
    justifyContent: "center", alignItems: "center",
  },
  checkboxOn: {
    borderColor: Colors.dark.accent,
    backgroundColor: Colors.dark.accent,
  },
  checkboxActive: {
    shadowColor: "#FF6600", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 6, elevation: 4,
  },
  rowTextWrap: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: "600", color: Colors.dark.text },
  rowNameActive: { color: Colors.dark.accent },
  rowNameHidden: { color: Colors.dark.textSecondary, textDecorationLine: "line-through" },
  rowMeta: { fontSize: 10, color: Colors.dark.textSecondary, marginTop: 2, letterSpacing: 0.3 },

  actions: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionBtn: {
    width: 36, height: 36, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderWidth: 1, borderColor: Colors.dark.border,
    justifyContent: "center", alignItems: "center",
  },
  actionBtnActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  actionBtnWarnActive: { borderColor: Colors.dark.error, backgroundColor: "rgba(255,59,59,0.1)" },

  empty: { alignItems: "center", gap: Spacing.sm, paddingTop: Spacing["3xl"] },
  emptyText: { color: Colors.dark.textSecondary, fontSize: 13 },

  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center", alignItems: "center",
  },
  modalCard: {
    width: 340, maxWidth: "90%",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.dark.border,
    padding: Spacing.xl, gap: Spacing.md, alignItems: "center",
  },
  modalTitle: { fontSize: 16, fontWeight: "700", color: Colors.dark.text },
  modalBody: { fontSize: 13, color: Colors.dark.textSecondary, textAlign: "center" },
  modalRow: { flexDirection: "row", gap: Spacing.sm, alignSelf: "stretch", marginTop: Spacing.xs },
  modalCancel: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center", justifyContent: "center",
  },
  modalCancelActive: { borderColor: Colors.dark.accent, backgroundColor: Colors.dark.accentDim },
  modalCancelText: { color: Colors.dark.text, fontSize: 13, fontWeight: "600" },
  modalConfirm: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dark.accent,
    alignItems: "center", justifyContent: "center",
  },
  modalConfirmActive: { backgroundColor: "#FF7A1F" },
  modalConfirmText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
