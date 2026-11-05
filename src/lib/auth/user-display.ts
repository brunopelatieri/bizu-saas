import type { User } from "@supabase/supabase-js";

export function getUserDisplayName(user: User | null): string {
  const metadataName = user?.user_metadata?.full_name;
  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim();
  }

  const emailPrefix = user?.email?.split("@")[0];
  return emailPrefix ?? "Usuário";
}

export function getUserInitials(user: User | null): string {
  const name = user?.user_metadata?.full_name;
  if (typeof name === "string" && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0]?.[0]}${parts.at(-1)?.[0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  return user?.email?.slice(0, 2).toUpperCase() ?? "??";
}
