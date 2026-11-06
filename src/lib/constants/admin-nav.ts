import {
  Building2,
  CreditCard,
  LayoutDashboard,
  Receipt,
  Settings,
  Users,
  Webhook,
} from "lucide-react";
import type { AppNavItem } from "@/lib/constants/app-nav";

/** Navegação da área da plataforma (`/admin/**`). Só `platform_owner` e `platform_support`. */
export const adminMainNav: AppNavItem[] = [
  { href: "/admin", label: "Visão geral", icon: LayoutDashboard, end: true },
  { href: "/admin/tenants", label: "Organizações", icon: Building2 },
  { href: "/admin/usuarios", label: "Usuários", icon: Users },
  { href: "/admin/planos", label: "Planos", icon: CreditCard },
  { href: "/admin/assinaturas", label: "Assinaturas", icon: Receipt },
  { href: "/admin/webhooks", label: "Webhooks", icon: Webhook },
];

export const adminBottomNav: AppNavItem[] = [
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
];

const adminTitles: Record<string, string> = {
  "/admin": "Visão geral",
  "/admin/tenants": "Organizações",
  "/admin/usuarios": "Usuários",
  "/admin/planos": "Planos",
  "/admin/assinaturas": "Assinaturas",
  "/admin/webhooks": "Webhooks",
  "/admin/configuracoes": "Configurações da plataforma",
};

export function adminTitleFromPath(pathname: string): string {
  if (adminTitles[pathname]) return adminTitles[pathname];
  if (pathname.startsWith("/admin/tenants/")) return "Organização";
  if (pathname.startsWith("/admin/planos/")) return "Plano";

  return "Administração";
}
