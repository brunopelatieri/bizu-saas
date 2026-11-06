import type { MetaFunction } from "react-router";
import { PortalConfirmPage } from "@/pages/portal/confirm-page";

export const meta: MetaFunction = () => [
  { title: "Confirmar e-mail — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

// Sem `loader` nem `action`: esta rota nunca toca no token no servidor.
export default function Route() {
  return <PortalConfirmPage />;
}
