import type { MetaFunction } from "react-router";
import { AdminUsersPage } from "@/pages/admin/users-page";

export const meta: MetaFunction = () => [
  { title: "Usuários — Administração — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Route() {
  return <AdminUsersPage />;
}
