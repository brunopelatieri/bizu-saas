import { describe, expect, it } from "vitest";
import { derivePortalSecret } from "@/lib/auth/portal";
import { isAvailable } from "@/lib/portal/access";

describe("isAvailable", () => {
  const open = {
    status: "active",
    tenantStatus: "active",
    accessMode: "full",
  } as const;

  it("cliente ativo em tenant aberto entra", () => {
    expect(isAvailable(open)).toBe(true);
    expect(isAvailable({ ...open, accessMode: "read_only" })).toBe(true);
  });

  it.each([
    [{ ...open, status: "lead" as const }],
    [{ ...open, status: "blocked" as const }],
    [{ ...open, tenantStatus: "suspended" as const }],
    [{ ...open, accessMode: "locked" as const }],
  ])("%j não entra", (row) => {
    expect(isAvailable(row)).toBe(false);
  });
});

describe("derivePortalSecret", () => {
  it("é estável e diferente do segredo de origem", () => {
    const derived = derivePortalSecret("segredo-de-teste");

    expect(derived).toBe(derivePortalSecret("segredo-de-teste"));
    expect(derived).not.toBe("segredo-de-teste");
    expect(derived).not.toBe(derivePortalSecret("outro-segredo"));
  });
});
