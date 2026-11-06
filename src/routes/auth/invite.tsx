import type { MetaFunction } from "react-router";
import { InvitePage } from "@/pages/invite-page";

export const meta: MetaFunction = () => [
  { title: "Convite — Bizu SaaS" },
  { name: "robots", content: "noindex" },
  { name: "referrer", content: "no-referrer" },
];

/** Sem `loader` nem `action`: abrir o link nunca consome o convite. */
export default function Invite() {
  return <InvitePage />;
}
