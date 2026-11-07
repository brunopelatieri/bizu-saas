import { describe, expect, it } from "vitest";
import { schemaIsBehind } from "@/db/schema-status";

/** Com o banco real e o papel de runtime (`bizu_app`), o que a subida do app enxerga. */
describe("conferência das migrations", () => {
  it("bizu_app lê a tabela do Drizzle e o banco migrado está em dia", async () => {
    expect(await schemaIsBehind()).toBe(false);
  });

  it("acusa quando o build espera uma migration que o banco não tem", async () => {
    const farFuture = Date.UTC(2999, 0, 1);

    await expect(schemaIsBehind(undefined, farFuture)).resolves.toBe(true);
  });
});
