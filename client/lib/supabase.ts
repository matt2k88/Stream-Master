import { getApiUrl } from "@/lib/query-client";

export interface IptvServer {
  id: string;
  name: string;
  url: string;
  logo_url?: string;
}

export async function fetchServers(): Promise<IptvServer[]> {
  const baseUrl = getApiUrl();
  const url = new URL("/api/servers", baseUrl).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load servers");
  return res.json();
}
