import type { MetaFunction } from "react-router";
import { AdminPlansPage } from "@/pages/admin/plans-page";

export const meta: MetaFunction = () => [
  { title: "Planos — Administração — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Route() {
  return <AdminPlansPage />;
}
