import type { MetaFunction } from "react-router";
import { AdminSubscriptionsPage } from "@/pages/admin/subscriptions-page";

export const meta: MetaFunction = () => [
  { title: "Assinaturas — Administração — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Route() {
  return <AdminSubscriptionsPage />;
}
