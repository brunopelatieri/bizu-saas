import type { MetaFunction } from "react-router";
import { SettingsNav } from "@/components/app/settings-nav";
import { AccountDeletionCard } from "@/components/privacy/account-deletion-card";
import { ExportCard } from "@/components/privacy/export-card";
import { MarketingCard } from "@/components/privacy/marketing-card";
import { OrganizationDeletionCard } from "@/components/privacy/organization-deletion-card";
import { useAuth } from "@/providers/auth-provider";

export const meta: MetaFunction = () => [
  { title: "Privacidade — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

/** Direitos do titular (LGPD): exportar, excluir a conta e, para o proprietário, a organização. */
export default function SettingsPrivacy() {
  const { user } = useAuth();

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Configurações
      </h1>
      <SettingsNav />

      <MarketingCard />
      <ExportCard endpoint="/api/me/export" />
      <AccountDeletionCard
        statusUrl="/api/me/deletion"
        deleteUrl="/api/me"
        cancelUrl="/api/me/deletion/cancel"
        needsTotp={user?.twoFactorEnabled ?? false}
      />
      <OrganizationDeletionCard />
    </div>
  );
}
