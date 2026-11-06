import { CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  AuthShell,
  authLinkClassName,
  authSubmitClassName,
} from "@/components/auth/auth-shell";
import { ResendVerification } from "@/components/auth/resend-verification";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { VerificationStep } from "@/lib/schemas/auth";
import { useAuth } from "@/providers/auth-provider";

const FAILURE_MESSAGE = "Link inválido ou expirado.";

const STEP_MESSAGES: Record<Exclude<VerificationStep, "verified">, string> = {
  "change-approved":
    "Troca aprovada. Enviamos um link ao novo endereço: confirme por lá para concluir.",
  "change-done": "Pronto. O e-mail da sua conta foi alterado.",
};

/**
 * Só renderiza no GET: scanners de e-mail abrem o link sem consumir nada. Quem
 * consome o token é o POST do botão, depois de um clique de verdade.
 */
export function VerifyEmailPage() {
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<"idle" | "sending" | "failed">("idle");
  const [done, setDone] = useState<string | null>(null);

  async function confirm() {
    setState("sending");

    try {
      const { step } = await apiFetch<{ step: VerificationStep }>(
        "/api/auth/verify-email",
        { method: "POST", body: JSON.stringify({ token }) },
      );

      await refresh();

      if (step === "verified") {
        navigate("/app", { replace: true });
        return;
      }

      setDone(STEP_MESSAGES[step]);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      setState("failed");
    }
  }

  if (done) {
    return (
      <AuthShell title="E-mail" subtitle="Tudo certo">
        <div className="grid gap-4 text-sm">
          <p className="flex items-start gap-2 text-white">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
            {done}
          </p>
          <Link to="/app" className={authLinkClassName}>
            Ir para a conta
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (user?.emailVerified && state === "failed") {
    return (
      <AuthShell title="Confirmar e-mail" subtitle="E-mail já confirmado">
        <p className="text-center text-sm">
          <Link to="/app" className={authLinkClassName}>
            Ir para a conta
          </Link>
        </p>
      </AuthShell>
    );
  }

  if (!token || state === "failed") {
    return (
      <AuthShell title="Confirmar e-mail" subtitle={FAILURE_MESSAGE}>
        <div className="grid gap-4 text-sm">
          <p className="text-muted-foreground">
            Este link venceu ou já foi usado. Se você já confirmou, entre com sua
            senha. Se não, peça um novo link.
          </p>
          <ResendVerification />
          <p className="text-center">
            <Link to="/login" className={authLinkClassName}>
              Entrar
            </Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Confirmar e-mail" subtitle="Falta um clique">
      <div className="grid gap-4 text-sm">
        <p className="text-muted-foreground">
          Clique no botão para confirmar este e-mail. O link só pode ser usado uma
          vez.
        </p>
        <Button
          type="button"
          size="lg"
          className={authSubmitClassName}
          disabled={state === "sending"}
          onClick={confirm}
        >
          {state === "sending" ? <Loader2 className="animate-spin" /> : null}
          Confirmar meu e-mail
        </Button>
      </div>
    </AuthShell>
  );
}
