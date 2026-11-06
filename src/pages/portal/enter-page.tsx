import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  AuthShell,
  authLinkClassName,
  authSubmitClassName,
} from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api/client";
import { usePortalAuth } from "@/providers/portal-auth-provider";

/**
 * Só renderiza no GET: scanners de e-mail abrem o link sem consumir nada. Quem consome o
 * token é o POST do botão, depois de um clique de verdade.
 */
export function PortalEnterPage() {
  const navigate = useNavigate();
  const { refresh } = usePortalAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const org = searchParams.get("org");
  const [state, setState] = useState<"idle" | "sending" | "failed">("idle");

  async function enter() {
    setState("sending");

    try {
      await apiFetch("/api/portal/auth/magic-link/verify", {
        method: "POST",
        body: JSON.stringify({ token, org: org ?? undefined }),
      });
      await refresh();
      navigate("/portal", { replace: true });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      setState("failed");
    }
  }

  if (!token || state === "failed") {
    return (
      <AuthShell title="Portal do cliente" subtitle="Link inválido ou expirado">
        <div className="grid gap-4 text-sm">
          <p className="text-muted-foreground">
            Este link venceu ou já foi usado. Peça um novo para entrar.
          </p>
          <p className="text-center">
            <Link
              to={org ? `/portal/login?org=${encodeURIComponent(org)}` : "/portal/login"}
              className={authLinkClassName}
            >
              Pedir novo link
            </Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Portal do cliente" subtitle="Falta um clique">
      <div className="grid gap-4 text-sm">
        <p className="text-muted-foreground">
          Clique no botão para entrar. O link só pode ser usado uma vez.
        </p>
        <Button
          type="button"
          size="lg"
          className={authSubmitClassName}
          disabled={state === "sending"}
          onClick={enter}
        >
          {state === "sending" ? <Loader2 className="animate-spin" /> : null}
          Entrar no portal
        </Button>
      </div>
    </AuthShell>
  );
}
