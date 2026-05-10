import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { computeExpiryStatus, ExpiryStatus } from "@/lib/expiry";

const lifetimeCache = new Map<string, boolean>();
const inFlight = new Map<string, Promise<boolean>>();

// Returns null if the lifetime check failed/was unreachable. Callers must
// treat null as "unknown" — never show expiry warnings while we can't
// definitively confirm a user is NOT on lifetime, otherwise true-lifetime
// users would briefly see warnings whenever the lookup endpoint is flaky.
async function checkLifetime(username: string): Promise<boolean | null> {
  if (lifetimeCache.has(username)) return lifetimeCache.get(username)!;
  const existing = inFlight.get(username);
  if (existing) return existing;

  const promise = (async (): Promise<boolean | null> => {
    try {
      const url = new URL("/api/lifetime-check", getApiUrl());
      url.searchParams.set("username", username);
      const res = await fetch(url.toString());
      if (!res.ok) return null;
      const data = await res.json();
      const isLifetime = !!data?.isLifetime;
      lifetimeCache.set(username, isLifetime);
      return isLifetime;
    } catch {
      return null;
    } finally {
      inFlight.delete(username);
    }
  })();

  inFlight.set(username, promise);
  return promise;
}

export interface UseExpiryStatusResult extends ExpiryStatus {
  // `loading` stays true until the lifetime check has definitively
  // resolved (success OR confirmed cache hit). A failed/unreachable
  // lookup also leaves `loading` true so callers won't misclassify a
  // lifetime user as "expiring soon" — a stricter, safer default than
  // assuming false on error.
  loading: boolean;
}

export function useExpiryStatus(): UseExpiryStatusResult {
  const { userInfo } = useAuth();
  const username = userInfo?.user_info?.username ?? "";
  const expDate = userInfo?.user_info?.exp_date ?? null;

  const [isLifetime, setIsLifetime] = useState<boolean>(
    () => (username ? lifetimeCache.get(username) ?? false : false),
  );
  const [loading, setLoading] = useState<boolean>(
    () => !!username && !lifetimeCache.has(username),
  );

  useEffect(() => {
    let cancelled = false;
    if (!username) {
      setIsLifetime(false);
      setLoading(false);
      return;
    }
    if (lifetimeCache.has(username)) {
      setIsLifetime(lifetimeCache.get(username)!);
      setLoading(false);
      return;
    }
    setLoading(true);
    checkLifetime(username).then((v) => {
      if (cancelled) return;
      if (v === null) {
        // Lookup failed — keep loading=true so warnings stay suppressed
        // until we can confirm the user's lifetime status.
        setIsLifetime(false);
        setLoading(true);
      } else {
        setIsLifetime(v);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [username]);

  const status = computeExpiryStatus(expDate, isLifetime);
  return { ...status, loading };
}
