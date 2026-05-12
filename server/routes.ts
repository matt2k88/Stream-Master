import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { supabase, lifetimeDb } from "./supabase";

export async function registerRoutes(app: Express): Promise<Server> {
  // ── Servers ──────────────────────────────────────────────────────────────
  app.get("/api/servers", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("server")
        .select("id, name, url")
        .order("name");
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch {
      res.status(500).json({ error: "Failed to fetch servers" });
    }
  });

  // ── Profiles ──────────────────────────────────────────────────────────────
  app.get("/api/profiles", async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: "username required" });
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("account_username", username)
        .order("created_at");
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch {
      res.status(500).json({ error: "Failed to fetch profiles" });
    }
  });

  app.post("/api/profiles", async (req, res) => {
    const { account_username, name, avatar_icon, avatar_color, pin } = req.body;
    if (!account_username || !name) {
      return res.status(400).json({ error: "account_username and name required" });
    }
    try {
      // Enforce 10 profile limit
      const { count } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("account_username", account_username);
      if ((count ?? 0) >= 10) {
        return res.status(400).json({ error: "Maximum 10 profiles per account" });
      }
      const { data, error } = await supabase
        .from("profiles")
        .insert({ account_username, name, avatar_icon: avatar_icon ?? "user", avatar_color: avatar_color ?? "#FF6600", pin: pin ?? null })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch {
      res.status(500).json({ error: "Failed to create profile" });
    }
  });

  app.put("/api/profiles/:id", async (req, res) => {
    const { id } = req.params;
    const { name, avatar_icon, avatar_color, pin, player_vod, player_live } = req.body;
    try {
      // Build a partial update so callers (e.g. PlayerSettingsScreen)
      // can patch only the fields they care about.
      const patch: Record<string, any> = {};
      if (name !== undefined) patch.name = name;
      if (avatar_icon !== undefined) patch.avatar_icon = avatar_icon;
      if (avatar_color !== undefined) patch.avatar_color = avatar_color;
      if (pin !== undefined) patch.pin = pin ?? null;
      if (player_vod !== undefined) {
        if (player_vod !== "vlc" && player_vod !== "expo") {
          return res.status(400).json({ error: "player_vod must be 'vlc' or 'expo'" });
        }
        patch.player_vod = player_vod;
      }
      if (player_live !== undefined) {
        if (player_live !== "vlc" && player_live !== "expo") {
          return res.status(400).json({ error: "player_live must be 'vlc' or 'expo'" });
        }
        patch.player_live = player_live;
      }
      const { data, error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch {
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  app.delete("/api/profiles/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const { error } = await supabase.from("profiles").delete().eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete profile" });
    }
  });

  // ── Favourites ────────────────────────────────────────────────────────────
  app.get("/api/favourites", async (req, res) => {
    const { profile_id } = req.query;
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    try {
      const { data, error } = await supabase
        .from("favourites")
        .select("*")
        .eq("profile_id", profile_id)
        .order("created_at");
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch {
      res.status(500).json({ error: "Failed to fetch favourites" });
    }
  });

  app.post("/api/favourites", async (req, res) => {
    const { profile_id, stream_id, stream_type, stream_name, stream_icon, category_id } = req.body;
    if (!profile_id || stream_id === undefined || !stream_type) {
      return res.status(400).json({ error: "profile_id, stream_id, stream_type required" });
    }
    try {
      const { data, error } = await supabase
        .from("favourites")
        .insert({ profile_id, stream_id, stream_type, stream_name, stream_icon: stream_icon ?? null, category_id: category_id ?? null })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch {
      res.status(500).json({ error: "Failed to add favourite" });
    }
  });

  app.delete("/api/favourites/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const { error } = await supabase.from("favourites").delete().eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to remove favourite" });
    }
  });

  app.delete("/api/favourites", async (req, res) => {
    const { profile_id, stream_type } = req.query;
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    try {
      let q = supabase.from("favourites").delete().eq("profile_id", profile_id as string);
      if (stream_type) q = q.eq("stream_type", stream_type as string);
      const { error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to clear favourites" });
    }
  });

  // ── Category Prefs (per-profile organise) ─────────────────────────────────
  app.get("/api/category-prefs", async (req, res) => {
    const { profile_id } = req.query;
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    try {
      const { data, error } = await supabase
        .from("category_prefs")
        .select("type, order_ids, hidden_ids")
        .eq("profile_id", profile_id);
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch {
      res.status(500).json({ error: "Failed to fetch category prefs" });
    }
  });

  app.put("/api/category-prefs", async (req, res) => {
    const { profile_id, type, order_ids, hidden_ids } = req.body;
    if (!profile_id || !type) {
      return res.status(400).json({ error: "profile_id and type required" });
    }
    if (!["live", "movies", "series"].includes(type)) {
      return res.status(400).json({ error: "invalid type" });
    }
    try {
      const { data, error } = await supabase
        .from("category_prefs")
        .upsert(
          {
            profile_id,
            type,
            order_ids: Array.isArray(order_ids) ? order_ids : [],
            hidden_ids: Array.isArray(hidden_ids) ? hidden_ids : [],
            updated_at: new Date().toISOString(),
          },
          { onConflict: "profile_id,type" },
        )
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch {
      res.status(500).json({ error: "Failed to save category prefs" });
    }
  });

  // ── Announcements ─────────────────────────────────────────────────────────
  app.get("/api/announcements", async (req, res) => {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("announcements")
        .select("id, message")
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order("created_at");
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch {
      res.status(500).json({ error: "Failed to fetch announcements" });
    }
  });

  // ── Adverts ───────────────────────────────────────────────────────────────
  app.get("/api/adverts", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("adverts")
        .select("id, name, image_url, created_at")
        .order("created_at");
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch {
      res.status(500).json({ error: "Failed to fetch adverts" });
    }
  });

  // ── Messages ──────────────────────────────────────────────────────────────
  app.get("/api/messages", async (req, res) => {
    const { username } = req.query;
    try {
      let q = supabase.from("messages").select("*").order("created_at", { ascending: false });
      if (username) q = q.eq("username", username as string);
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.get("/api/message-seen", async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: "username required" });
    try {
      const { data, error } = await supabase
        .from("message_seen")
        .select("message_id")
        .eq("username", username as string);
      if (error) return res.status(500).json({ error: error.message });
      res.json((data ?? []).map((r: any) => r.message_id));
    } catch {
      res.status(500).json({ error: "Failed to fetch seen messages" });
    }
  });

  app.post("/api/message-seen", async (req, res) => {
    const { message_id, username } = req.body;
    if (!message_id || !username) return res.status(400).json({ error: "message_id and username required" });
    try {
      // Upsert to avoid duplicates
      const { data, error } = await supabase
        .from("message_seen")
        .upsert({ message_id, username }, { onConflict: "message_id,username", ignoreDuplicates: true })
        .select()
        .single();
      if (error && error.code !== "23505") return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to mark message as seen" });
    }
  });

  // ── Intros ────────────────────────────────────────────────────────────────
  app.get("/api/intros", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("intros")
        .select("id, name, video_url")
        .order("created_at")
        .limit(1)
        .single();
      if (error && error.code !== "PGRST116") return res.status(500).json({ error: error.message });
      res.json(data ?? null);
    } catch {
      res.status(500).json({ error: "Failed to fetch intro" });
    }
  });

  // ── App Version (latest release — used by "Check for Updates") ────────────
  app.get("/api/app-version", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("app_versions")
        .select("id, version, released_at, created_at, downloader_code")
        .order("released_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && error.code !== "PGRST116") return res.status(500).json({ error: error.message });
      // Keep response shape backwards-compatible with the existing client
      // (which reads `version`, `downloader_code`, and `updated_at`).
      const payload = data
        ? {
            id: data.id,
            version: data.version,
            downloader_code: data.downloader_code,
            updated_at: data.released_at ?? data.created_at,
          }
        : null;
      res.json(payload);
    } catch {
      res.status(500).json({ error: "Failed to fetch app version" });
    }
  });

  // ── App Versions (full list — used by "What's New" modal) ─────────────────
  app.get("/api/app-versions", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("app_versions")
        .select("id, version, released_at, created_at, downloader_code")
        .order("released_at", { ascending: false });
      if (error && error.code !== "PGRST116") return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch {
      res.status(500).json({ error: "Failed to fetch app versions" });
    }
  });

  // ── App Theme (admin-controlled, applies to all clients on next launch) ──
  app.get("/api/app-theme", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("app_theme")
        .select("id, theme_key, updated_at")
        .eq("id", 1)
        .maybeSingle();
      // Gracefully fall back to default when table is missing (migration
      // 004 not yet applied) or no row exists, so clients always get a
      // valid theme instead of an error.
      if (error && error.code !== "PGRST116") {
        return res.json({ id: 1, theme_key: "default", updated_at: null });
      }
      res.json(data ?? { id: 1, theme_key: "default", updated_at: null });
    } catch {
      res.json({ id: 1, theme_key: "default", updated_at: null });
    }
  });

  // ── App Notes (changelog / known issues) ──────────────────────────────────
  app.get("/api/app-notes", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("app_notes")
        .select("id, type, text, sort_order, created_at, version_id")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error && error.code !== "PGRST116") return res.status(500).json({ error: error.message });
      res.json(data ?? []);
    } catch {
      res.status(500).json({ error: "Failed to fetch app notes" });
    }
  });

  // ── Recently Watched ──────────────────────────────────────────────────────
  app.get("/api/recently-watched", async (req, res) => {
    const { profile_id, limit } = req.query;
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    try {
      let q = supabase
        .from("recently_watched")
        .select("*")
        .eq("profile_id", profile_id as string)
        .order("updated_at", { ascending: false });
      const lim = limit ? Math.max(1, Math.min(2000, Number(limit))) : null;
      if (lim) q = q.limit(lim);
      const { data, error } = await q;
      if (error && error.code !== "PGRST116" && !error.message?.includes("does not exist") && !error.message?.includes("Could not find")) {
        return res.status(500).json({ error: error.message });
      }
      // Safety dedup by stream_id (latest wins, preserve order)
      const seen = new Set<string>();
      const out: any[] = [];
      for (const row of data ?? []) {
        const key = row.stream_id != null ? String(row.stream_id) : `__noid_${row.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
      }
      res.json(out);
    } catch {
      res.json([]);
    }
  });

  // Single resume entry by stream
  app.get("/api/recently-watched/by-stream", async (req, res) => {
    const { profile_id, stream_id } = req.query;
    if (!profile_id || !stream_id) return res.status(400).json({ error: "profile_id and stream_id required" });
    try {
      const { data, error } = await supabase
        .from("recently_watched")
        .select("*")
        .eq("profile_id", profile_id as string)
        .eq("stream_id", String(stream_id))
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && error.code !== "PGRST116") return res.status(500).json({ error: error.message });
      res.json(data ?? null);
    } catch {
      res.json(null);
    }
  });

  app.post("/api/recently-watched", async (req, res) => {
    const {
      profile_id, content_type, stream_id, name, thumbnail_url, stream_url,
      current_time, duration, is_completed, series_id, season_num, episode_num,
      audio_track, text_track,
      series_last_modified, series_total_episodes,
      series_final_season, series_final_episode,
    } = req.body;
    if (!profile_id || !content_type || !name) {
      return res.status(400).json({ error: "profile_id, content_type, and name required" });
    }
    try {
      const now = new Date().toISOString();
      const entry: Record<string, any> = {
        profile_id,
        content_type,
        stream_id: stream_id ?? null,
        name,
        thumbnail_url: thumbnail_url ?? null,
        stream_url: stream_url ?? null,
        updated_at: now,
      };
      if (typeof current_time === "number") entry.current_time = current_time;
      if (typeof duration === "number") entry.duration = duration;
      if (typeof is_completed === "boolean") entry.is_completed = is_completed;
      if (series_id != null) entry.series_id = String(series_id);
      if (season_num != null) entry.season_num = Number(season_num);
      if (episode_num != null) entry.episode_num = Number(episode_num);
      if (typeof audio_track === "number") entry.audio_track = audio_track;
      if (typeof text_track === "number") entry.text_track = text_track;
      if (typeof series_last_modified === "string") entry.series_last_modified = series_last_modified;
      if (typeof series_total_episodes === "number") entry.series_total_episodes = series_total_episodes;
      if (typeof series_final_season === "number") entry.series_final_season = series_final_season;
      if (typeof series_final_episode === "number") entry.series_final_episode = series_final_episode;

      // Dedup: remove any existing entry for the same stream (also handles re-watch)
      if (stream_id) {
        await supabase
          .from("recently_watched")
          .delete()
          .eq("profile_id", profile_id)
          .eq("stream_id", String(stream_id));
      }

      // Insert fresh entry (movies/series = full lifetime log; live = capped to 20 below)
      const { data, error: insertErr } = await supabase
        .from("recently_watched")
        .insert(entry)
        .select()
        .single();

      if (insertErr) {
        console.error("[recently-watched] insert error:", insertErr.message, insertErr.code);
        return res.json(null);
      }

      // Cap live entries at 20 per profile (movies/series remain uncapped).
      // Older live rows beyond the newest 20 get trimmed on every insert.
      if (content_type === "live") {
        try {
          const { data: liveRows } = await supabase
            .from("recently_watched")
            .select("id")
            .eq("profile_id", profile_id)
            .eq("content_type", "live")
            .order("updated_at", { ascending: false });
          if (liveRows && liveRows.length > 20) {
            const toDelete = liveRows.slice(20).map((r: any) => r.id);
            if (toDelete.length > 0) {
              await supabase.from("recently_watched").delete().in("id", toDelete);
            }
          }
        } catch (capErr: any) {
          console.error("[recently-watched] live cap trim failed:", capErr?.message);
        }
      }

      res.json(data ?? null);
    } catch (e: any) {
      console.error("[recently-watched] POST exception:", e?.message);
      res.json(null);
    }
  });

  // ── Recently Watched — delete a single entry ─────────────────────────────
  app.delete("/api/recently-watched/:id", async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "id required" });
    try {
      const { error } = await supabase
        .from("recently_watched")
        .delete()
        .eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete entry" });
    }
  });

  // ── Recently Watched — clear all for profile/type ────────────────────────
  app.delete("/api/recently-watched", async (req, res) => {
    const { profile_id, content_type } = req.query;
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    try {
      let q = supabase.from("recently_watched").delete().eq("profile_id", profile_id as string);
      if (content_type) q = q.eq("content_type", content_type as string);
      const { error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to clear watch history" });
    }
  });

  // ── Content Reports ───────────────────────────────────────────────────────
  app.post("/api/content-reports", async (req, res) => {
    const { profile_id, stream_id, stream_name, stream_type, reason, other_text } = req.body;
    if (!profile_id || !reason) {
      return res.status(400).json({ error: "profile_id and reason required" });
    }
    try {
      const { data, error } = await supabase
        .from("content_reports")
        .insert({
          profile_id,
          stream_id: stream_id ?? null,
          stream_name: stream_name ?? null,
          stream_type: stream_type ?? null,
          reason,
          other_text: other_text ?? null,
        })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch {
      res.status(500).json({ error: "Failed to submit report" });
    }
  });

  // ── Recently Watched — dev seed (test only) ───────────────────────────────
  app.get("/api/recently-watched/seed", async (req, res) => {
    const { profile_id } = req.query;
    if (!profile_id) return res.status(400).json({ error: "profile_id required" });
    try {
      // Delete existing seed entries for clean state
      await supabase.from("recently_watched").delete().eq("profile_id", profile_id as string);
      // Insert 2 test entries
      const entries = [
        { profile_id: profile_id as string, content_type: "movie", stream_id: "99998", name: "Furious 7", thumbnail_url: "https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsLMId5A5kUre.jpg", stream_url: null, updated_at: new Date(Date.now() - 60000).toISOString() },
        { profile_id: profile_id as string, content_type: "live", stream_id: "99999", name: "BBC One HD", thumbnail_url: null, stream_url: null, updated_at: new Date().toISOString() },
      ];
      const { data, error } = await supabase.from("recently_watched").insert(entries).select();
      if (error && !error.message?.includes("does not exist") && !error.message?.includes("Could not find")) {
        return res.status(500).json({ error: error.message });
      }
      res.json({ success: true, data });
    } catch {
      res.status(500).json({ error: "Seed failed" });
    }
  });

  // ── Lifetime access check ─────────────────────────────────────────────────
  // Checks the separate lifetime_users DB — returns { isLifetime: bool }
  app.get("/api/lifetime-check", async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: "username required" });
    try {
      const { data, error } = await lifetimeDb
        .from("lifetime_users")
        .select("id")
        .eq("username", username as string)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("[lifetime-check] error:", error.message);
        return res.json({ isLifetime: false });
      }
      res.json({ isLifetime: !!data });
    } catch (e: any) {
      console.error("[lifetime-check] exception:", e?.message);
      res.json({ isLifetime: false });
    }
  });

  // ── VPN subscription ──────────────────────────────────────────────────────
  // Reads/writes the `vpn_subscriptions` table on the lifetime DB.
  // Status: { subscribed: bool, isEnabled: bool, planType?: string, expiryDate?: string }
  app.get("/api/vpn/status", async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: "username required" });
    try {
      const { data, error } = await lifetimeDb
        .from("vpn_subscriptions")
        .select("is_enabled, plan_type, expiry_date")
        .eq("username", username as string)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("[vpn/status] error:", error.message);
        return res.json({ subscribed: false, isEnabled: false });
      }
      if (!data) return res.json({ subscribed: false, isEnabled: false });
      res.json({
        subscribed: true,
        isEnabled: !!data.is_enabled,
        planType: data.plan_type ?? null,
        expiryDate: data.expiry_date ?? null,
      });
    } catch (e: any) {
      console.error("[vpn/status] exception:", e?.message);
      res.json({ subscribed: false, isEnabled: false });
    }
  });

  app.post("/api/vpn/toggle", async (req, res) => {
    const { username, isEnabled } = req.body ?? {};
    if (!username || typeof isEnabled !== "boolean") {
      return res.status(400).json({ error: "username and isEnabled required" });
    }
    try {
      const { data, error } = await lifetimeDb
        .from("vpn_subscriptions")
        .update({ is_enabled: isEnabled })
        .eq("username", username)
        .select("is_enabled")
        .maybeSingle();
      if (error) {
        console.error("[vpn/toggle] error:", error.message);
        return res.status(500).json({ error: error.message });
      }
      if (!data) return res.status(404).json({ error: "No VPN subscription for that username" });
      res.json({ success: true, isEnabled: !!data.is_enabled });
    } catch (e: any) {
      console.error("[vpn/toggle] exception:", e?.message);
      res.status(500).json({ error: "Toggle failed" });
    }
  });

  // ── Content requests (lifetime DB) ────────────────────────────────────────
  // Returns the content_requests rows for a given xtream username, newest first.
  // The `content_details` column is jsonb populated from the TMDB API at
  // submission time, so it usually already contains poster_path, title/name,
  // overview, release_date/first_air_date, etc.
  app.get("/api/content-requests", async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: "username required" });
    try {
      const { data, error } = await lifetimeDb
        .from("content_requests")
        .select("id, status, admin_notes, comments, content_details, created_at, requester_username")
        .eq("requester_username", username as string)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        console.error("[content-requests] error:", error.message);
        return res.status(500).json({ error: error.message });
      }
      res.json({ requests: data ?? [] });
    } catch (e: any) {
      console.error("[content-requests] exception:", e?.message);
      res.status(500).json({ error: "Failed to fetch content requests" });
    }
  });

  // ── TMDB proxy ────────────────────────────────────────────────────────────
  // Fetches fresh details for a TMDB title without exposing the bearer token
  // to the client. type must be "movie" or "tv".
  app.get("/api/tmdb/:type/:id", async (req, res) => {
    const { type, id } = req.params;
    if (type !== "movie" && type !== "tv") {
      return res.status(400).json({ error: "type must be 'movie' or 'tv'" });
    }
    if (!id || !/^\d+$/.test(id)) {
      return res.status(400).json({ error: "valid numeric id required" });
    }
    const token = process.env.TMDB_READ_TOKEN;
    if (!token) {
      return res.status(500).json({ error: "TMDB_READ_TOKEN not configured" });
    }
    try {
      const r = await fetch(`https://api.themoviedb.org/3/${type}/${id}`, {
        headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
      });
      if (!r.ok) {
        return res.status(r.status).json({ error: `TMDB ${r.status}` });
      }
      const json = await r.json();
      res.json(json);
    } catch (e: any) {
      console.error("[tmdb] exception:", e?.message);
      res.status(500).json({ error: "TMDB fetch failed" });
    }
  });

  // ── Developer details ─────────────────────────────────────────────────────
  app.get("/api/developer-details", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("developer_details")
        .select("developer_name, developer_contact, website_link, renewal_link")
        .limit(1)
        .single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data ?? {});
    } catch {
      res.status(500).json({ error: "Failed to fetch developer details" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
