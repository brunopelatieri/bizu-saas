import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { MetaFunction } from "react-router";
import { toast } from "sonner";
import { QueryState } from "@/components/admin/query-state";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { SettingsNav } from "@/components/app/settings-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api/client";

export const meta: MetaFunction = () => [
  { title: "Sessões — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

type Session = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  updatedAt: string;
  current: boolean;
  support: boolean;
};

const QUERY_KEY = ["me", "sessions"];

const formatDateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR");

export default function SettingsSessions() {
  const queryClient = useQueryClient();
  const [revokingOthers, setRevokingOthers] = useState(false);
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<{ sessions: Session[] }>("/api/me/sessions"),
    retry: false,
  });
  const revoke = useMutation({
    mutationFn: (path: { url: string; method: "POST" | "DELETE" }) =>
      apiFetch(path.url, { method: path.method }),
    onSuccess: async () => {
      setRevokingOthers(false);
      toast.success("Sessão encerrada.");
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (error) => toast.error(error.message),
  });
  const sessions = query.data?.sessions ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Configurações
      </h1>
      <SettingsNav />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Sessões abertas</CardTitle>
          <Button
            variant="outline"
            size="sm"
            disabled={sessions.length < 2}
            onClick={() => setRevokingOthers(true)}
          >
            Encerrar as outras
          </Button>
        </CardHeader>
        <CardContent>
          <QueryState {...query}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Navegador</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Última atividade</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="max-w-64 truncate" title={session.userAgent ?? ""}>
                      {session.userAgent ?? "Desconhecido"}
                      {session.current ? (
                        <Badge variant="secondary" className="ml-2">
                          Esta sessão
                        </Badge>
                      ) : null}
                      {session.support ? (
                        <Badge variant="outline" className="ml-2">
                          Suporte
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>{session.ipAddress ?? "–"}</TableCell>
                    <TableCell>{formatDateTime(session.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      {session.current ? null : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={revoke.isPending}
                          onClick={() =>
                            revoke.mutate({
                              url: `/api/me/sessions/${session.id}`,
                              method: "DELETE",
                            })
                          }
                        >
                          Encerrar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueryState>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={revokingOthers}
        title="Encerrar as outras sessões?"
        description="Todos os outros dispositivos precisarão entrar de novo."
        confirmLabel="Encerrar"
        pending={revoke.isPending}
        onConfirm={() =>
          revoke.mutate({ url: "/api/me/sessions/revoke-others", method: "POST" })
        }
        onCancel={() => setRevokingOthers(false)}
      />
    </div>
  );
}
