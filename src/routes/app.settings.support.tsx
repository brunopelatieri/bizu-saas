import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MetaFunction } from "react-router";
import { toast } from "sonner";
import { QueryState } from "@/components/admin/query-state";
import { SettingsNav } from "@/components/app/settings-nav";
import { Can } from "@/components/auth/can";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api/client";
import { SUPPORT_GRANT_HOURS } from "@/lib/schemas/security";

export const meta: MetaFunction = () => [
  { title: "Acesso do suporte — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

type Grant = {
  id: string;
  expiresAt: string;
  revokedAt: string | null;
  usedBy: string | null;
  createdAt: string;
};

const QUERY_KEY = ["support-grants"];
const PATH = "/api/tenant/support-grant";

const formatDateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR");

const isActive = ({ revokedAt, expiresAt }: Grant) =>
  !revokedAt && new Date(expiresAt) > new Date();

function GrantRow({
  grant,
  pending,
  onRevoke,
}: {
  grant: Grant;
  pending: boolean;
  onRevoke: () => void;
}) {
  const active = isActive(grant);

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-0">
      <div className="space-y-0.5">
        <p>
          {active ? "Vale até " : "Valia até "}
          {formatDateTime(grant.expiresAt)}
          {grant.usedBy ? " · usada pelo suporte" : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          Criada em {formatDateTime(grant.createdAt)}
        </p>
      </div>
      {active ? (
        <Button variant="outline" size="sm" disabled={pending} onClick={onRevoke}>
          Revogar
        </Button>
      ) : (
        <Badge variant="secondary">
          {grant.revokedAt ? "Revogada" : "Expirada"}
        </Badge>
      )}
    </li>
  );
}

function SupportAccess() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<{ grants: Grant[] }>(PATH),
    retry: false,
  });
  const onDone = (message: string) => async () => {
    toast.success(message);
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  };
  const create = useMutation({
    mutationFn: () =>
      apiFetch(PATH, {
        method: "POST",
        body: JSON.stringify({ hours: SUPPORT_GRANT_HOURS }),
      }),
    onSuccess: onDone("Acesso do suporte liberado."),
    onError: (error) => toast.error(error.message),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiFetch(`${PATH}/${id}`, { method: "DELETE" }),
    onSuccess: onDone("Acesso revogado. Quem estava dentro saiu na hora."),
    onError: (error) => toast.error(error.message),
  });
  const grants = query.data?.grants ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Acesso do suporte</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          O suporte só entra na sua organização com a sua autorização. Cada entrada
          dura até 1 hora, fica no log de auditoria e não permite mexer em
          cobrança, equipe nem na sua senha.
        </p>
        <Button
          size="sm"
          disabled={create.isPending}
          onClick={() => create.mutate()}
        >
          Permitir acesso do suporte por {SUPPORT_GRANT_HOURS} h
        </Button>
        <QueryState {...query}>
          {grants.length === 0 ? (
            <p className="text-muted-foreground">Nenhuma autorização até agora.</p>
          ) : (
            <ul>
              {grants.map((grant) => (
                <GrantRow
                  key={grant.id}
                  grant={grant}
                  pending={revoke.isPending}
                  onRevoke={() => revoke.mutate(grant.id)}
                />
              ))}
            </ul>
          )}
        </QueryState>
      </CardContent>
    </Card>
  );
}

export default function SettingsSupport() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Configurações
      </h1>
      <SettingsNav />
      <Can
        resource="support"
        action="grant"
        fallback={
          <p className="text-sm text-muted-foreground">
            Só o proprietário libera o acesso do suporte.
          </p>
        }
      >
        <SupportAccess />
      </Can>
    </div>
  );
}
