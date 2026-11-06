import type { MetaFunction } from "react-router";
import { PortalChoosePage } from "@/pages/portal/choose-page";

export const meta: MetaFunction = () => [
  { title: "Escolher organização — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Route() {
  return <PortalChoosePage />;
}
