import type { MetaFunction } from "react-router";
import { PortalSignupPage } from "@/pages/portal/signup-page";

export const meta: MetaFunction = () => [
  { title: "Cadastro no portal — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Route() {
  return <PortalSignupPage />;
}
