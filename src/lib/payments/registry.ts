import { readdir } from "node:fs/promises";
import path from "node:path";
import { type PaymentProviderId, paymentProviderIds } from "@/lib/billing/constants";
import { type Env, getEnv } from "@/lib/env";
import type { PaymentContext, PaymentProvider } from "@/lib/payments/types";

/**
 * Registro dos módulos de pagamento. Um módulo é uma pasta em `providers/<id>/` cujo
 * `index.ts` exporta `default: ProviderModule`. Entra em uso quando o id está em
 * `PAYMENT_PROVIDERS`; apagar a pasta e tirar o id remove o módulo. Sem nenhum, o sistema
 * segue com planos gratuitos e trial.
 */

export type ProviderModule = {
  id: PaymentProviderId;
  /** Só monta o objeto: nada de rede nem erro por falta de provedor aqui. */
  createProvider(env: Env): PaymentProvider;
};

type ModuleFile = { default: ProviderModule };

/** `tsx` (seed, worker em dev) não é Vite: lá o `glob` não existe e a pasta é lida à mão. */
async function discover(): Promise<ModuleFile[]> {
  try {
    return Object.values(
      import.meta.glob<ModuleFile>("./providers/*/index.ts", { eager: true }),
    );
  } catch {
    const root = path.join(import.meta.dirname, "providers");
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);

    return Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(
          (entry) =>
            import(path.join(root, entry.name, "index.ts")) as Promise<ModuleFile>,
        ),
    );
  }
}

const discovered = await discover();

/** Monta os provedores ativos. Id desconhecido ou sem pasta é erro de configuração. */
export function buildRegistry(
  ids: readonly string[],
  modules: readonly ProviderModule[],
  env: Env,
) {
  const providers = new Map<PaymentProviderId, PaymentProvider>();

  for (const id of ids) {
    const known = paymentProviderIds.find((value) => value === id);
    const found = modules.find((module) => module.id === id);

    if (!known || !found) {
      throw new Error(`PAYMENT_PROVIDERS: módulo "${id}" não encontrado.`);
    }
    providers.set(known, found.createProvider(env));
  }

  return providers;
}

let registry: Map<PaymentProviderId, PaymentProvider> | undefined;

function loadRegistry() {
  if (!registry) {
    const env = getEnv();
    registry = buildRegistry(
      env.PAYMENT_PROVIDERS,
      discovered.map((file) => file.default),
      env,
    );
  }

  return registry;
}

export function getProviders(): PaymentProvider[] {
  return [...loadRegistry().values()];
}

export function getProvider(id: string): PaymentProvider | null {
  return loadRegistry().get(id as PaymentProviderId) ?? null;
}

/** Fluxo (a): sem credenciais do tenant, o módulo usa as variáveis de ambiente. */
export function platformContext(): PaymentContext {
  return { sandbox: getEnv().NODE_ENV !== "production" };
}

/** Troca os provedores em testes; `undefined` volta ao de `PAYMENT_PROVIDERS`. */
export function setProvidersForTests(next: PaymentProvider[] | undefined) {
  registry = next && new Map(next.map((provider) => [provider.id, provider]));
}
