import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { QueryState } from "@/components/admin/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api/client";

type ExportItem = {
  id: string;
  status: "pending" | "ready" | "failed" | "expired";
  createdAt: string;
  expiresAt: string | null;
  downloadUrl: string | null;
};

const STATUS_LABEL: Record<ExportItem["status"], string> = {
  pending: "Em preparo",
  ready: "Pronta",
  failed: "Falhou",
  expired: "Expirada",
};

const formatDateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR");

/**
 * Exportação dos dados pessoais (LGPD). O arquivo é montado em segundo plano e o link chega
 * por e-mail; aqui a lista mostra o andamento e o botão de baixar enquanto o link vale.
 * `endpoint` é `/api/me/export` na equipe e `/api/portal/me/export` no portal.
 */
export function ExportCard({ endpoint }: { endpoint: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["privacy", endpoint];

  const query = useQuery({
    queryKey,
    queryFn: () => apiFetch<{ exports: ExportItem[] }>(endpoint),
    retry: false,
    // Enquanto há pedido em preparo, confere a cada 5 segundos.
    refetchInterval: (state) =>
      state.state.data?.exports.some(({ status }) => status === "pending") ? 5000 : false,
  });

  const request = useMutation({
    mutationFn: () => apiFetch(endpoint, { method: "POST" }),
    onSuccess: async () => {
      toast.success("Pedido criado. Enviaremos o link por e-mail quando o arquivo estiver pronto.");
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(error.message),
  });

  const exports = query.data?.exports ?? [];
  const pending = exports.some(({ status }) => status === "pending");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Exportar meus dados</CardTitle>
        <Button
          size="sm"
          disabled={pending || request.isPending}
          onClick={() => request.mutate()}
        >
          Pedir exportação
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Um arquivo zip com os seus dados em JSON: perfil, organizações, consentimentos e
          registros de auditoria. O link chega por e-mail e vale por 7 dias.
        </p>

        <QueryState {...query}>
          {exports.length === 0 ? (
            <p className="text-muted-foreground">Nenhuma exportação pedida ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {exports.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span>
                    {formatDateTime(item.createdAt)}{" "}
                    <Badge variant="secondary" className="ml-1">
                      {STATUS_LABEL[item.status]}
                    </Badge>
                    {item.status === "ready" && item.expiresAt ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        até {formatDateTime(item.expiresAt)}
                      </span>
                    ) : null}
                  </span>
                  {item.downloadUrl ? (
                    <a
                      href={item.downloadUrl}
                      className="font-medium text-primary hover:underline"
                    >
                      Baixar
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </CardContent>
    </Card>
  );
}
