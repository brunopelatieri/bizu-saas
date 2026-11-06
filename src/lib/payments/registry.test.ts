import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { paymentProviderIds } from "@/lib/billing/constants";
import type { Env } from "@/lib/env";
import { buildRegistry, type ProviderModule } from "@/lib/payments/registry";
import type { PaymentProvider } from "@/lib/payments/types";

const env = {} as Env;

const fakeModule = (id: ProviderModule["id"]): ProviderModule => ({
  id,
  createProvider: () => ({ id }) as PaymentProvider,
});

describe("buildRegistry", () => {
  it("sem PAYMENT_PROVIDERS, nenhum provedor e nenhum erro", () => {
    expect(buildRegistry([], [fakeModule("asaas")], env).size).toBe(0);
  });

  it("monta só os ids pedidos, mesmo com mais pastas", () => {
    const providers = buildRegistry(
      ["asaas"],
      [fakeModule("asaas"), fakeModule("pagbank")],
      env,
    );

    expect([...providers.keys()]).toEqual(["asaas"]);
  });

  it("id pedido sem pasta é erro de configuração", () => {
    expect(() => buildRegistry(["asaas"], [], env)).toThrow(/asaas/);
  });

  it("id desconhecido é erro de configuração", () => {
    expect(() => buildRegistry(["inventado"], [], env)).toThrow(/inventado/);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);

    if (statSync(file).isDirectory()) return sourceFiles(file);
    return /\.tsx?$/.test(name) ? [file] : [];
  });
}

/**
 * A garantia de "apagar a pasta remove o módulo": nada fora de `providers/<id>/` importa
 * o módulo nem o SDK dele. `npm run check:module-removal` prova o mesmo apagando de fato.
 */
describe("o núcleo não conhece provedor pelo nome", () => {
  const src = path.resolve(import.meta.dirname, "../..");
  const providersDir = path.join(src, "lib/payments/providers");
  const core = sourceFiles(src).filter((file) => !file.startsWith(providersDir));
  const names = paymentProviderIds.join("|");
  const importsModule = new RegExp(
    `(from|import\\()\\s*["'](${names}|[^"']*providers/(${names})[^"']*)["']`,
  );

  it("acha os arquivos do núcleo", () => {
    expect(core.length).toBeGreaterThan(50);
  });

  it("nenhum arquivo fora de providers/ importa módulo ou SDK de provedor", () => {
    const offenders = core.filter((file) =>
      importsModule.test(readFileSync(file, "utf8")),
    );

    expect(offenders).toEqual([]);
  });

  it("o núcleo de cobrança não cita provedor em código", () => {
    const billing = core.filter(
      (file) =>
        (file.includes(`${path.sep}billing${path.sep}`) ||
          file.includes(`${path.sep}payments${path.sep}`) ||
          file.endsWith("webhooks.ts") ||
          file.endsWith("webhooks-payments.ts")) &&
        !file.endsWith("constants.ts") &&
        !file.endsWith(".test.ts"),
    );
    const quoted = new RegExp(`["'\`](${names})["'\`]`);
    const offenders = billing.filter((file) =>
      quoted.test(readFileSync(file, "utf8")),
    );

    expect(billing.length).toBeGreaterThan(5);
    expect(offenders).toEqual([]);
  });
});
