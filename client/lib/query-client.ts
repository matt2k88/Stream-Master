import { QueryClient, QueryFunction } from "@tanstack/react-query";
import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Gets the base URL for the Express API server.
 * Priority:
 *  1. app.json extra.apiUrl  — hardcoded production URL (works in standalone APK builds)
 *  2. EXPO_PUBLIC_DOMAIN env var — injected by npm run expo:dev (Replit dev)
 *  3. Web: window.location.origin — same-domain production web deployment
 *  4. Native: various Expo manifest hostUri paths — set by build.js for Expo Go
 */
export function getApiUrl(): string {
  // 1. Hardcoded production URL from app.json extra (always available in APK builds)
  const extraApiUrl = (Constants.expoConfig as any)?.extra?.apiUrl as string | undefined;
  if (extraApiUrl) {
    return extraApiUrl.endsWith("/") ? extraApiUrl.slice(0, -1) : extraApiUrl;
  }

  // 2. Dev env var (injected by npm run expo:dev)
  // On Replit, port 5000 (Express) is not reachable from devices at :5000
  // because Replit only proxies TLS on the standard port (80→8081 Metro).
  // API calls are proxied through Metro via metro.config.js enhanceMiddleware,
  // so we strip any explicit port and use the standard HTTPS port.
  const envDomain = process.env.EXPO_PUBLIC_DOMAIN;
  if (envDomain) {
    const isReplitProxy =
      envDomain.includes(".riker.replit.dev") ||
      envDomain.includes(".replit.dev");
    const cleanDomain = isReplitProxy ? envDomain.split(":")[0] : envDomain;
    return new URL(`https://${cleanDomain}`).href.replace(/\/$/, "");
  }

  // 3. Web browser — API is served from the same origin
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  // 4. Native: try every known path where Expo puts hostUri
  const candidates: unknown[] = [
    (Constants.expoConfig as any)?.hostUri,
    (Constants.expoConfig as any)?.extra?.expoClient?.hostUri,
    (Constants as any).manifest2?.extra?.expoClient?.hostUri,
    (Constants as any).manifest?.hostUri,
    (Constants as any).expoGoConfig?.debuggerHost,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "string") {
      const domain = candidate.split("/")[0];
      if (domain) {
        return new URL(`https://${domain}`).href.replace(/\/$/, "");
      }
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
