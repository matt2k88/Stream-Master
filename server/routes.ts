import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { supabase } from "./supabase";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/servers", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("iptv_servers")
        .select("id, name, server_url, logo_url, is_active")
        .eq("is_active", true)
        .order("name");

      if (error) {
        return res.status(500).json({ error: error.message });
      }
      res.json(data ?? []);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch servers" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
