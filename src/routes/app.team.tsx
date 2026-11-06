import type { MetaFunction } from "react-router";
import { TeamPage } from "@/pages/team-page";

export const meta: MetaFunction = () => [
  { title: "Equipe — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Team() {
  return <TeamPage />;
}
