import { describe, expect, it, vi } from "vitest";
import {
  assertWithinLimit,
  checkLimit,
  evaluateLimit,
  type LimitSource,
} from "@/lib/billing/limits";
import { TenantRuleError } from "@/lib/tenant/errors";

function source(limits: Record<string, number | null>, used = 0) {
  const usedFn = vi.fn(async () => used);
  const fake: LimitSource = { limits: async () => limits, used: usedFn };

  return { fake, usedFn };
}

describe("evaluateLimit", () => {
  it("sem limite sempre cabe", () => {
    expect(evaluateLimit("members", null, 9999).allowed).toBe(true);
    expect(evaluateLimit("members", undefined, 9999).allowed).toBe(true);
  });

  it("cabe enquanto o uso for menor que o limite", () => {
    expect(evaluateLimit("members", 2, 0).allowed).toBe(true);
    expect(evaluateLimit("members", 2, 1).allowed).toBe(true);
    expect(evaluateLimit("members", 2, 2).allowed).toBe(false);
    expect(evaluateLimit("members", 2, 5).allowed).toBe(false);
  });

  it("limite 0 não deixa criar nada", () => {
    expect(evaluateLimit("customers", 0, 0).allowed).toBe(false);
  });
});

describe("checkLimit", () => {
  it("usa o limite do plano e o uso corrente", async () => {
    const { fake } = source({ members: 2 }, 2);

    expect(await checkLimit("t1", "members", { source: fake })).toEqual({
      metric: "members",
      limit: 2,
      used: 2,
      allowed: false,
    });
  });

  it("métrica sem limite no plano é ilimitada e nem conta o uso", async () => {
    const { fake, usedFn } = source({ members: 2 });

    const result = await checkLimit("t1", "customers", { source: fake });

    expect(result.allowed).toBe(true);
    expect(result.limit).toBeNull();
    expect(usedFn).not.toHaveBeenCalled();
  });

  it("repassa a quem conta quais convites ignorar", async () => {
    const { fake, usedFn } = source({ members: 5 }, 1);

    await checkLimit("t1", "members", {
      source: fake,
      ignoreInvitationEmail: "a@b.c",
    });

    expect(usedFn).toHaveBeenCalledWith("t1", "members", {
      ignoreInvitationEmail: "a@b.c",
      source: fake,
    });
  });
});

describe("assertWithinLimit", () => {
  it("passa quando cabe", async () => {
    const { fake } = source({ members: 3 }, 2);

    await expect(
      assertWithinLimit("t1", "members", { source: fake }),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("lança 403 PLAN_LIMIT_REACHED quando não cabe", async () => {
    const { fake } = source({ members: 2 }, 2);

    const error = await assertWithinLimit("t1", "members", {
      source: fake,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TenantRuleError);
    expect(error).toMatchObject({ status: 403, code: "PLAN_LIMIT_REACHED" });
    expect((error as Error).message).toContain("2 membros");
  });
});
