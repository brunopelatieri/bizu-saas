import type { MetaFunction } from "react-router";
import { AdminOverviewPage } from "@/pages/admin/overview-page";

export const meta: MetaFunction = () => [
  { title: "Visão geral — Administração — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Route() {
  return <AdminOverviewPage />;
}
