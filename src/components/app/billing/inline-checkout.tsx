import { Check, Copy } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import {
  type CheckoutResponse,
  useInvoicePolling,
} from "@/components/app/billing/billing-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type InlineCheckoutData = Extract<CheckoutResponse, { kind: "inline" }>;

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copiado.");
  } catch {
    toast.error("Não foi possível copiar. Selecione o texto.");
  }
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="break-all rounded-lg bg-muted p-3 font-mono text-xs text-foreground">
        {value}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={() => copy(value)}>
        <Copy className="size-4" />
        Copiar
      </Button>
    </div>
  );
}

/**
 * Pix e boleto na própria página. Quem confirma é o webhook: a tela só consulta a fatura
 * local a cada 5 s, e o `paid` que importa é o que veio do banco.
 */
export function InlineCheckout({
  checkout,
  onPaid,
}: {
  checkout: InlineCheckoutData;
  onPaid: () => void;
}) {
  const { data } = useInvoicePolling(checkout.invoiceId);
  const status = data?.invoice.status ?? "open";

  useEffect(() => {
    if (status === "paid") onPaid();
  }, [status, onPaid]);

  if (status === "paid") {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 pt-6 text-sm text-foreground">
          <Check className="size-5 text-primary" />
          Pagamento confirmado.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aguardando pagamento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {checkout.pixPayload ? (
          <CopyField label="Pix copia e cola" value={checkout.pixPayload} />
        ) : null}
        {checkout.boletoLine ? (
          <CopyField label="Linha digitável" value={checkout.boletoLine} />
        ) : null}
        {checkout.boletoUrl ? (
          <a
            href={checkout.boletoUrl}
            target="_blank"
            rel="noreferrer"
            className="block text-sm font-medium text-primary hover:underline"
          >
            Abrir boleto
          </a>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Válido até {new Date(checkout.expiresAt).toLocaleString("pt-BR")}. Esta
          página atualiza sozinha quando o pagamento for confirmado.
        </p>
      </CardContent>
    </Card>
  );
}
