import { Link } from "react-router";
import {
  type Page,
  useAdminMutation,
  useAdminQuery,
  useIsPlatformOwner,
} from "@/components/admin/admin-api";
import { Pager } from "@/components/admin/pager";
import { QueryState } from "@/components/admin/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PortalUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  tenants: number;
  sessions: number;
};

/** Clientes e leads. Não há banimento: o acesso é de cada tenant, por `customer.status`. */
export function PortalUsersCard({
  q,
  page,
  onPage,
}: {
  q: string;
  page: number;
  onPage: (page: number) => void;
}) {
  const owner = useIsPlatformOwner();
  const query = useAdminQuery<Page<PortalUser>>("/api/admin/users", {
    q,
    page,
    scope: "portal",
  });
  const revoke = useAdminMutation("Sessões do portal encerradas.");

  return (
    <QueryState {...query}>
      {query.data ? (
        <Card>
          <CardContent className="pt-6">
            {query.data.items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum cliente encontrado.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Organizações</TableHead>
                    <TableHead className="text-right">Sessões</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.items.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        <Link to={`/admin/usuarios/portal/${user.id}`} className="hover:underline">
                          {user.name}
                        </Link>
                      </TableCell>
                      <TableCell className="break-all">{user.email}</TableCell>
                      <TableCell>
                        {user.emailVerified ? null : (
                          <Badge variant="outline">Sem verificação</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{user.tenants}</TableCell>
                      <TableCell className="text-right">{user.sessions}</TableCell>
                      <TableCell className="text-right">
                        {owner && user.sessions > 0 ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={revoke.isPending}
                            onClick={() =>
                              revoke.mutate({
                                path: `/api/admin/portal-users/${user.id}/revoke-sessions`,
                                method: "POST",
                              })
                            }
                          >
                            Encerrar sessões
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <Pager
              page={page}
              total={query.data.total}
              pageSize={query.data.pageSize}
              onPage={onPage}
            />
          </CardContent>
        </Card>
      ) : null}
    </QueryState>
  );
}
