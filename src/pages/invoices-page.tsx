import { Link } from "react-router";
import { PageTitle, QueryState } from "@/components/admin/query-state";
import { useInvoices } from "@/components/app/billing/billing-api";
import { InvoiceTable } from "@/components/app/billing/invoice-table";
import { Card, CardContent } from "@/components/ui/card";

export function InvoicesPage() {
  const query = useInvoices();

  return (
    <div className="max-w-4xl space-y-6">
      <PageTitle title="Faturas" description="Histórico de cobranças da organização." />

      <QueryState {...query}>
        {query.data ? (
          <Card>
            <CardContent className="pt-6">
              <InvoiceTable invoices={query.data.invoices} />
            </CardContent>
          </Card>
        ) : null}
      </QueryState>

      <Link
        to="/app/assinatura"
        className="text-sm font-medium text-primary hover:underline"
      >
        Voltar para a assinatura
      </Link>
    </div>
  );
}
