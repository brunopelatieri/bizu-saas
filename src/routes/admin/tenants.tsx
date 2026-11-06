import type { MetaFunction } from "react-router";
import { AdminTenantsPage } from "@/pages/admin/tenants-page";

export const meta: MetaFunction = () => [
  { title: "Organizações — Administração — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Route() {
  return <AdminTenantsPage />;
}
