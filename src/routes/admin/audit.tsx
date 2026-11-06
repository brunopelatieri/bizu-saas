import { useState } from "react";
import type { MetaFunction } from "react-router";
import { type Page, useAdminQuery } from "@/components/admin/admin-api";
import { Pager } from "@/components/admin/pager";
import { PageTitle, QueryState } from "@/components/admin/query-state";
import { AuditActionFilter } from "@/components/app/audit-filters";
import { type AuditItem, AuditTable } from "@/components/app/audit-table";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { z } from "zod";

export const meta: MetaFunction = () => [
  { title: "Auditoria — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

const validId = (value: string) => z.uuid().safeParse(value.trim()).success;

export default function AdminAudit() {
  const [action, setAction] = useState("");
  const [tenant, setTenant] = useState("");
  const [actor, setActor] = useState("");
  const [page, setPage] = useState(1);
  const query = useAdminQuery<Page<AuditItem>>("/api/admin/audit", {
    action,
    // Id pela metade não vai à API: só depois de colado por inteiro.
    tenant: validId(tenant) ? tenant.trim() : undefined,
    actor: validId(actor) ? actor.trim() : undefined,
    page,
  });

  return (
    <div className="max-w-6xl space-y-6">
      <PageTitle
        title="Auditoria"
        description="Log de toda a plataforma, inclusive os eventos de conta, sem organização."
      />
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <AuditActionFilter
              value={action}
              onChange={(next) => {
                setAction(next);
                setPage(1);
              }}
            />
            <Input
              aria-label="Id da organização"
              placeholder="Id da organização"
              value={tenant}
              onChange={(event) => {
                setTenant(event.target.value);
                setPage(1);
              }}
              className="w-80"
            />
            <Input
              aria-label="Id de quem agiu"
              placeholder="Id de quem agiu"
              value={actor}
              onChange={(event) => {
                setActor(event.target.value);
                setPage(1);
              }}
              className="w-80"
            />
          </div>
          <QueryState {...query}>
            <AuditTable items={query.data?.items ?? []} showTenant />
            <Pager
              page={page}
              total={query.data?.total ?? 0}
              pageSize={query.data?.pageSize ?? 25}
              onPage={setPage}
            />
          </QueryState>
        </CardContent>
      </Card>
    </div>
  );
}
