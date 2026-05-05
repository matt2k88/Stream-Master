import { QueryClient, QueryFunction } from "@tanstack/react-query";
import Constants from "expo-constants";

/**
 * Gets the base URL for the Express API server.
 * Priority:
 *  1. EXPO_PUBLIC_DOMAIN env var (dev server injects this)
 *  2. Expo manifest hostUri (production/static builds — set by build.js)
 */
export function getApiUrl(): string {
  const envDomain = process.env.EXPO_PUBLIC_DOMAIN;
  if (envDomain) {
    return new URL(`https://${envDomain}`).href;
  }

  // Fallback: extract host from Expo's manifest hostUri.
  // build.js sets hostUri = "<deployedDomain>/<platform>", so split on "/" to get the domain.
  const hostUri =
    (Constants.expoConfig as any)?.hostUri ??
    (Constants as any).manifest?.hostUri ??
    (Constants as any).manifest2?.extra?.expoClient?.hostUri;

  if (hostUri) {
    const domain = String(hostUri).split("/")[0];
    if (domain) {
      return new URL(`https://${domain}`).href;
    }
  }

  throw new Error("EXPO_PUBLIC_DOMAIN is not set and no Expo manifest hostUri found");
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
