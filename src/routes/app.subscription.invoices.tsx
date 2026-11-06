import type { MetaFunction } from "react-router";
import { InvoicesPage } from "@/pages/invoices-page";

export const meta: MetaFunction = () => [
  { title: "Faturas — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Invoices() {
  return <InvoicesPage />;
}
