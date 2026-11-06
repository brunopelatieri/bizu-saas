import type { MetaFunction } from "react-router";
import { AdminWebhooksPage } from "@/pages/admin/webhooks-page";

export const meta: MetaFunction = () => [
  { title: "Webhooks — Administração — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Route() {
  return <AdminWebhooksPage />;
}
