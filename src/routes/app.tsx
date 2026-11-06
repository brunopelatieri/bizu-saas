import type { MetaFunction } from "react-router";
import { DashboardPage } from "@/pages/dashboard-page";

export const meta: MetaFunction = () => [
  { title: "Dashboard — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Dashboard() {
  return <DashboardPage />;
}
