import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MetaFunction } from "react-router";
import { toast } from "sonner";
import { SettingsNav } from "@/components/app/settings-nav";
import { TwoFactorCard } from "@/components/auth/two-factor-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api/client";
import { isOwner } from "@/lib/auth/permissions";
import { useAuth } from "@/providers/auth-provider";

export const meta: MetaFunction = () => [
  { title: "Segurança — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

type TenantResponse = { tenant: { require2fa: boolean } };

function RequireTwoFactorCard() {
  const { user, tenant, reloadAccount } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["tenant", tenant?.id],
    queryFn: () => apiFetch<TenantResponse>("/api/tenant"),
    retry: false,
  });
  const update = useMutation({
    mutationFn: (require2fa: boolean) =>
      apiFetch("/api/tenant/security", {
        method: "PATCH",
        body: JSON.stringify({ require2fa }),
      }),
    onSuccess: async () => {
      toast.success("Regra da organização atualizada.");
      await queryClient.invalidateQueries({ queryKey: ["tenant"] });
      await reloadAccount();
    },
    onError: (error) => toast.error(error.message),
  });
  const required = query.data?.tenant.require2fa ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Exigir da equipe</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {required
            ? "Quem não tem a verificação em duas etapas só volta a usar a organização depois de ativá-la."
            : "Com a regra ligada, todos os membros precisam ativar a verificação em duas etapas."}
        </p>
        <Button
          size="sm"
          variant={required ? "outline" : "default"}
          disabled={
            query.isPending ||
            update.isPending ||
            (!required && !user?.twoFactorEnabled)
          }
          onClick={() => update.mutate(!required)}
        >
          {required ? "Deixar de exigir" : "Exigir da equipe"}
        </Button>
        {!required && !user?.twoFactorEnabled ? (
          <p className="text-xs text-muted-foreground">
            Ative na sua conta primeiro: assim ninguém fica trancado para fora.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function SettingsSecurity() {
  const { tenant, security } = useAuth();

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Configurações
      </h1>
      <SettingsNav />
      {security.tenantRequires2fa ? (
        <p
          role="alert"
          className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-600 dark:text-amber-400"
        >
          Esta organização exige verificação em duas etapas. Ative abaixo para
          continuar.
        </p>
      ) : null}
      <TwoFactorCard />
      {tenant && isOwner(tenant.role) ? <RequireTwoFactorCard /> : null}
    </div>
  );
}
