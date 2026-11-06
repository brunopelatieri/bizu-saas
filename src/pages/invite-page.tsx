import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { SignupForm } from "@/components/auth/auth-form";
import {
  AuthShell,
  AuthSpinner,
  authLinkClassName,
  authSubmitClassName,
} from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";

type Invitation = {
  id: string;
  email: string;
  tenantName: string;
  inviterName: string;
  roleLabel: string;
};

/**
 * O GET só mostra o convite: scanners de e-mail abrem o link sem efeito. Aceitar é o POST
 * do botão, com sessão e e-mail verificado da pessoa convidada. Clicar no link não
 * verifica o e-mail: sem conta, o caminho é cadastrar e confirmar.
 */
export function InvitePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading, signOut, reloadAccount } = useAuth();

  const invitation = useQuery({
    queryKey: ["invitation", id],
    queryFn: () =>
      apiFetch<{ invitation: Invitation }>(`/api/invitations/${id}`),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () =>
      apiFetch(`/api/invitations/${id}/accept`, { method: "POST" }),
    onSuccess: async () => {
      await reloadAccount();
      navigate("/app", { replace: true });
    },
    onError: (error) => toast.error(error.message),
  });

  if (loading || invitation.isPending) return <AuthSpinner />;

  if (invitation.isError) {
    return (
      <AuthShell title="Convite" subtitle="Convite inválido ou expirado">
        <p className="text-center text-sm text-muted-foreground">
          Este link venceu, foi revogado ou já foi usado. Peça um novo convite a
          quem enviou.
        </p>
        <p className="mt-4 text-center text-sm">
          <Link to="/app" className={authLinkClassName}>
            Ir para a conta
          </Link>
        </p>
      </AuthShell>
    );
  }

  const { email, tenantName, inviterName, roleLabel } =
    invitation.data.invitation;
  const nextPath = `/convite/${id}`;
  const loginPath = `/login?next=${encodeURIComponent(nextPath)}`;
  const intro = (
    <p className="mb-5 text-sm text-muted-foreground">
      {inviterName} convidou você para {tenantName} como{" "}
      <span className="text-white">{roleLabel}</span>.
    </p>
  );

  if (!user) {
    return (
      <AuthShell title={`Convite para ${tenantName}`} subtitle="Crie sua conta">
        {intro}
        <SignupForm lockedEmail={email} loginPath={loginPath} />
      </AuthShell>
    );
  }

  if (user.email.toLowerCase() !== email.toLowerCase()) {
    return (
      <AuthShell title={`Convite para ${tenantName}`} subtitle="Outra conta">
        {intro}
        <div className="grid gap-4 text-sm">
          <p className="text-muted-foreground">
            Este convite é para <span className="break-all">{email}</span>. Saia
            e entre com esse e-mail.
          </p>
          <Button
            type="button"
            size="lg"
            className={authSubmitClassName}
            onClick={() => void signOut()}
          >
            Sair
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={`Convite para ${tenantName}`} subtitle="Falta um clique">
      {intro}
      <Button
        type="button"
        size="lg"
        className={authSubmitClassName}
        disabled={accept.isPending}
        onClick={() => accept.mutate()}
      >
        {accept.isPending ? <Loader2 className="animate-spin" /> : null}
        Aceitar convite
      </Button>
    </AuthShell>
  );
}
