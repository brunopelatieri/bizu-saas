import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { auditActionLabel } from "@/lib/constants/audit-labels";

export type AuditItem = {
  id: string;
  action: string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
  /** Só em `/app/auditoria`: a ação veio do suporte da plataforma. */
  support?: boolean;
  /** Só em `/admin/auditoria`. */
  tenantName?: string | null;
  impersonatorId?: string | null;
};

const ACTOR_LABELS: Record<string, string> = {
  platform: "Plataforma",
  portal_user: "Cliente",
  system: "Sistema",
};

const formatDateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR");

function actorOf({ actorName, actorType }: AuditItem) {
  return actorName ?? ACTOR_LABELS[actorType] ?? "Removido";
}

export function AuditTable({
  items,
  showTenant = false,
}: {
  items: AuditItem[];
  showTenant?: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum evento encontrado.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Quando</TableHead>
          {showTenant ? <TableHead>Organização</TableHead> : null}
          <TableHead>Ação</TableHead>
          <TableHead>Quem</TableHead>
          <TableHead>Alvo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="whitespace-nowrap">
              {formatDateTime(item.createdAt)}
            </TableCell>
            {showTenant ? <TableCell>{item.tenantName ?? "–"}</TableCell> : null}
            <TableCell>
              <span title={item.action}>{auditActionLabel(item.action)}</span>
            </TableCell>
            <TableCell>
              {actorOf(item)}
              {item.support || item.impersonatorId ? (
                <Badge variant="outline" className="ml-2">
                  Suporte
                </Badge>
              ) : null}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {item.targetType ?? "–"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
