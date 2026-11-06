import type { MetaFunction } from "react-router";
import { PortalInvoicesPage } from "@/pages/portal/invoices-page";

export const meta: MetaFunction = () => [
  { title: "Faturas — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Route() {
  return <PortalInvoicesPage />;
}
