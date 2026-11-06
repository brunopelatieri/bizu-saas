import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Can } from "@/components/auth/can";
import { type IdentityValues, IdentityDialog } from "@/components/privacy/identity-dialog";
import { useDeletionStatus } from "@/components/privacy/account-deletion-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

/**
 * Excluir a organização inteira (só o proprietário). Encerra a cobrança, bloqueia o acesso da
 * equipe e anonimiza tudo em 30 dias. Quem está agendado aparece com o botão de desistir, fora do
 * `<Can>`: organização em exclusão não tem permissões, e quem decide é a API.
 */
export function OrganizationDeletionCard() {
  const { user, tenant, tenants, reloadAccount } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const status = useDeletionStatus("/api/me/deletion");

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["privacy", "deletion"] });
    await reloadAccount();
  };

  const remove = useMutation({
    mutationFn: (values: IdentityValues) =>
      apiFetch("/api/tenant", { method: "DELETE", body: JSON.stringify(values) }),
    onSuccess: async () => {
      setOpen(false);
      toast.success("Exclusão da organização agendada.");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const cancel = useMutation({
    mutationFn: (tenantId: string) =>
      apiFetch("/api/tenant/deletion/cancel", {
        method: "POST",
        body: JSON.stringify({ tenantId }),
      }),
    onSuccess: async () => {
      toast.success("Exclusão da organização cancelada.");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const pending = status.data?.tenants ?? [];

  if (!tenant && pending.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Excluir a organização</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {pending.map(({ tenantId, scheduledFor }) => (
          <div
            key={tenantId}
            className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3"
          >
            <p className="text-foreground">
              <strong>{tenants.find(({ id }) => id === tenantId)?.name ?? "A organização"}</strong>{" "}
              será excluída em <strong>{formatDate(scheduledFor)}</strong>. O acesso da equipe já
              está bloqueado.
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(tenantId)}
            >
              Cancelar exclusão
            </Button>
          </div>
        ))}

        <Can resource="organization" action="delete">
          <p className="text-muted-foreground">
            Encerra a assinatura, bloqueia a equipe e anonimiza clientes, dados de cobrança e
            arquivos depois de 30 dias. Faturas e auditoria ficam, sem identificar ninguém.
          </p>
          <Button variant="destructive" onClick={() => setOpen(true)}>
            Excluir {tenant?.name ?? "a organização"}
          </Button>

          <IdentityDialog
            open={open}
            title={`Excluir ${tenant?.name ?? "a organização"}?`}
            description="Toda a equipe perde o acesso agora. Confirme com a sua senha; você tem 30 dias para desistir."
            confirmLabel="Excluir organização"
            needsTotp={user?.twoFactorEnabled ?? false}
            pending={remove.isPending}
            onConfirm={(values) => remove.mutate(values)}
            onCancel={() => setOpen(false)}
          />
        </Can>
      </CardContent>
    </Card>
  );
}
