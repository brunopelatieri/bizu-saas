import type { LucideIcon } from "lucide-react";
import {
  CreditCard,
  LayoutDashboard,
  Settings,
  UserCog,
  Users,
} from "lucide-react";

export type DashboardNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
};

/** Navegação da área do tenant (`/app/**`). */
export const dashboardMainNav: DashboardNavItem[] = [
  { href: "/app", label: "Visão geral", icon: LayoutDashboard, end: true },
  { href: "/app/clientes", label: "Clientes", icon: Users },
  { href: "/app/equipe", label: "Equipe", icon: UserCog },
  { href: "/app/assinatura", label: "Assinatura", icon: CreditCard },
];

export const dashboardBottomNav: DashboardNavItem[] = [
  { href: "/app/configuracoes", label: "Configurações", icon: Settings },
];

export const dashboardTitles: Record<string, string> = {
  "/app": "Visão geral",
  "/app/clientes": "Clientes",
  "/app/equipe": "Equipe",
  "/app/assinatura": "Assinatura",
  "/app/configuracoes": "Configurações",
};

export function dashboardTitleFromPath(pathname: string): string {
  return dashboardTitles[pathname] ?? "Visão geral";
}
