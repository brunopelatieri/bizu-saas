import { useCallback, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { PageTitle, QueryState } from "@/components/admin/query-state";
import { useCan } from "@/components/auth/can";
import { BillingProfileForm } from "@/components/app/billing/billing-profile-form";
import {
  type BillingPrice,
  type BillingProvider,
  type CheckoutResponse,
  type SubscriptionView,
  useBillingMutation,
  useBillingPlans,
  useSubscription,
} from "@/components/app/billing/billing-api";
import { InlineCheckout } from "@/components/app/billing/inline-checkout";
import { InvoiceTable } from "@/components/app/billing/invoice-table";
import { PlanPicker } from "@/components/app/billing/plan-picker";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type PaymentMethod,
  SUBSCRIPTION_STATUS_LABELS,
} from "@/lib/billing/constants";
import { useAuth } from "@/providers/auth-provider";
import { useQueryClient } from "@tanstack/react-query";

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : null;

/** O que a data significa muda com o estado da assinatura. */
function periodLine(subscription: SubscriptionView) {
  const { status, cancelAtPeriodEnd, currentPeriodEnd, trialEndsAt, graceUntil } =
    subscription;

  if (status === "past_due" && graceUntil) {
    return `Regularize o pagamento até ${formatDate(graceUntil)}.`;
  }
  if (cancelAtPeriodEnd && currentPeriodEnd) {
    return `Cancelada: o acesso segue até ${formatDate(currentPeriodEnd)}.`;
  }
  if (status === "trialing" && trialEndsAt) {
    return `Período de teste até ${formatDate(trialEndsAt)}.`;
  }
  if (status === "active" && currentPeriodEnd) {
    return `Próxima cobrança em ${formatDate(currentPeriodEnd)}.`;
  }

  return null;
}

type SubscriptionCardProps = {
  subscription: SubscriptionView;
  provider: BillingProvider | undefined;
  canManage: boolean;
};

function SubscriptionCard({
  subscription,
  provider,
  canManage,
}: SubscriptionCardProps) {
  const [confirming, setConfirming] = useState(false);
  const cancel = useBillingMutation("Cancelamento agendado.");
  const reactivate = useBillingMutation("Assinatura mantida.");
  const pause = useBillingMutation("Assinatura pausada.");
  const portal = useBillingMutation<{ url: string }>();
  const pending =
    cancel.isPending || reactivate.isPending || pause.isPending || portal.isPending;
  const { status, cancelAtPeriodEnd, paid, pendingPlan, plan } = subscription;
  const line = periodLine(subscription);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {plan.name}
          <Badge variant={status === "past_due" ? "destructive" : "secondary"}>
            {SUBSCRIPTION_STATUS_LABELS[status]}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        {line ? <p>{line}</p> : null}
        {pendingPlan ? (
          <p>O plano muda para {pendingPlan.name} no fim do período.</p>
        ) : null}

        {canManage ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {provider?.customerPortal && paid ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  portal.mutate(
                    { path: "/api/billing/portal" },
                    {
                      onSuccess: ({ url }) => {
                        window.location.assign(url);
                      },
                    },
                  )
                }
              >
                Gerenciar pagamento
              </Button>
            ) : null}
            {cancelAtPeriodEnd || status === "paused" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => reactivate.mutate({ path: "/api/billing/reactivate" })}
              >
                {status === "paused" ? "Retomar assinatura" : "Manter assinatura"}
              </Button>
            ) : null}
            {provider?.pause && paid && status === "active" && !cancelAtPeriodEnd ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => pause.mutate({ path: "/api/billing/pause" })}
              >
                Pausar
              </Button>
            ) : null}
            {paid && !cancelAtPeriodEnd ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setConfirming(true)}
              >
                Cancelar assinatura
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>

      <ConfirmDialog
        open={confirming}
        title="Cancelar a assinatura?"
        description="O acesso segue até o fim do período já pago. Você pode desfazer até lá."
        confirmLabel="Cancelar assinatura"
        pending={cancel.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          cancel.mutate(
            { path: "/api/billing/cancel", body: { atPeriodEnd: true } },
            { onSettled: () => setConfirming(false) },
          )
        }
      />
    </Card>
  );
}

/**
 * `/app/assinatura`. Todo dado vem de `/api/billing/*` e os botões seguem as permissões e
 * as capacidades do provedor; a regra de verdade está na API.
 */
export function SubscriptionPage() {
  const can = useCan();
  const canManage = can("billing", "manage");
  const queryClient = useQueryClient();
  const { refresh } = useAuth();
  const subscription = useSubscription();
  const plans = useBillingPlans();
  const [inline, setInline] = useState<Extract<
    CheckoutResponse,
    { kind: "inline" }
  > | null>(null);
  const checkout = useBillingMutation<CheckoutResponse>();
  const changePlan = useBillingMutation<{ change: { effectiveAt: string } }>();
  const view = subscription.data;
  const current = view?.subscription ?? null;
  const provider = plans.data?.providers.find(({ id }) => id === current?.provider);

  // O banner e os limites vêm de `/api/me`: o pagamento confirmado precisa chegar lá também.
  const refreshPaid = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["billing"] });
    void refresh();
  }, [queryClient, refresh]);

  function startCheckout(price: BillingPrice, method: PaymentMethod) {
    checkout.mutate(
      {
        path: "/api/billing/checkout",
        body: { planPriceId: price.id, method },
      },
      {
        onSuccess: (result) => {
          if (result.kind === "redirect") window.location.assign(result.url);
          else setInline(result);
        },
      },
    );
  }

  function selectPlan(price: BillingPrice) {
    changePlan.mutate(
      {
        path: "/api/billing/change-plan",
        body: { planPriceId: price.id },
      },
      {
        onSuccess: ({ change }) =>
          toast.success(
            change.effectiveAt === "now"
              ? "Plano alterado."
              : "O plano muda no fim do período.",
          ),
      },
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageTitle
        title="Assinatura"
        description="Plano, forma de pagamento e faturas da organização."
      />

      <QueryState {...subscription}>
        {view ? (
          <>
            {current ? (
              <SubscriptionCard
                subscription={current}
                provider={provider}
                canManage={canManage}
              />
            ) : null}

            {inline ? (
              <InlineCheckout checkout={inline} onPaid={refreshPaid} />
            ) : null}

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Planos</h2>
              {canManage && !view.profile ? (
                <p className="text-sm text-muted-foreground">
                  Preencha os dados de faturamento para assinar.
                </p>
              ) : null}
              <QueryState {...plans}>
                {plans.data ? (
                  <PlanPicker
                    plans={plans.data.plans}
                    providers={plans.data.providers}
                    subscription={current}
                    canManage={canManage}
                    profileReady={view.profile !== null}
                    pending={checkout.isPending || changePlan.isPending}
                    onCheckout={startCheckout}
                    onChangePlan={selectPlan}
                  />
                ) : null}
              </QueryState>
            </section>

            <BillingProfileForm
              key={view.profile?.document ?? "novo"}
              profile={view.profile}
              readOnly={!canManage}
            />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  Últimas faturas
                  <Link
                    to="/app/assinatura/faturas"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Ver todas
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <InvoiceTable invoices={view.invoices} />
              </CardContent>
            </Card>
          </>
        ) : null}
      </QueryState>
    </div>
  );
}
