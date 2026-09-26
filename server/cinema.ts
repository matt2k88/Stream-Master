import type { Express } from "express";
import { supabase } from "./supabase";

const validText = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

export function registerCinemaRoutes(app: Express) {
  app.post("/api/cinema-releases", async (req, res) => {
    const { serverUrl, username, password } = req.body ?? {};
    if (!validText(serverUrl, 500) || !validText(username, 200) || !validText(password, 500)) {
      return res.status(400).json({ error: "Valid account credentials are required" });
    }
    try {
      const supplied = new URL(serverUrl);
      if (!["http:", "https:"].includes(supplied.protocol) || supplied.username || supplied.password ||
          supplied.search || supplied.hash) {
        return res.status(400).json({ error: "Invalid provider URL" });
      }
      const { data: servers, error: serverError } = await supabase.from("server").select("url");
      if (serverError) throw serverError;
      const allowed = (servers ?? []).some((row) => {
        try {
          const url = new URL(row.url.startsWith("http") ? row.url : `http://${row.url}`);
          return url.origin === supplied.origin && url.pathname.replace(/\/+$/, "") === supplied.pathname.replace(/\/+$/, "");
        } catch { return false; }
      });
      if (!allowed) return res.status(403).json({ error: "Provider not allowed" });

      const authUrl = new URL(`${supplied.pathname.replace(/\/+$/, "")}/player_api.php`, supplied);
      authUrl.searchParams.set("username", username);
      authUrl.searchParams.set("password", password);
      const authResponse = await fetch(authUrl, { signal: AbortSignal.timeout(12000), redirect: "manual" });
      if (!authResponse.ok) return res.status(401).json({ error: "Account verification failed" });
      const account = await authResponse.json();
      if (Number(account?.user_info?.auth) !== 1 ||
          account.user_info.username !== username ||
          !["active", "Active"].includes(account.user_info.status)) {
        return res.status(401).json({ error: "Account verification failed" });
      }

      const { data: access, error: accessError } = await supabase
        .from("vodaccounts").select("id").eq("account_name", username).limit(1);
      if (accessError) throw accessError;
      if (!access?.length) return res.status(403).json({ error: "Cinema Releases not available for this account" });

      const uploads: Array<{ id: string; title: string; cover_url: string; vod_link: string; created_at: string }> = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from("voduploads").select("id, title, cover_url, vod_link, created_at")
          .order("created_at", { ascending: false }).order("id")
          .range(offset, offset + 999);
        if (error) throw error;
        uploads.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      res.setHeader("Cache-Control", "no-store");
      res.json(uploads.filter((item) =>
        typeof item.title === "string" &&
        typeof item.cover_url === "string" &&
        typeof item.vod_link === "string" &&
        /^https?:\/\//i.test(item.vod_link),
      ));
    } catch (error) {
      // Do not log provider URLs: they contain the supplied IPTV credentials.
      console.error("[cinema] catalogue unavailable");
      res.status(502).json({ error: "Unable to load Cinema Releases" });
    }
  });
}