import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface IptvServer {
  id: string;
  name: string;
  server_url: string;
  logo_url?: string;
  is_active: boolean;
}
