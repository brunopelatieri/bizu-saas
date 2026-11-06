import type { MetaFunction } from "react-router";
import { PortalHomePage } from "@/pages/portal/home-page";

export const meta: MetaFunction = () => [
  { title: "Portal do cliente — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Route() {
  return <PortalHomePage />;
}
