import type { MetaFunction } from "react-router";
import { PortalLoginPage } from "@/pages/portal/login-page";

export const meta: MetaFunction = () => [
  { title: "Entrar no portal — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Route() {
  return <PortalLoginPage />;
}
