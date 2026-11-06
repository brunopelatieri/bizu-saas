import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api/client";
import { LEGAL_VERSIONS } from "@/lib/legal/versions";

/**
 * Re-aceite dos textos legais quando a versão vigente muda. Não fecha sem aceitar: quem não
 * aceita pode sair. É só a interface: o histórico do aceite fica em `consent_log`.
 */
export function ConsentDialog({
  open,
  endpoint,
  onAccepted,
  onSignOut,
}: {
  open: boolean;
  /** `/api/me/consent` na equipe; `/api/portal/me/consent` no portal. */
  endpoint: string;
  onAccepted: () => Promise<void> | void;
  onSignOut: () => Promise<void> | void;
}) {
  const [pending, setPending] = useState(false);

  async function accept() {
    setPending(true);

    try {
      await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ accept: true, version: LEGAL_VERSIONS.terms }),
      });
      await onAccepted();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível registrar o aceite.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Atualizamos nossos termos</DialogTitle>
          <DialogDescription>
            Leia os{" "}
            <a
              href="/legal/termos"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              termos de uso
            </a>{" "}
            e a{" "}
            <a
              href="/legal/privacidade"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              política de privacidade
            </a>{" "}
            (versão {LEGAL_VERSIONS.terms}). Para continuar, é preciso aceitá-los.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => void onSignOut()}>
            Sair
          </Button>
          <Button disabled={pending} onClick={() => void accept()}>
            Li e aceito
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
