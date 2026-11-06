import type {
  BillingPlan,
  BillingPrice,
  BillingProvider,
  SubscriptionView,
} from "@/components/app/billing/billing-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatMoney,
  INTERVAL_LABELS,
  type PaymentMethod,
  PAYMENT_METHOD_LABELS,
  PROVIDER_LABELS,
} from "@/lib/billing/constants";

type PlanPickerProps = {
  plans: BillingPlan[];
  providers: BillingProvider[];
  subscription: SubscriptionView | null;
  /** Sem `billing:manage` a lista só informa. */
  canManage: boolean;
  /** Sem dados de faturamento, a API recusaria o checkout. */
  profileReady: boolean;
  pending: boolean;
  onCheckout: (price: BillingPrice, method: PaymentMethod) => void;
  onChangePlan: (price: BillingPrice) => void;
};

function PriceRow({
  price,
  provider,
  showProvider,
  subscription,
  canManage,
  profileReady,
  pending,
  onCheckout,
  onChangePlan,
}: Omit<PlanPickerProps, "plans" | "providers"> & {
  price: BillingPrice;
  provider: BillingProvider | undefined;
  showProvider: boolean;
}) {
  const current = subscription?.planPriceId === price.id;
  const paid = subscription?.paid ?? false;
  // Troca de plano só entre preços do mesmo provedor e com o pagamento em dia: é a regra
  // de `changePlan`, repetida aqui para não oferecer um botão que a API recusa.
  const changeable =
    paid &&
    subscription?.provider === price.provider &&
    ["active", "trialing"].includes(subscription.status);

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-foreground">
        <span className="font-semibold">
          {formatMoney(price.amountCents, price.currency)}
        </span>{" "}
        / {INTERVAL_LABELS[price.interval]}
        {showProvider ? (
          <span className="text-muted-foreground">
            {" "}
            · {PROVIDER_LABELS[price.provider]}
          </span>
        ) : null}
      </p>

      {current && subscription?.pendingPlan && canManage ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => onChangePlan(price)}
        >
          Manter este plano
        </Button>
      ) : current ? (
        <Badge variant="secondary">Plano atual</Badge>
      ) : !canManage ? null : changeable ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => onChangePlan(price)}
        >
          Trocar para este plano
        </Button>
      ) : paid ? null : (
        <div className="flex flex-wrap gap-2">
          {provider?.methods.map((method) => (
            <Button
              key={method}
              size="sm"
              variant="outline"
              disabled={pending || !profileReady}
              onClick={() => onCheckout(price, method)}
            >
              {PAYMENT_METHOD_LABELS[method]}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Planos ativos e, em cada um, o que o provedor permite fazer. */
export function PlanPicker({ plans, providers, ...rest }: PlanPickerProps) {
  const paidPlans = plans.filter(({ isFree }) => !isFree);
  const showProvider = providers.length > 1;

  if (providers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        O pagamento on-line ainda não está disponível nesta plataforma.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {paidPlans.map((plan) => (
        <Card key={plan.id}>
          <CardHeader>
            <CardTitle>{plan.name}</CardTitle>
            {plan.description ? (
              <p className="text-sm text-muted-foreground">{plan.description}</p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            {plan.prices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem preço disponível no momento.
              </p>
            ) : (
              plan.prices.map((price) => (
                <PriceRow
                  key={price.id}
                  price={price}
                  provider={providers.find(({ id }) => id === price.provider)}
                  showProvider={showProvider}
                  {...rest}
                />
              ))
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
