import { getSupabase } from "@/lib/supabase/client";
import { requireSupabaseConfig } from "@/lib/supabase/config";
import type { RealtimeChannel } from "@supabase/supabase-js";

type BroadcastHandler = (payload: Record<string, unknown>) => void;

export function subscribeToBroadcast(
  channelName: string,
  event: string,
  handler: BroadcastHandler,
): RealtimeChannel {
  requireSupabaseConfig();

  const supabase = getSupabase();

  return supabase
    .channel(channelName)
    .on("broadcast", { event }, (payload) => handler(payload))
    .subscribe();
}

export function unsubscribeChannel(channel: RealtimeChannel) {
  const supabase = getSupabase();
  return supabase.removeChannel(channel);
}
