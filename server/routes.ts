import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { supabase } from "./supabase";

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
    const { name, avatar_icon, avatar_color, pin } = req.body;
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ name, avatar_icon, avatar_color, pin: pin ?? null })
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
