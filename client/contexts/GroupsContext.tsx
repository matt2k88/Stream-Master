import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { getApiUrl } from "@/lib/query-client";

export type GroupType = "live" | "movies" | "series";

export interface UserGroup {
  id: string;
  profile_id: string;
  type: GroupType;
  name: string;
  icon_key: string;
  color: string;
  pinned: boolean;
  created_at: string;
}

export interface UserGroupItem {
  id: string;
  group_id: string;
  stream_id: number;
  stream_name: string;
  stream_icon: string | null;
  category_id: string | null;
  created_at: string;
}

interface CreateGroupParams {
  type: GroupType;
  name: string;
  iconKey: string;
  color: string;
  pinned?: boolean;
}

interface AddItemParams {
  groupId: string;
  streamId: number;
  streamName: string;
  streamIcon?: string | null;
  categoryId?: string | null;
}

interface GroupsContextType {
  groups: UserGroup[];
  items: UserGroupItem[];
  isLoading: boolean;
  getGroupsByType: (type: GroupType) => UserGroup[];
  getItemsByGroup: (groupId: string) => UserGroupItem[];
  /** Is this stream in this specific group? */
  isInGroup: (groupId: string, streamId: number) => boolean;
  createGroup: (params: CreateGroupParams) => Promise<UserGroup | null>;
  updateGroup: (id: string, patch: Partial<Pick<UserGroup, "name" | "icon_key" | "color" | "pinned">>) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  /** Add a stream to a group (idempotent — upserts). */
  addItem: (params: AddItemParams) => Promise<void>;
  /** Remove a stream from a group by stream_id. */
  removeItem: (groupId: string, streamId: number) => Promise<void>;
  /** Toggle: remove if present, add if not. */
  toggleItem: (params: AddItemParams) => Promise<void>;
  refresh: () => Promise<void>;
}

const GroupsContext = createContext<GroupsContextType | undefined>(undefined);

