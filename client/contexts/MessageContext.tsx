import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";

export interface Message {
  id: string;
  username: string;
  message: string;
  expires_at: string | null;
  created_at: string;
}

interface MessageContextType {
  userMessages: Message[];
  allMessages: Message[];
  seenIds: Set<string>;
  pendingMessage: Message | null;
  unreadCount: number;
  isOnDashboard: boolean;
  setOnDashboard: (v: boolean) => void;
  dismissCurrent: () => Promise<void>;
  refresh: () => Promise<void>;
}

const MessageContext = createContext<MessageContextType | undefined>(undefined);

export function MessageProvider({ children }: { children: ReactNode }) {
  const { userInfo } = useAuth();
  const username = userInfo?.user_info?.username ?? null;

  const [userMessages, setUserMessages] = useState<Message[]>([]);
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [isOnDashboard, setOnDashboard] = useState(false);
  const isFetchingRef = useRef(false);

  const fetchAll = useCallback(async (uname: string) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const base = getApiUrl();
      const [userRes, allRes, seenRes] = await Promise.all([
        fetch(new URL(`/api/messages?username=${encodeURIComponent(uname)}`, base).toString()),
        fetch(new URL("/api/messages", base).toString()),
        fetch(new URL(`/api/message-seen?username=${encodeURIComponent(uname)}`, base).toString()),
      ]);
      const [userMsgs, allMsgs, seenList] = await Promise.all([
        userRes.ok ? userRes.json() : [],
        allRes.ok ? allRes.json() : [],
        seenRes.ok ? seenRes.json() : [],
      ]);
      setUserMessages(userMsgs);
      setAllMessages(allMsgs);
      setSeenIds(new Set(seenList));
    } catch {
      // silently fail
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (username) await fetchAll(username);
  }, [username, fetchAll]);

  useEffect(() => {
    if (username) {
      fetchAll(username);
      const interval = setInterval(() => fetchAll(username), 60_000);
      return () => clearInterval(interval);
    } else {
      setUserMessages([]);
      setAllMessages([]);
      setSeenIds(new Set());
      setOnDashboard(false);
    }
  }, [username, fetchAll]);

  const pendingMessages = userMessages.filter((m) => !seenIds.has(m.id));
  const pendingMessage = pendingMessages[0] ?? null;
  const unreadCount = pendingMessages.length;

  const dismissCurrent = useCallback(async () => {
    if (!pendingMessage || !username) return;
    try {
      const base = getApiUrl();
      await fetch(new URL("/api/message-seen", base).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_id: pendingMessage.id, username }),
      });
      setSeenIds((prev) => new Set([...prev, pendingMessage.id]));
    } catch {
      setSeenIds((prev) => new Set([...prev, pendingMessage.id]));
    }
  }, [pendingMessage, username]);

  return (
    <MessageContext.Provider
      value={{
        userMessages, allMessages, seenIds,
        pendingMessage, unreadCount,
        isOnDashboard, setOnDashboard,
        dismissCurrent, refresh,
      }}
    >
      {children}
    </MessageContext.Provider>
  );
}

export function useMessages() {
  const ctx = useContext(MessageContext);
  if (!ctx) throw new Error("useMessages must be used within MessageProvider");
  return ctx;
}
