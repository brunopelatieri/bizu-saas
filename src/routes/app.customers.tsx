import type { MetaFunction } from "react-router";
import { CustomersPage } from "@/pages/customers-page";

export const meta: MetaFunction = () => [
  { title: "Clientes — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Route() {
  return <CustomersPage />;
}
