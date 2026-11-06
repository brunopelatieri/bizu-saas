import type { MetaFunction } from "react-router";
import { PortalEnterPage } from "@/pages/portal/enter-page";

export const meta: MetaFunction = () => [
  { title: "Entrar no portal — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

// Sem `loader` nem `action`: esta rota nunca toca no token no servidor.
export default function Route() {
  return <PortalEnterPage />;
}
