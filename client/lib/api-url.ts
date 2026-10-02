import Constants from "expo-constants";
import { Platform } from "react-native";

export function getApiUrl(): string {
  if (__DEV__ && Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  const configured = Constants.expoConfig?.extra?.apiUrl;
  if (typeof configured === "string" && configured) return configured.replace(/\/$/, "");
  const envDomain = process.env.EXPO_PUBLIC_DOMAIN;
  if (envDomain) {
    const domain = envDomain.includes(".replit.dev") ? envDomain.split(":")[0] : envDomain;
    return new URL(`https://${domain}`).href.replace(/\/$/, "");
  }
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  const candidates = [
    Constants.expoConfig?.hostUri,
    Constants.expoConfig?.extra?.expoClient?.hostUri,
    (Constants as any).manifest2?.extra?.expoClient?.hostUri,
    (Constants as any).manifest?.hostUri,
    (Constants as any).expoGoConfig?.debuggerHost,
  ];
  for (const host of candidates) {
    if (typeof host === "string" && host) return new URL(`https://${host.split("/")[0]}`).href.replace(/\/$/, "");
  }
  throw new Error("No API server is configured");
}