import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { Category } from "@/lib/xtream-api";
import { useProfile } from "@/contexts/ProfileContext";
import { getApiUrl } from "@/lib/query-client";

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
  applyOrder: (type: CategoryType, cats: Category[]) => Category[];
  buildOrganiseList: (type: CategoryType, cats: Category[]) => OrganiseEntry[];
  toggleHidden: (type: CategoryType, categoryId: string) => Promise<void>;
  moveUp: (type: CategoryType, categoryId: string) => Promise<void>;
  moveDown: (type: CategoryType, categoryId: string) => Promise<void>;
  moveToTop: (type: CategoryType, categoryId: string) => Promise<void>;
  moveToBottom: (type: CategoryType, categoryId: string) => Promise<void>;
  resetType: (type: CategoryType) => Promise<void>;
  commitDisplayOrder: (type: CategoryType, ids: string[]) => Promise<void>;
}

const CategoryOrderContext = createContext<CategoryOrderContextType | undefined>(undefined);

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
  // Track which profile `prefs` actually corresponds to. Writes are blocked
  // until load completes so we never persist stale prefs under the wrong
  // profile id.
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(null);

  // Per-(profile,type) save queue: collapses rapid clicks into a single
  // trailing PUT so order on the server matches the user's final intent
  // even under high-frequency moves.
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const saveSeq = useRef<Record<string, number>>({});
  const SAVE_DEBOUNCE_MS = 250;

  const scheduleSave = useCallback(
    (pid: string, type: CategoryType, p: TypePrefs) => {
      const key = `${pid}:${type}`;
      const existing = saveTimers.current[key];
      if (existing) clearTimeout(existing);
      const seq = (saveSeq.current[key] ?? 0) + 1;
      saveSeq.current[key] = seq;
      saveTimers.current[key] = setTimeout(async () => {
        try {
          const url = new URL("/api/category-prefs", getApiUrl());
          await fetch(url.toString(), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              profile_id: pid,
              type,
              order_ids: p.order,
              hidden_ids: p.hidden,
            }),
          });
        } catch {
          // best-effort — local state is the source of truth in-session.
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [],
  );

  // Load from API when profile changes. Immediately blank prefs so screens
  // never see another profile's data.
  useEffect(() => {
    let cancelled = false;
    setPrefs(EMPTY);
    setLoadedProfileId(null);
    const pid = activeProfile?.id ?? null;
    if (!pid) return;
    (async () => {
      try {
        const url = new URL("/api/category-prefs", getApiUrl());
        url.searchParams.set("profile_id", pid);
        const res = await fetch(url.toString());
        if (cancelled) return;
        if (res.ok) {
          const rows: { type: CategoryType; order_ids: string[]; hidden_ids: string[] }[] =
            await res.json();
          const next: AllPrefs = {
            live: { order: [], hidden: [] },
            movies: { order: [], hidden: [] },
            series: { order: [], hidden: [] },
          };
          for (const row of rows) {
            if (row && (row.type === "live" || row.type === "movies" || row.type === "series")) {
              next[row.type] = {
                order: Array.isArray(row.order_ids) ? row.order_ids : [],
                hidden: Array.isArray(row.hidden_ids) ? row.hidden_ids : [],
              };
            }
          }
          if (!cancelled) setPrefs(next);
        }
      } catch {
        // silent — leave prefs empty (default behaviour).
      } finally {
        if (!cancelled) setLoadedProfileId(pid);
      }
    })();
    return () => { cancelled = true; };
  }, [activeProfile?.id]);

  // All writes go through this. Functional setState avoids stale-closure
  // issues from rapid consecutive taps. We also schedule a debounced PUT
  // with the resulting state so the server always lands on the latest value.
  const updateType = useCallback(
    (type: CategoryType, fn: (p: TypePrefs) => TypePrefs) => {
      const pid = activeProfile?.id ?? null;
      if (!pid || pid !== loadedProfileId) return Promise.resolve();
      return new Promise<void>((resolve) => {
        setPrefs((prev) => {
          const nextType = fn(prev[type]);
          const next = { ...prev, [type]: nextType };
          scheduleSave(pid, type, nextType);
          resolve();
          return next;
        });
      });
    },
    [activeProfile?.id, loadedProfileId, scheduleSave],
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
        let arr = p.order.slice();
        if (!arr.includes(id)) arr.push(id);
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

  // Flush any pending debounced saves on unmount.
  useEffect(() => {
    return () => {
      Object.values(saveTimers.current).forEach((t) => t && clearTimeout(t));
    };
  }, []);

  const value = useMemo<CategoryOrderContextType>(
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
  return ctx;
}
