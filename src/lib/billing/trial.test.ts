import { describe, expect, it } from "vitest";
import { billingState } from "@/lib/billing/state";
import {
  computeTrialEnd,
  DAY_MS,
  daysLeft,
  dueTrialNotice,
  initialSubscription,
} from "@/lib/billing/trial";

const now = new Date("2026-11-06T12:00:00Z");
const free = { id: "free-id", isFree: true };
const paid = { id: "pro-id", isFree: false };

describe("computeTrialEnd", () => {
  it("soma os dias ao início", () => {
    expect(computeTrialEnd(now, 14).toISOString()).toBe("2026-11-20T12:00:00.000Z");
  });

  it("0 dias termina no próprio início", () => {
    expect(computeTrialEnd(now, 0)).toEqual(now);
  });
});

describe("initialSubscription", () => {
  it("plano pago com trial vira trialing com fim calculado", () => {
    expect(
      initialSubscription({ plan: paid, trialDays: 14, fallback: free, now }),
    ).toEqual({
      planId: "pro-id",
      status: "trialing",
      trialEndsAt: computeTrialEnd(now, 14),
    });
  });

  it("plano gratuito é active e sem fim, com ou sem dias de trial", () => {
    for (const trialDays of [0, 14]) {
      expect(
        initialSubscription({ plan: free, trialDays, fallback: free, now }),
      ).toEqual({ planId: "free-id", status: "active", trialEndsAt: null });
    }
  });

  it("plano pago sem trial cai no gratuito, nunca vira acesso pago de graça", () => {
    expect(
      initialSubscription({ plan: paid, trialDays: 0, fallback: free, now }),
    ).toEqual({ planId: "free-id", status: "active", trialEndsAt: null });
  });

  it("sem plano utilizável, não cria assinatura", () => {
    expect(
      initialSubscription({ plan: paid, trialDays: 0, fallback: null, now }),
    ).toBeNull();
    expect(
      initialSubscription({ plan: null, trialDays: 14, fallback: null, now }),
    ).toBeNull();
  });
});

describe("dueTrialNotice", () => {
  const endsAt = new Date("2026-11-20T12:00:00Z");
  const at = (offsetMs: number) => new Date(endsAt.getTime() + offsetMs);

  it.each([
    ["faltando 10 dias", -10 * DAY_MS, null],
    ["faltando 3 dias", -3 * DAY_MS, "t3"],
    ["faltando 2 dias", -2 * DAY_MS, "t3"],
    ["faltando 1 dia", -DAY_MS, "t1"],
    ["faltando 1 hora", -60 * 60 * 1000, "t1"],
    ["no instante do fim", 0, "t0"],
    ["3 dias de carência", 3 * DAY_MS, "t0"],
    ["fim da carência de 7 dias", 7 * DAY_MS, "expired"],
    ["depois da carência", 20 * DAY_MS, "expired"],
  ] as const)("%s", (_label, offset, expected) => {
    expect(
      dueTrialNotice({ now: at(offset), trialEndsAt: endsAt, graceDays: 7 }),
    ).toBe(expected);
  });

  it("sem carência, o fim do trial já expira (sem aviso t0)", () => {
    expect(
      dueTrialNotice({ now: endsAt, trialEndsAt: endsAt, graceDays: 0 }),
    ).toBe("expired");
  });

  it("só devolve o aviso mais urgente: job parado não manda t3 a 1 dia do fim", () => {
    expect(
      dueTrialNotice({ now: at(-DAY_MS / 2), trialEndsAt: endsAt, graceDays: 7 }),
    ).toBe("t1");
  });
});

describe("daysLeft", () => {
  it("arredonda para cima e não fica negativo", () => {
    const endsAt = new Date(now.getTime() + 2.2 * DAY_MS);

    expect(daysLeft(now, endsAt)).toBe(3);
    expect(daysLeft(endsAt, now)).toBe(0);
  });
});

describe("billingState", () => {
  it.each([
    ["active", "full", "trialing", "trialing"],
    ["active", "full", "active", "active"],
    ["active", "full", null, "active"],
    ["active", "full", "expired", "active"],
    ["active", "read_only", "expired", "read_only"],
    ["active", "locked", "active", "locked"],
    ["suspended", "full", "active", "locked"],
    ["deleting", "locked", "trialing", "locked"],
  ] as const)(
    "status %s, acesso %s, assinatura %s → %s",
    (status, accessMode, subscriptionStatus, expected) => {
      expect(billingState({ status, accessMode, subscriptionStatus })).toBe(
        expected,
      );
    },
  );
});
