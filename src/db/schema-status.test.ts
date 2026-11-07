import { describe, expect, it } from "vitest";
import { schemaIsBehind } from "@/db/schema-status";

const EXPECTED = 2000;
const applied = (last: number | null) => async () => last;

function failingWith(error: unknown) {
  return async () => {
    throw error;
  };
}

describe("schemaIsBehind", () => {
  it("em dia quando o banco chegou na última migration do build", async () => {
    expect(await schemaIsBehind(applied(EXPECTED), EXPECTED)).toBe(false);
  });

  it("em dia com o banco à frente: as migrations rodam antes da imagem nova", async () => {
    expect(await schemaIsBehind(applied(EXPECTED + 1), EXPECTED)).toBe(false);
  });

  it("atrasado quando falta migration", async () => {
    expect(await schemaIsBehind(applied(EXPECTED - 1), EXPECTED)).toBe(true);
  });

  it("atrasado com a tabela de migrations vazia", async () => {
    expect(await schemaIsBehind(applied(null), EXPECTED)).toBe(true);
  });

  it.each([
    ["sem o schema drizzle", "3F000"],
    ["sem a tabela de migrations", "42P01"],
  ])("atrasado %s, com o erro embrulhado pelo Drizzle", async (_, code) => {
    const error = Object.assign(new Error("Failed query"), { cause: { code } });

    expect(await schemaIsBehind(failingWith(error), EXPECTED)).toBe(true);
  });

  it("não afirma nada sem permissão ou sem conexão", async () => {
    const denied = Object.assign(new Error("Failed query"), { cause: { code: "42501" } });
    const refused = Object.assign(new Error("connect"), { code: "ECONNREFUSED" });

    await expect(schemaIsBehind(failingWith(denied), EXPECTED)).rejects.toBe(denied);
    await expect(schemaIsBehind(failingWith(refused), EXPECTED)).rejects.toBe(refused);
  });
});
