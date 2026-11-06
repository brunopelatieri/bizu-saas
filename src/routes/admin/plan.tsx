import type { MetaFunction } from "react-router";
import { AdminPlanDetailPage } from "@/pages/admin/plan-detail-page";

export const meta: MetaFunction = () => [
  { title: "Plano — Administração — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Route() {
  return <AdminPlanDetailPage />;
}
