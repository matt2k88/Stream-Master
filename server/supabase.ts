import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Lifetime clients are request-scoped in lifetime-auth.ts. A shared anonymous
// client cannot access protected tables, and a shared signed-in client would
// risk mixing customer sessions.

export interface IptvServer {
  id: string;
  name: string;
  server_url: string;
  logo_url?: string;
  is_active: boolean;
}
