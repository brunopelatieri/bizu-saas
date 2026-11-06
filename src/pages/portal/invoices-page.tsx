import { Receipt } from "lucide-react";
import { PageTitle } from "@/components/admin/query-state";
import { Card, CardContent } from "@/components/ui/card";

/** Reservada ao fluxo em que o owner cobra seus clientes, fora desta entrega. */
export function PortalInvoicesPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Faturas" />
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Receipt className="mb-4 size-10 text-muted-foreground/40" />
          <p className="font-medium text-muted-foreground">Em breve</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Suas faturas aparecerão aqui.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
