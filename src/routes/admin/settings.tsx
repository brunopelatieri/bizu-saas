import type { MetaFunction } from "react-router";
import { AdminSettingsPage } from "@/pages/admin/settings-page";

export const meta: MetaFunction = () => [
  { title: "Configurações da plataforma — Administração — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Route() {
  return <AdminSettingsPage />;
}
