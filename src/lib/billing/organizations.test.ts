import { describe, expect, it } from "vitest";
import {
  type OwnedOrganization,
  organizationAllowance,
  organizationLimitOf,
  UNPAID_ORGANIZATIONS_LIMIT,
} from "@/lib/billing/organizations";

const org = (overrides: Partial<OwnedOrganization> = {}): OwnedOrganization => ({
  tenantStatus: "active",
  subscriptionStatus: "active",
  planLimit: 3,
  ...overrides,
});

describe("organizationLimitOf", () => {
  it("assinatura em dia (ou na carência) vale o limite do plano", () => {
    expect(organizationLimitOf(org())).toBe(3);
    expect(organizationLimitOf(org({ subscriptionStatus: "past_due" }))).toBe(3);
  });

  it("plano sem a chave é ilimitado, como os demais limites", () => {
    expect(organizationLimitOf(org({ planLimit: undefined }))).toBeNull();
    expect(organizationLimitOf(org({ planLimit: null }))).toBeNull();
  });

  it("trial, vencida, cancelada, sem assinatura ou suspensa valem 1", () => {
    for (const subscriptionStatus of [
      "trialing",
      "expired",
      "unpaid",
      "canceled",
      "paused",
      null,
    ] as const) {
      expect(organizationLimitOf(org({ subscriptionStatus, planLimit: 10 }))).toBe(
        UNPAID_ORGANIZATIONS_LIMIT,
      );
    }
    expect(organizationLimitOf(org({ tenantStatus: "suspended", planLimit: 10 }))).toBe(1);
  });
});

describe("organizationAllowance", () => {
  it("a primeira organização sempre passa", () => {
    expect(organizationAllowance([])).toEqual({ limit: null, used: 0, allowed: true });
  });

  it("no trial (ou gratuito com limite 1), não cabe a segunda", () => {
    expect(organizationAllowance([org({ subscriptionStatus: "trialing" })])).toEqual({
      limit: 1,
      used: 1,
      allowed: false,
    });
    expect(organizationAllowance([org({ planLimit: 1 })]).allowed).toBe(false);
  });

  it("vale o maior limite entre as organizações da pessoa", () => {
    const owned = [org({ subscriptionStatus: "trialing" }), org({ planLimit: 3 })];

    expect(organizationAllowance(owned)).toEqual({ limit: 3, used: 2, allowed: true });
    expect(organizationAllowance([...owned, org({ planLimit: 2 })]).allowed).toBe(false);
  });

  it("um plano ilimitado em dia libera tudo", () => {
    const owned = [org({ planLimit: null }), org(), org(), org()];

    expect(organizationAllowance(owned)).toEqual({ limit: null, used: 4, allowed: true });
  });
});
