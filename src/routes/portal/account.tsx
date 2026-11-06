import type { MetaFunction } from "react-router";
import { PortalAccountPage } from "@/pages/portal/account-page";

export const meta: MetaFunction = () => [
  { title: "Minha conta — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Route() {
  return <PortalAccountPage />;
}
