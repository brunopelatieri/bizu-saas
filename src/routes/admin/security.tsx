import type { MetaFunction } from "react-router";
import { PageTitle } from "@/components/admin/query-state";
import { TwoFactorCard } from "@/components/auth/two-factor-card";
import { useAuth } from "@/providers/auth-provider";

export const meta: MetaFunction = () => [
  { title: "Segurança — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function AdminSecurity() {
  const { security } = useAuth();

  return (
    <div className="max-w-2xl space-y-6">
      <PageTitle
        title="Segurança"
        description="A verificação em duas etapas é obrigatória para a plataforma em produção."
      />
      {security.platformRequires2fa ? (
        <p
          role="alert"
          className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-600 dark:text-amber-400"
        >
          Ative a verificação em duas etapas para usar a administração.
        </p>
      ) : null}
      <TwoFactorCard />
    </div>
  );
}
