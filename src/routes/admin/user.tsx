import type { MetaFunction } from "react-router";
import { AdminUserDetailPage } from "@/pages/admin/user-detail-page";

export const meta: MetaFunction = () => [
  { title: "Usuário — Administração — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Route() {
  return <AdminUserDetailPage />;
}
