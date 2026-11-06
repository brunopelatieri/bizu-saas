import type { MetaFunction } from "react-router";
import { ChangeEmailCard } from "@/components/auth/change-email-card";

export const meta: MetaFunction = () => [
  { title: "Configurações — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Settings() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Configurações
      </h1>
      <ChangeEmailCard />
    </div>
  );
}
