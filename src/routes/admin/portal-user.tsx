import type { MetaFunction } from "react-router";
import { AdminPortalUserDetailPage } from "@/pages/admin/portal-user-detail-page";

export const meta: MetaFunction = () => [
  { title: "Cliente do portal — Administração — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Route() {
  return <AdminPortalUserDetailPage />;
}
