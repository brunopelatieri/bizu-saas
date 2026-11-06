import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api/client";
import { emailOnlySchema } from "@/lib/schemas/auth";

const SENT_MESSAGE = "Se existir uma conta com este e-mail, enviamos um link.";

async function resendVerification(email: string) {
  await apiFetch("/api/auth-ext/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

/** Sem `email`, pede o endereço: é o caso da página aberta com link vencido. */
export function ResendVerification({ email }: { email?: string }) {
  const [typed, setTyped] = useState("");
  const [sending, setSending] = useState(false);
  const target = email ?? typed;

  async function handleResend() {
    const parsed = emailOnlySchema.safeParse({ email: target });

    if (!parsed.success) {
      toast.error("Informe um e-mail válido.");
      return;
    }

    setSending(true);
    try {
      await resendVerification(parsed.data.email);
      toast.success(SENT_MESSAGE);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Tente novamente mais tarde.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid w-full gap-2">
      {email ? null : (
        <Input
          type="email"
          autoComplete="email"
          aria-label="E-mail da conta"
          placeholder="voce@empresa.com"
          className="h-10 w-full bg-black/25 px-3 text-sm placeholder:text-muted-foreground/80"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      )}
      <Button
        type="button"
        variant="outline"
        className="h-10 w-full"
        disabled={sending}
        onClick={handleResend}
      >
        {sending ? <Loader2 className="animate-spin" /> : null}
        Reenviar link de confirmação
      </Button>
    </div>
  );
}
