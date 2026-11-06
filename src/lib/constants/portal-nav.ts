import type { LucideIcon } from "lucide-react";
import { Home, Receipt, UserRound } from "lucide-react";

type PortalNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
};

/** Navegação do cliente (`/portal/**`). */
export const portalNav: PortalNavItem[] = [
  { href: "/portal", label: "Início", icon: Home, end: true },
  { href: "/portal/conta", label: "Minha conta", icon: UserRound },
  { href: "/portal/faturas", label: "Faturas", icon: Receipt },
];
