import { AuthShell, authLinkClassName } from "@/components/auth/auth-shell";
import { usePortalAuth } from "@/providers/portal-auth-provider";

/** Sessão válida, sem tenant para entrar: lead à espera, bloqueado ou tenant fechado. */
export function PortalNoAccess() {
  const { tenants, signOut } = usePortalAuth();
  const waiting = tenants.some(({ status }) => status === "lead");

  return (
    <AuthShell
      title="Portal do cliente"
      subtitle={waiting ? "Cadastro em análise" : "Sem acesso no momento"}
    >
      <div className="grid gap-4 text-sm">
        <p className="text-muted-foreground">
          {waiting
            ? "Recebemos seu cadastro. Assim que a empresa liberar o acesso, você poderá entrar por aqui."
            : "Não há nenhum acesso liberado para esta conta. Fale com a empresa que enviou o convite."}
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className={authLinkClassName}
        >
          Sair
        </button>
      </div>
    </AuthShell>
  );
}
