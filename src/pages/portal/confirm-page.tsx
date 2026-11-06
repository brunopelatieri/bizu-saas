import { CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  AuthShell,
  authLinkClassName,
  authSubmitClassName,
} from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api/client";

/** Confirmação do autocadastro. Como em `/portal/entrar`, só o botão consome o token. */
export function PortalConfirmPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const org = searchParams.get("org");
  const [state, setState] = useState<"idle" | "sending" | "failed" | "done">(
    "idle",
  );
  const login = org
    ? `/portal/login?org=${encodeURIComponent(org)}`
    : "/portal/login";

  async function confirm() {
    setState("sending");

    try {
      await apiFetch("/api/portal/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token, org: org ?? undefined }),
      });
      setState("done");
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      setState("failed");
    }
  }

  if (state === "done") {
    return (
      <AuthShell title="Confirmar e-mail" subtitle="Tudo certo">
        <div className="grid gap-4 text-sm">
          <p className="flex items-start gap-2 text-white">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
            E-mail confirmado. Entre com a senha que você criou.
          </p>
          <Link to={login} className={authLinkClassName}>
            Entrar
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (!token || state === "failed") {
    return (
      <AuthShell title="Confirmar e-mail" subtitle="Link inválido ou expirado">
        <div className="grid gap-4 text-sm">
          <p className="text-muted-foreground">
            Este link venceu. Tente entrar com sua senha: enviamos outro, se
            precisar.
          </p>
          <Link to={login} className={authLinkClassName}>
            Entrar
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Confirmar e-mail" subtitle="Falta um clique">
      <div className="grid gap-4 text-sm">
        <p className="text-muted-foreground">
          Clique no botão para confirmar este e-mail.
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