export function GroupsProvider({ children }: { children: ReactNode }) {
  const { activeProfile } = useProfile();
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [items, setItems] = useState<UserGroupItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async (profileId: string) => {
    setIsLoading(true);
    try {
      const gUrl = new URL("/api/groups", getApiUrl());
      gUrl.searchParams.set("profile_id", profileId);
      const iUrl = new URL("/api/group-items", getApiUrl());
      iUrl.searchParams.set("profile_id", profileId);
      const [gRes, iRes] = await Promise.all([fetch(gUrl.toString()), fetch(iUrl.toString())]);
      if (gRes.ok) setGroups(await gRes.json());
      if (iRes.ok) setItems(await iRes.json());
    } catch {
      // silent — non-critical surface
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeProfile?.id) {
      load(activeProfile.id);
    } else {
      setGroups([]);
      setItems([]);
    }
  }, [activeProfile?.id, load]);

  const refresh = useCallback(async () => {
    if (activeProfile?.id) await load(activeProfile.id);
  }, [activeProfile?.id, load]);

  const getGroupsByType = useCallback(
    (type: GroupType) => groups.filter((g) => g.type === type),
    [groups],
  );

  const itemsByGroupMemo = useMemo(() => {
    const map = new Map<string, UserGroupItem[]>();
    for (const it of items) {
      const arr = map.get(it.group_id) ?? [];
      arr.push(it);
      map.set(it.group_id, arr);
    }
    return map;
  }, [items]);

  const getItemsByGroup = useCallback(
    (groupId: string) => itemsByGroupMemo.get(groupId) ?? [],
    [itemsByGroupMemo],
  );

  const isInGroup = useCallback(
    (groupId: string, streamId: number) =>
      items.some((it) => it.group_id === groupId && Number(it.stream_id) === Number(streamId)),
    [items],
  );

  const createGroup = useCallback(
    async ({ type, name, iconKey, color, pinned }: CreateGroupParams): Promise<UserGroup | null> => {
      if (!activeProfile?.id) return null;
      try {
        const url = new URL("/api/groups", getApiUrl());
        const res = await fetch(url.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile_id: activeProfile.id,
            type,
            name,
            icon_key: iconKey,
            color,
            pinned: !!pinned,
          }),
        });
        if (!res.ok) return null;
        const saved: UserGroup = await res.json();
        setGroups((prev) => [...prev, saved]);
        return saved;
      } catch {
        return null;
      }
    },
    [activeProfile?.id],
  );

  const updateGroup = useCallback(
    async (id: string, patch: Partial<Pick<UserGroup, "name" | "icon_key" | "color" | "pinned">>) => {
      // Optimistic
      const prev = groups;
      setGroups((cur) => cur.map((g) => (g.id === id ? { ...g, ...patch } : g)));
      try {
        const url = new URL(`/api/groups/${id}`, getApiUrl());
        const res = await fetch(url.toString(), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) setGroups(prev);
      } catch {
        setGroups(prev);
      }
    },
    [groups],
  );

  const deleteGroup = useCallback(async (id: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== id));
    setItems((prev) => prev.filter((it) => it.group_id !== id));
    try {
      const url = new URL(`/api/groups/${id}`, getApiUrl());
      await fetch(url.toString(), { method: "DELETE" });
    } catch {
      // best-effort
    }
  }, []);

  const addItem = useCallback(
    async ({ groupId, streamId, streamName, streamIcon, categoryId }: AddItemParams) => {
      // Optimistic
      const temp: UserGroupItem = {
        id: `temp-${groupId}-${streamId}`,
        group_id: groupId,
        stream_id: streamId,
        stream_name: streamName,
        stream_icon: streamIcon ?? null,
        category_id: categoryId ?? null,
        created_at: new Date().toISOString(),
      };
      // Replace any existing entry for same (group, stream) to dedupe.
      setItems((prev) => {
        const without = prev.filter(
          (it) => !(it.group_id === groupId && Number(it.stream_id) === Number(streamId)),
        );
        return [...without, temp];
      });
      try {
        const url = new URL(`/api/groups/${groupId}/items`, getApiUrl());
        const res = await fetch(url.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stream_id: streamId,
            stream_name: streamName,
            stream_icon: streamIcon ?? null,
            category_id: categoryId ?? null,
          }),
        });
        if (res.ok) {
          const saved: UserGroupItem = await res.json();
          setItems((prev) => prev.map((it) => (it.id === temp.id ? saved : it)));
        } else {
          setItems((prev) => prev.filter((it) => it.id !== temp.id));
        }
      } catch {
        setItems((prev) => prev.filter((it) => it.id !== temp.id));
      }
    },
    [],
  );

  const removeItem = useCallback(async (groupId: string, streamId: number) => {
    const prev = items;
    setItems((cur) =>
      cur.filter((it) => !(it.group_id === groupId && Number(it.stream_id) === Number(streamId))),
    );
    try {
      const url = new URL(`/api/groups/${groupId}/items/${streamId}`, getApiUrl());
      const res = await fetch(url.toString(), { method: "DELETE" });
      if (!res.ok) setItems(prev);
    } catch {
      setItems(prev);
    }
  }, [items]);

  const toggleItem = useCallback(
    async (params: AddItemParams) => {
      if (isInGroup(params.groupId, params.streamId)) {
        await removeItem(params.groupId, params.streamId);
      } else {
        await addItem(params);
      }
    },
    [isInGroup, addItem, removeItem],
  );

  const value = useMemo<GroupsContextType>(
    () => ({
      groups,
      items,
      isLoading,
      getGroupsByType,
      getItemsByGroup,
      isInGroup,
      createGroup,
      updateGroup,
      deleteGroup,
      addItem,
      removeItem,
      toggleItem,
      refresh,
    }),
    [
      groups, items, isLoading, getGroupsByType, getItemsByGroup, isInGroup,
      createGroup, updateGroup, deleteGroup, addItem, removeItem, toggleItem, refresh,
    ],
  );

  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
}

export function useGroups() {
  const ctx = useContext(GroupsContext);
  if (!ctx) throw new Error("useGroups must be used within GroupsProvider");
  return ctx;
}
