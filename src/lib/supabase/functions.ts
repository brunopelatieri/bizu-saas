import { getSupabase } from "@/lib/supabase/client";
import { requireSupabaseConfig } from "@/lib/supabase/config";

type InvokeOptions = {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
};

export async function invokeFunction<T = unknown>(
  functionName: string,
  options: InvokeOptions = {},
) {
  requireSupabaseConfig();

  const supabase = getSupabase();

  return supabase.functions.invoke<T>(functionName, {
    body: options.body,
    headers: options.headers,
  });
}
