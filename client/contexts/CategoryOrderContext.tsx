import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Category } from "@/lib/xtream-api";
import { useProfile } from "@/contexts/ProfileContext";

export type CategoryType = "live" | "movies" | "series";

interface TypePrefs {
  order: string[];
  hidden: string[];
}

type AllPrefs = Record<CategoryType, TypePrefs>;

const EMPTY: AllPrefs = {
  live: { order: [], hidden: [] },
  movies: { order: [], hidden: [] },
  series: { order: [], hidden: [] },
};

interface OrganiseEntry extends Category {
  hidden: boolean;
}

interface CategoryOrderContextType {
  prefs: AllPrefs;
  // For grids/sidebars — visible categories in user order.
  applyOrder: (type: CategoryType, cats: Category[]) => Category[];
  // For the Organise screen — ALL categories in user order, with hidden flag.
  buildOrganiseList: (type: CategoryType, cats: Category[]) => OrganiseEntry[];
  toggleHidden: (type: CategoryType, categoryId: string) => Promise<void>;
  moveUp: (type: CategoryType, categoryId: string) => Promise<void>;
  moveDown: (type: CategoryType, categoryId: string) => Promise<void>;
  moveToTop: (type: CategoryType, categoryId: string) => Promise<void>;
  moveToBottom: (type: CategoryType, categoryId: string) => Promise<void>;
  resetType: (type: CategoryType) => Promise<void>;
}

const CategoryOrderContext = createContext<CategoryOrderContextType | undefined>(undefined);

const storageKey = (profileId: string) => `category_prefs_${profileId}`;

function mergeOrder(orderIds: string[], cats: Category[]): Category[] {
  const map = new Map(cats.map((c) => [c.category_id, c]));
  const out: Category[] = [];
  const seen = new Set<string>();
  for (const id of orderIds) {
    const c = map.get(id);
    if (c) {
      out.push(c);
      seen.add(id);
    }
  }
  for (const c of cats) {
    if (!seen.has(c.category_id)) out.push(c);
  }
  return out;
}

