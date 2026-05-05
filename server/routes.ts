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

  const httpServer = createServer(app);
  return httpServer;
}
