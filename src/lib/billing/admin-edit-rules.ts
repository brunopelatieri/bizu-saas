import type { SubscriptionStatus } from "@/db/schema/billing";
import { DAY_MS, dueTrialNotice, trialNotices } from "@/lib/billing/trial";

/**
 * Regras puras da edição de assinatura pelo admin (`docs/specs/admin-crud/spec.md`, seção 5).
 * Sem banco: `admin-edit.ts` grava, e a tela de `/admin/assinaturas` usa as mesmas tabelas
 * para mostrar só os destinos e campos permitidos.
 */

export type AdminDateField = "trialEndsAt" | "currentPeriodEnd" | "graceUntil";

/** Campo de data que cada status aceita. `canceled` e `expired` não têm data editável. */
export const EDITABLE_FIELD: Record<SubscriptionStatus, AdminDateField | null> = {
  trialing: "trialEndsAt",
  active: "currentPeriodEnd",
  past_due: "graceUntil",
  unpaid: "currentPeriodEnd",
  paused: "currentPeriodEnd",
  canceled: null,
  expired: null,
};

/** Para → de. `canceled` não entra: cancelar é a ação "Excluir", que encerra no provedor. */
const MANUAL_TRANSITIONS: Partial<Record<SubscriptionStatus, readonly SubscriptionStatus[]>> = {
  trialing: ["active", "past_due", "unpaid", "expired"],
  active: ["trialing", "past_due", "unpaid", "paused", "canceled", "expired"],
  past_due: ["active", "trialing"],
  unpaid: ["active", "past_due", "trialing"],
  paused: ["active"],
  expired: ["trialing", "unpaid", "past_due"],
};

/** Com provedor, só pausa e retomada: o resto do status vem dos pagamentos lá. */
const PROVIDER_TRANSITIONS: Partial<Record<SubscriptionStatus, readonly SubscriptionStatus[]>> = {
  paused: ["active"],
  active: ["paused"],
};

const CLOSED: readonly SubscriptionStatus[] = ["canceled", "expired"];

/** Destinos que a tela oferece para o status atual, na ordem da tabela. */
export function allowedTargets(
  from: SubscriptionStatus,
  providerManaged: boolean,
): SubscriptionStatus[] {
  const table = providerManaged ? PROVIDER_TRANSITIONS : MANUAL_TRANSITIONS;

  return (Object.keys(table) as SubscriptionStatus[]).filter((to) =>
    table[to]?.includes(from),
  );
}

export type AdminEditCurrent = {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  graceUntil: Date | null;
  /** `isProviderManaged`: cobrança viva no provedor. */
  providerManaged: boolean;
  planIsFree: boolean;
  /** `metadata.paidThrough`, para a retomada com provedor decidir se cobra na hora. */
  paidThrough: Date | null;
};

export type AdminEditInput = {
  status?: SubscriptionStatus;
  trialEndsAt?: Date;
  currentPeriodEnd?: Date;
  graceUntil?: Date;
};

/** O que vai ao provedor antes da transação local. `local`: nada (só regra nossa). */
export type ProviderAction =
  | { kind: "local" }
  | { kind: "schedule"; trialEnd?: Date; nextBillingAt?: Date }
  | { kind: "pause" }
  | { kind: "resume"; chargeNow: boolean };

export type AdminEditPlan = {
  from: SubscriptionStatus;
  to: SubscriptionStatus;
  /** Campos da assinatura, além do status. */
  patch: {
    trialEndsAt?: Date;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    graceUntil?: Date | null;
    canceledAt?: null;
    cancelAtPeriodEnd?: false;
    /** Saindo de encerrada, a referência antiga do provedor não volta a valer. */
    providerSubscriptionRef?: null;
    provider?: null;
  };
  accessMode?: "full" | "read_only";
  clearDunningNotices?: boolean;
  /** `reset`: trial novo, sem avisos. `reopen`: só os avisos que voltaram a ser futuros saem. */
  trialNotices?: "reset" | "reopen";
  /** `organization.trial_ends_at` acompanha o fim do trial. */
  organizationTrialEndsAt?: Date;
  /** `metadata.paidThrough` (pausa). */
  paidThrough?: Date;
  /** Os campos alterados, para a auditoria. */
  fields: string[];
  /** Só com provedor. */
  provider?: ProviderAction;
};

export type AdminEditError = {
  status: 400 | 409;
  code:
    | "SUBSCRIPTION_CLOSED"
    | "FIELD_NOT_APPLICABLE"
    | "STATUS_NOT_ALLOWED"
    | "PROVIDER_STATUS_MANAGED"
    | "FREE_PLAN"
    | "INVALID_DATE";
  message: string;
};

export type AdminEditResult =
  | { ok: true; plan: AdminEditPlan }
  | { ok: false; error: AdminEditError };

const fail = (
  status: AdminEditError["status"],
  code: AdminEditError["code"],
  message: string,
): AdminEditResult => ({ ok: false, error: { status, code, message } });

