import type { MetaFunction } from "react-router";
import { CustomerDetailPage } from "@/pages/customer-detail-page";

export const meta: MetaFunction = () => [
  { title: "Cliente — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Route() {
  return <CustomerDetailPage />;
}
