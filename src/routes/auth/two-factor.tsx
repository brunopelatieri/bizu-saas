import type { MetaFunction } from "react-router";
import { TwoFactorPage } from "@/pages/two-factor-page";

export const meta: MetaFunction = () => [
  { title: "Verificação em duas etapas — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function TwoFactor() {
  return <TwoFactorPage />;
}
