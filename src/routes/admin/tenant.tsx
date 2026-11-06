import type { MetaFunction } from "react-router";
import { AdminTenantDetailPage } from "@/pages/admin/tenant-detail-page";

export const meta: MetaFunction = () => [
  { title: "Organização — Administração — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Route() {
  return <AdminTenantDetailPage />;
}
