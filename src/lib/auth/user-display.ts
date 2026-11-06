import type { AuthUser } from "@/lib/auth/types";

export function getUserDisplayName(user: AuthUser | null): string {
  const name = user?.fullName?.trim();
  if (name) return name;

  const emailPrefix = user?.email?.split("@")[0];
  return emailPrefix ?? "Usuário";
}

export function getUserInitials(user: AuthUser | null): string {
  const name = user?.fullName?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0]?.[0]}${parts.at(-1)?.[0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  return user?.email?.slice(0, 2).toUpperCase() ?? "??";
}