const invalidDate = (message: string) => fail(400, "INVALID_DATE", message);

const FIELD_LABELS: Record<AdminDateField, string> = {
  trialEndsAt: "o fim do teste",
  currentPeriodEnd: "o vencimento",
  graceUntil: "o fim da carência",
};

const future = (date: Date, now: Date) => date.getTime() > now.getTime();

/** Teto contra erro de digitação (ano 20266): nenhuma data editada passa de 5 anos. */
export const MAX_AHEAD_MS = 5 * 366 * DAY_MS;

/**
 * Avisos de trial que continuam valendo com o fim novo: os que já seriam devidos agora. Os
 * outros saem do registro, e o `billing.trial` os manda de novo no prazo novo.
 */
export function keptTrialNotices(
  sent: Partial<Record<string, string>> | undefined,
  input: { now: Date; trialEndsAt: Date; graceDays: number },
): Partial<Record<string, string>> {
  // A ordem de `trialNotices` é a do prazo: devido o `t1`, o `t3` também já passou.
  const due = dueTrialNotice(input);
  const last = due ? trialNotices.indexOf(due) : -1;
  const kept: Partial<Record<string, string>> = {};

  trialNotices.forEach((notice, index) => {
    const at = sent?.[notice];
    if (at && index <= last) kept[notice] = at;
  });

  return kept;
}

/**
 * Decide a edição: datas do status (tabela "Datas") e mudança de status com os efeitos que
 * deixam assinatura, tenant e jobs coerentes (tabela "Status"). Com provedor, diz também o
 * que pedir a ele. Não grava nada.
 */
export function adminStatusChange(
  current: AdminEditCurrent,
  input: AdminEditInput,
  context: { now: Date; graceDays: number },
): AdminEditResult {
  const { now, graceDays } = context;
  const from = current.status;
  const to = input.status ?? from;
  const statusChanged = to !== from;

  if (current.planIsFree) {
    return fail(409, "FREE_PLAN", "Plano gratuito não tem cobrança para editar.");
  }

  if (to === "canceled" && statusChanged) {
    return fail(
      409,
      "STATUS_NOT_ALLOWED",
      "Para cancelar, use \"Excluir\": encerra no provedor e grava tudo.",
    );
  }

  if (!statusChanged && CLOSED.includes(from)) {
    return fail(409, "SUBSCRIPTION_CLOSED", "Assinatura encerrada não tem datas para editar.");
  }

  // Só o campo do status de destino.
  const editable = EDITABLE_FIELD[to];
  const sent = (["trialEndsAt", "currentPeriodEnd", "graceUntil"] as const).filter(
    (field) => input[field] !== undefined,
  );
  const wrong = sent.find((field) => field !== editable);
  if (wrong) {
    return fail(
      409,
      "FIELD_NOT_APPLICABLE",
      editable
        ? `Neste status só se edita ${FIELD_LABELS[editable]}.`
        : "Neste status não há data editável.",
    );
  }

  const tooFar = sent.some(
    (field) => (input[field] as Date).getTime() > now.getTime() + MAX_AHEAD_MS,
  );
  if (tooFar) return invalidDate("Data muito distante: confira o ano.");

  if (current.providerManaged) {
    return providerChange(current, input, { to, statusChanged, now });
  }

  if (statusChanged && !MANUAL_TRANSITIONS[to]?.includes(from)) {
    return fail(409, "STATUS_NOT_ALLOWED", "Esta mudança de status não é permitida.");
  }

  const plan: AdminEditPlan = { from, to, patch: {}, fields: [...sent] };
  if (statusChanged) plan.fields.unshift("status");

  // Saindo de encerrada (expired → trialing/active), a assinatura volta a ser só manual.
  if (statusChanged && CLOSED.includes(from)) {
    plan.patch.canceledAt = null;
    plan.patch.cancelAtPeriodEnd = false;
    plan.patch.providerSubscriptionRef = null;
    plan.patch.provider = null;
  }

  switch (to) {
    case "trialing": {
      const end = input.trialEndsAt;
      if (!statusChanged && !end) return nothing();
      // Trial novo exige o fim no mesmo pedido: o antigo já passou ou era de outro trial.
      if (!end || !future(end, now)) {
        return invalidDate("Informe o fim do teste, no futuro.");
      }

      plan.patch.trialEndsAt = end;
      plan.organizationTrialEndsAt = end;
      plan.trialNotices = statusChanged ? "reset" : "reopen";
      if (statusChanged) {
        plan.patch.graceUntil = null;
        plan.accessMode = "full";
        plan.clearDunningNotices = true;
      }
      return { ok: true, plan };
    }

    case "active": {
      const end = input.currentPeriodEnd ?? current.currentPeriodEnd;
      if (!end) return invalidDate("Informe o vencimento.");
      // Data no passado só numa edição de `active`: vence na próxima rodada do job.
      if (statusChanged && !future(end, now)) {
        return invalidDate("Informe um vencimento no futuro.");
      }
      if (input.currentPeriodEnd) {
        const start = current.currentPeriodStart;
        if (start && end.getTime() <= start.getTime()) {
          return invalidDate("O vencimento precisa ser depois do início do período.");
        }
        plan.patch.currentPeriodEnd = end;
        if (!start) plan.patch.currentPeriodStart = earlier(now, end);
      } else if (!current.currentPeriodStart) {
        plan.patch.currentPeriodStart = earlier(now, end);
      }
      if (!statusChanged) return input.currentPeriodEnd ? { ok: true, plan } : nothing();

      plan.patch.graceUntil = null;
      plan.patch.canceledAt = null;
      plan.accessMode = "full";
      plan.clearDunningNotices = true;
      return { ok: true, plan };
    }

    case "past_due": {
      if (input.graceUntil && !future(input.graceUntil, now)) {
        return invalidDate("A carência precisa terminar no futuro.");
      }
      if (!statusChanged) return input.graceUntil ? withGrace(plan, input.graceUntil) : nothing();

      return withGrace(plan, input.graceUntil ?? new Date(now.getTime() + graceDays * DAY_MS));
    }

    case "unpaid":
    case "paused": {
      const end = input.currentPeriodEnd;
      if (end) {
        if (!future(end, now)) return invalidDate("Informe um vencimento no futuro.");
        const start = current.currentPeriodStart;
        if (start && end.getTime() <= start.getTime()) {
          return invalidDate("O vencimento precisa ser depois do início do período.");
        }
        plan.patch.currentPeriodEnd = end;
      }
      if (to === "paused" && (statusChanged || end)) {
        const through = end ?? current.currentPeriodEnd;
        if (through) plan.paidThrough = through;
      }
      if (!statusChanged) return end ? { ok: true, plan } : nothing();

      plan.accessMode = "read_only";
      return { ok: true, plan };
    }

    case "expired":
      plan.accessMode = "read_only";
      return { ok: true, plan };

    default:
      return fail(409, "STATUS_NOT_ALLOWED", "Esta mudança de status não é permitida.");
  }
}

