import { type ReactNode, useEffect, useId, useState } from "react";
import { Field } from "@/components/admin/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { type DeleteInput, type DeletionMode, deleteSchema } from "@/lib/schemas/admin";
import { cn } from "@/lib/utils";

type DeleteDialogProps = {
  open: boolean;
  title: string;
  /** O que acontece com o alvo e com o que está ligado a ele. */
  description: ReactNode;
  /** O que a pessoa digita para confirmar: o slug ou o e-mail. O servidor confere de novo. */
  confirmText: string;
  /** "o identificador" ou "o e-mail", para a instrução do campo. */
  confirmLabel: string;
  /** Campos a mais, como a flag das organizações de dono único. */
  children?: ReactNode;
  pending?: boolean;
  onConfirm: (input: DeleteInput) => void;
  onCancel: () => void;
};

const MODES: Array<{ value: DeletionMode; label: string; hint: string }> = [
  {
    value: "scheduled",
    label: "Agendar (30 dias, reversível)",
    hint: "O acesso cai na hora. Até a data, a administração pode cancelar.",
  },
  {
    value: "now",
    label: "Excluir agora (irreversível)",
    hint: "Os dados pessoais são anonimizados agora e não voltam.",
  },
];

/**
 * Diálogo único de exclusão do `/admin` (organização, usuário e pessoa do portal): escolhe
 * agendar ou excluir agora, pede para digitar o slug ou o e-mail e aceita um motivo.
 */
export function DeleteDialog({
  open,
  title,
  description,
  confirmText,
  confirmLabel,
  children,
  pending = false,
  onConfirm,
  onCancel,
}: DeleteDialogProps) {
  const name = useId();
  const [mode, setMode] = useState<DeletionMode>("scheduled");
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");
  const matches = confirm.trim().toLowerCase() === confirmText.toLowerCase();

  // Cada abertura começa do zero: nunca com "Excluir agora" e a confirmação já preenchidos.
  useEffect(() => {
    if (!open) return;
    setMode("scheduled");
    setConfirm("");
    setReason("");
  }, [open]);

  function close() {
    onCancel();
  }

  function submit() {
    const parsed = deleteSchema.safeParse({
      mode,
      confirm,
      reason: reason.trim() || undefined,
    });
    if (parsed.success && matches) onConfirm(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription render={<div />}>{description}</DialogDescription>
        </DialogHeader>

        <fieldset className="grid gap-2">
          <legend className="sr-only">Como excluir</legend>
          {MODES.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-md border p-3 text-sm",
                mode === option.value && "border-primary",
                option.value === "now" && mode === "now" && "border-destructive",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {children}

        <Field label={`Digite ${confirmLabel} para confirmar`} hint={confirmText}>
          {(id) => (
            <Input
              id={id}
              value={confirm}
              autoComplete="off"
              maxLength={254}
              onChange={(event) => setConfirm(event.target.value)}
            />
          )}
        </Field>

        <Field label="Motivo (opcional)" hint="Fica no pedido de exclusão, não vai ao e-mail.">
          {(id) => (
            <Input
              id={id}
              value={reason}
              maxLength={200}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={pending || !matches} onClick={submit}>
            {mode === "now" ? "Excluir agora" : "Agendar exclusão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
