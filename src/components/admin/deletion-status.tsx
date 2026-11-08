import { Button } from "@/components/ui/button";

export type PendingDeletion = {
  scheduledFor: string;
  origin: "self" | "platform";
} | null;

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

/**
 * Faixa da exclusão pendente nas telas de detalhe. Só o pedido da plataforma se cancela por
 * aqui: o da própria pessoa (ou do owner) é decisão dela (`DELETION_NOT_PLATFORM`).
 */
export function DeletionStatus({
  deletion,
  canWrite,
  pending,
  onCancel,
}: {
  deletion: NonNullable<PendingDeletion>;
  canWrite: boolean;
  pending: boolean;
  onCancel: () => void;
}) {
  const byPlatform = deletion.origin === "platform";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <p>
        Exclusão agendada para <strong>{formatDate(deletion.scheduledFor)}</strong>,{" "}
        {byPlatform ? "pela administração." : "a pedido do próprio titular."}
        {byPlatform ? null : (
          <span className="block text-xs text-muted-foreground">
            Só quem pediu pode desistir.
          </span>
        )}
      </p>
      {canWrite && byPlatform ? (
        <Button variant="outline" size="sm" disabled={pending} onClick={onCancel}>
          Cancelar exclusão
        </Button>
      ) : null}
    </div>
  );
}