/** Assinatura viva no provedor: datas pelo `updateSubscriptionSchedule`, pausa pelos métodos dela. */
function providerChange(
  current: AdminEditCurrent,
  input: AdminEditInput,
  { to, statusChanged, now }: { to: SubscriptionStatus; statusChanged: boolean; now: Date },
): AdminEditResult {
  const from = current.status;

  if (statusChanged) {
    if (!PROVIDER_TRANSITIONS[to]?.includes(from)) {
      return fail(
        409,
        "PROVIDER_STATUS_MANAGED",
        "O status desta assinatura vem dos pagamentos no provedor.",
      );
    }
    // Pausar ou retomar já mexe no ciclo lá: data junto ficaria sem dono.
    if (input.currentPeriodEnd || input.trialEndsAt || input.graceUntil) {
      return fail(409, "FIELD_NOT_APPLICABLE", "Pause ou retome sem mudar datas junto.");
    }

    const paidThrough = current.paidThrough ?? current.currentPeriodEnd;

    return {
      ok: true,
      plan: {
        from,
        to,
        patch: {},
        fields: ["status"],
        provider:
          to === "paused"
            ? { kind: "pause" }
            : // Período pago vencido durante a pausa: volta pagando (como a retomada do owner).
              { kind: "resume", chargeNow: !paidThrough || paidThrough <= now },
      },
    };
  }

  const plan: AdminEditPlan = { from, to, patch: {}, fields: [] };

  if (input.graceUntil) {
    // A carência é regra nossa, não do provedor.
    if (!future(input.graceUntil, now)) {
      return invalidDate("A carência precisa terminar no futuro.");
    }
    plan.fields.push("graceUntil");
    plan.provider = { kind: "local" };
    return withGrace(plan, input.graceUntil);
  }

  if (input.trialEndsAt) {
    if (!future(input.trialEndsAt, now)) return invalidDate("Informe o fim do teste, no futuro.");
    plan.fields.push("trialEndsAt");
    plan.provider = { kind: "schedule", trialEnd: input.trialEndsAt };
    return { ok: true, plan };
  }

  if (input.currentPeriodEnd) {
    // O provedor só agenda para a frente.
    if (!future(input.currentPeriodEnd, now)) {
      return invalidDate("Informe um vencimento no futuro.");
    }
    plan.fields.push("currentPeriodEnd");
    plan.provider = { kind: "schedule", nextBillingAt: input.currentPeriodEnd };
    return { ok: true, plan };
  }

  return nothing();
}

function withGrace(plan: AdminEditPlan, graceUntil: Date): AdminEditResult {
  plan.patch.graceUntil = graceUntil;
  return { ok: true, plan };
}

function earlier(a: Date, b: Date) {
  return a.getTime() < b.getTime() ? a : b;
}

function nothing(): AdminEditResult {
  return fail(409, "FIELD_NOT_APPLICABLE", "Nada para alterar neste status.");
}