export function CategoryOrderProvider({ children }: { children: ReactNode }) {
  const { activeProfile } = useProfile();
  const [prefs, setPrefs] = useState<AllPrefs>(EMPTY);
  // Track which profile `prefs` actually corresponds to. While loading or
  // when profile is null, we ignore writes to prevent stale-prefs from
  // being persisted under a different profile key.
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(null);

  // Load from storage when profile changes. We immediately blank prefs and
  // mark unloaded so screens never see the previous profile's data.
  useEffect(() => {
    let cancelled = false;
    setPrefs(EMPTY);
    setLoadedProfileId(null);
    const pid = activeProfile?.id ?? null;
    if (!pid) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey(pid));
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw);
          setPrefs({
            live: { order: parsed?.live?.order ?? [], hidden: parsed?.live?.hidden ?? [] },
            movies: { order: parsed?.movies?.order ?? [], hidden: parsed?.movies?.hidden ?? [] },
            series: { order: parsed?.series?.order ?? [], hidden: parsed?.series?.hidden ?? [] },
          });
        } else {
          setPrefs(EMPTY);
        }
      } catch {
        if (!cancelled) setPrefs(EMPTY);
      } finally {
        if (!cancelled) setLoadedProfileId(pid);
      }
    })();
    return () => { cancelled = true; };
  }, [activeProfile?.id]);

  // All writes go through this; uses functional setState so rapid consecutive
  // calls don't drop updates from a stale closure.
  const updateType = useCallback(
    (type: CategoryType, fn: (p: TypePrefs) => TypePrefs) => {
      const pid = activeProfile?.id ?? null;
      // Refuse writes if profile not yet loaded — would corrupt persistence.
      if (!pid || pid !== loadedProfileId) return Promise.resolve();
      return new Promise<void>((resolve) => {
        setPrefs((prev) => {
          const next = { ...prev, [type]: fn(prev[type]) };
          AsyncStorage.setItem(storageKey(pid), JSON.stringify(next))
            .catch(() => {})
            .finally(() => resolve());
          return next;
        });
      });
    },
    [activeProfile?.id, loadedProfileId],
  );

  const applyOrder = useCallback(
    (type: CategoryType, cats: Category[]): Category[] => {
      const p = prefs[type];
      const ordered = mergeOrder(p.order, cats);
      const hidden = new Set(p.hidden);
      return ordered.filter((c) => !hidden.has(c.category_id));
    },
    [prefs],
  );

  const buildOrganiseList = useCallback(
    (type: CategoryType, cats: Category[]): OrganiseEntry[] => {
      const p = prefs[type];
      const ordered = mergeOrder(p.order, cats);
      const hidden = new Set(p.hidden);
      return ordered.map((c) => ({ ...c, hidden: hidden.has(c.category_id) }));
    },
    [prefs],
  );

  const toggleHidden = useCallback(
    (type: CategoryType, id: string) =>
      updateType(type, (p) => {
        const set = new Set(p.hidden);
        if (set.has(id)) set.delete(id);
        else set.add(id);
        return { ...p, hidden: Array.from(set) };
      }),
    [updateType],
  );

  const reorder = useCallback(
    (type: CategoryType, id: string, action: "up" | "down" | "top" | "bottom") =>
      updateType(type, (p) => {
        // We need the current effective order. The screen calls movement
        // functions through `useCategoryOrder` after rendering an organise
        // list, so the canonical source of truth is `p.order` if present,
        // otherwise the caller should have already touched it. To keep this
        // robust we operate on whatever ids we know about — including `id`.
        let arr = p.order.slice();
        if (!arr.includes(id)) {
          // Append unknowns so the move still has effect.
          arr.push(id);
        }
        const idx = arr.indexOf(id);
        if (idx < 0) return p;
        arr.splice(idx, 1);
        if (action === "up") arr.splice(Math.max(0, idx - 1), 0, id);
        else if (action === "down") arr.splice(Math.min(arr.length, idx + 1), 0, id);
        else if (action === "top") arr.unshift(id);
        else arr.push(id);
        return { ...p, order: arr };
      }),
    [updateType],
  );

  // Public movement wrappers — these need the full current displayed order
  // to behave correctly even before the user has done their first reorder.
  // The Organise screen calls `commitDisplayOrder` once on mount to seed
  // `prefs[type].order` with the currently-displayed list (api order +
  // any prior overrides), so subsequent moves are predictable.
  const commitDisplayOrder = useCallback(
    (type: CategoryType, ids: string[]) =>
      updateType(type, (p) => ({ ...p, order: ids })),
    [updateType],
  );

  const moveUp = useCallback((t: CategoryType, id: string) => reorder(t, id, "up"), [reorder]);
  const moveDown = useCallback((t: CategoryType, id: string) => reorder(t, id, "down"), [reorder]);
  const moveToTop = useCallback((t: CategoryType, id: string) => reorder(t, id, "top"), [reorder]);
  const moveToBottom = useCallback((t: CategoryType, id: string) => reorder(t, id, "bottom"), [reorder]);

  const resetType = useCallback(
    (type: CategoryType) =>
      updateType(type, () => ({ order: [], hidden: [] })),
    [updateType],
  );

  const value = useMemo<CategoryOrderContextType & { commitDisplayOrder: typeof commitDisplayOrder }>(
    () => ({
      prefs,
      applyOrder,
      buildOrganiseList,
      toggleHidden,
      moveUp,
      moveDown,
      moveToTop,
      moveToBottom,
      resetType,
      commitDisplayOrder,
    }),
    [prefs, applyOrder, buildOrganiseList, toggleHidden, moveUp, moveDown, moveToTop, moveToBottom, resetType, commitDisplayOrder],
  );

  return (
    <CategoryOrderContext.Provider value={value}>
      {children}
    </CategoryOrderContext.Provider>
  );
}

export function useCategoryOrder() {
  const ctx = useContext(CategoryOrderContext);
  if (!ctx) throw new Error("useCategoryOrder must be used within CategoryOrderProvider");
  return ctx as CategoryOrderContextType & {
    commitDisplayOrder: (type: CategoryType, ids: string[]) => Promise<void>;
  };
}
