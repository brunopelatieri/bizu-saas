import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabase/config";

let client: ReturnType<typeof createClient> | undefined;

export function getSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  if (!client) {
    client = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    );
  }

  return client;
}
