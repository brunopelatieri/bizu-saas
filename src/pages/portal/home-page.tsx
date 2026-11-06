import { useQuery } from "@tanstack/react-query";
import { PageTitle, QueryState } from "@/components/admin/query-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api/client";
import { usePortalAuth } from "@/providers/portal-auth-provider";

type PortalCustomerResponse = {
  tenant: { id: string; slug: string; name: string };
  customer: {
    name: string;
    email: string;
    phone: string | null;
    document: string | null;
  };
};

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all font-medium text-foreground">{value ?? "–"}</dd>
    </div>
  );
}

export function PortalHomePage() {
  const { active } = usePortalAuth();
  const query = useQuery({
    queryKey: ["portal-customer", active?.id],
    queryFn: () => apiFetch<PortalCustomerResponse>("/api/portal/customer"),
    enabled: Boolean(active),
    retry: false,
  });
  const data = query.data;

  return (
    <div className="space-y-6">
      <PageTitle
        title={data ? `Olá, ${data.customer.name.split(" ")[0]}` : "Início"}
        description={active ? `Seu cadastro em ${active.name}.` : undefined}
      />

      <QueryState {...query}>
        {data ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Seus dados</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <Row label="Nome" value={data.customer.name} />
                <Row label="E-mail" value={data.customer.email} />
                <Row label="Telefone" value={data.customer.phone} />
                <Row label="Documento" value={data.customer.document} />
              </dl>
            </CardContent>
          </Card>
        ) : null}
      </QueryState>
    </div>
  );
}
