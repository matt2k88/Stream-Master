import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Second database — lifetime users registry
const lifetimeUrl = process.env.LIFETIME_SUPABASE_URL!;
const lifetimeAnonKey = process.env.LIFETIME_SUPABASE_ANON_KEY!;

export const lifetimeDb = createClient(lifetimeUrl, lifetimeAnonKey);

export interface IptvServer {
  id: string;
  name: string;
  server_url: string;
  logo_url?: string;
  is_active: boolean;
}
