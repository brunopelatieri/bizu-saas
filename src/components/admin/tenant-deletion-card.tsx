import { useState } from "react";
import {
  useAdminMutation,
  useAdminQuery,
  useIsPlatformOwner,
} from "@/components/admin/admin-api";
import { DeleteDialog } from "@/components/admin/delete-dialog";
import { DeletionStatus, type PendingDeletion } from "@/components/admin/deletion-status";
import { Button } from "@/components/ui/button";

/**
 * Excluir e cancelar a exclusão da organização pelo `/admin` (`spec.md` da admin-crud, seção
 * 2). A API encerra a assinatura no provedor antes e confere o slug digitado.
 */
export function TenantDeletionCard({
  tenant,
}: {
  tenant: { id: string; name: string; slug: string; status: string };
}) {
  const owner = useIsPlatformOwner();
  const [open, setOpen] = useState(false);
  const query = useAdminQuery<{ deletion: PendingDeletion }>(
    `/api/admin/tenants/${tenant.id}/deletion`,
  );
  const remove = useAdminMutation("Exclusão registrada.");
  const cancel = useAdminMutation("Exclusão cancelada.");
  const deletion = query.data?.deletion ?? null;

  if (tenant.status === "deleted") {
    return <p className="text-sm text-muted-foreground">Organização excluída.</p>;
  }

  if (deletion) {
    return (
      <DeletionStatus
        deletion={deletion}
        canWrite={owner}
        pending={cancel.isPending}
        onCancel={() =>
          cancel.mutate({
            path: `/api/admin/tenants/${tenant.id}/deletion/cancel`,
            method: "POST",
          })
        }
      />
    );
  }

  if (!owner || query.isPending) return null;

  return (
    <>
      <Button variant="outline" className="text-destructive" onClick={() => setOpen(true)}>
        Excluir organização
      </Button>
      <DeleteDialog
        open={open}
        title={`Excluir ${tenant.name}`}
        description={
          <>
            A assinatura é encerrada no provedor antes de tudo. A equipe e os clientes perdem
            o acesso; membros, papéis, credenciais, arquivos e dados de clientes são
            anonimizados. Faturas, assinatura e auditoria ficam, sem identificar ninguém.
          </>
        }
        confirmText={tenant.slug}
        confirmLabel="o identificador da organização"
        pending={remove.isPending}
        onCancel={() => setOpen(false)}
        onConfirm={(input) =>
          remove.mutate(
            { path: `/api/admin/tenants/${tenant.id}`, method: "DELETE", body: input },
            { onSuccess: () => setOpen(false) },
          )
        }
      />
    </>
  );
}
