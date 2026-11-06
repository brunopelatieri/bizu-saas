import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { MetaFunction } from "react-router";
import { Pager } from "@/components/admin/pager";
import { PageTitle, QueryState } from "@/components/admin/query-state";
import {
  AuditActionFilter,
  AuditActorFilter,
} from "@/components/app/audit-filters";
import { type AuditItem, AuditTable } from "@/components/app/audit-table";
import { useTeam } from "@/components/app/team/team-api";
import { Can } from "@/components/auth/can";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";

export const meta: MetaFunction = () => [
  { title: "Auditoria — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

type AuditPage = {
  items: AuditItem[];
  total: number;
  page: number;
  pageSize: number;
};

function AuditLog() {
  const { tenant } = useAuth();
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [page, setPage] = useState(1);
  const team = useTeam();
  const params = new URLSearchParams({ page: String(page) });

  if (action) params.set("action", action);
  if (actor) params.set("actor", actor);

  const query = useQuery({
    queryKey: ["audit", tenant?.id, action, actor, page],
    queryFn: () => apiFetch<AuditPage>(`/api/audit?${params}`),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const members = (team.data?.members ?? []).map(({ userId, name }) => ({
    value: userId,
    label: name,
  }));

  return (
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
          <AuditActorFilter
            options={members}
            value={actor}
            onChange={(next) => {
              setActor(next);
              setPage(1);
            }}
          />
        </div>
        <QueryState {...query}>
          <AuditTable items={query.data?.items ?? []} />
          <Pager
            page={page}
            total={query.data?.total ?? 0}
            pageSize={query.data?.pageSize ?? 25}
            onPage={setPage}
          />
        </QueryState>
      </CardContent>
    </Card>
  );
}

export default function Audit() {
  return (
    <div className="max-w-5xl space-y-6">
      <PageTitle
        title="Auditoria"
        description="Quem fez o quê nesta organização, inclusive o suporte."
      />
      <Can
        resource="audit"
        action="read"
        fallback={
          <p className="text-sm text-muted-foreground">
            Você não tem permissão para ver a auditoria.
          </p>
        }
      >
        <AuditLog />
      </Can>
    </div>
  );
}
