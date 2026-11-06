import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { logError } from "@/api/log";
import { postgresRateLimitStore } from "@/api/rate-limit-postgres";

type Bucket = { count: number; resetAt: number };

/** Onde os contadores ficam. `hit` conta a tentativa e devolve o estado da janela. */
export type RateLimitStore = {
  hit(key: string, windowMs: number, now: number): Promise<Bucket>;
  /** Devolve a tentativa contada por `hit`. */
  undo(key: string, bucket: Bucket, windowMs: number): Promise<void>;
};

type RateLimitOptions = {
  /** Único por limite: no store compartilhado, separa os contadores de cada um. */
  name: string;
  limit: number;
  windowMs: number;
  maxKeys?: number;
  /** Chave do contador. Padrão: o cliente (`clientKey`). */
  key?: (c: Context) => string | Promise<string>;
  /** Padrão: o de `RATE_LIMIT_STORE`. */
  store?: RateLimitStore;
};

function socketAddress(c: Context) {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}

/**
 * Usa o IP da conexão. Atrás de proxies, defina `TRUSTED_PROXY_HOPS` com a
 * quantidade deles: cada um acrescenta um IP à direita de `X-Forwarded-For`, e o
 * que vem antes disso é controlado pelo cliente.
 */
export function clientKey(c: Context) {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 0);

  if (hops > 0) {
    const forwarded = c.req.header("X-Forwarded-For")?.split(",").at(-hops)?.trim();
    if (forwarded) return forwarded;
  }

  return socketAddress(c) ?? "unknown";
}

/**
 * Conta só as falhas de quem chama: para rotas em que o volume legítimo é alto, como
 * webhooks. Sempre em memória, com a mesma janela fixa de `rateLimit`: com várias
 * instâncias, o teto real é o limite vezes a quantidade delas.
 */
export function failureLimit({
  limit,
  windowMs,
  maxKeys = 10_000,
}: Pick<RateLimitOptions, "limit" | "windowMs" | "maxKeys">) {
  const buckets = new Map<string, Bucket>();

  const current = (key: string, now: number) => {
    const bucket = buckets.get(key);
    return bucket && bucket.resetAt > now ? bucket : undefined;
  };

  return {
    blocked: (key: string) => (current(key, Date.now())?.count ?? 0) >= limit,
    hit(key: string) {
      const now = Date.now();

      for (const [name, bucket] of buckets) {
        if (bucket.resetAt > now && buckets.size < maxKeys) break;
        buckets.delete(name);
      }

      const bucket = current(key, now) ?? { count: 0, resetAt: now + windowMs };
      bucket.count += 1;
      buckets.set(key, bucket);
    },
  };
}

/**
 * Janela fixa em memória, suficiente para um processo Node único. Com mais de uma
 * instância, cada uma contaria separadamente: use `RATE_LIMIT_STORE=postgres`.
 */
export function createMemoryStore(maxKeys = 10_000): RateLimitStore {
  // Ordem de inserção igual à de expiração: os primeiros são sempre os mais antigos.
  const buckets = new Map<string, Bucket>();

  return {
    async hit(key, windowMs, now) {
      for (const [name, bucket] of buckets) {
        if (bucket.resetAt > now && buckets.size < maxKeys) break;
        buckets.delete(name);
      }

      let bucket = buckets.get(key);

      if (!bucket) {
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(key, bucket);
      }

      bucket.count += 1;
      return bucket;
    },
    async undo(_key, bucket) {
      bucket.count -= 1;
    },
  };
}

/** `src/server.ts` só carrega o `.env.local` depois de importar a API: lê na 1ª requisição. */
function defaultStore(maxKeys?: number) {
  return process.env.RATE_LIMIT_STORE === "postgres"
    ? postgresRateLimitStore
    : createMemoryStore(maxKeys);
}

/** Sem o store, não há limite a aplicar: a rota não abre (falha fechada). */
export function rateLimit({
  name,
  limit,
  windowMs,
  maxKeys,
  key: resolveKey = clientKey,
  store,
}: RateLimitOptions) {
  let resolved = store;

  return createMiddleware(async (c, next) => {
    resolved ??= defaultStore(maxKeys);

    const now = Date.now();
    const key = `${name}:${await resolveKey(c)}`;
    let bucket: Bucket;

    try {
      bucket = await resolved.hit(key, windowMs, now);
    } catch (error) {
      logError("Falha no rate limit", error);
      return c.json({ error: "Serviço indisponível. Tente novamente." }, 503);
    }

    if (bucket.count > limit) {
      c.header("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      return c.json({ error: "Muitas tentativas. Tente mais tarde." }, 429);
    }

    await next();

    // Falha do servidor não consome a tentativa de quem só quer tentar de novo.
    if (c.res.status >= 500) {
      await resolved.undo(key, bucket, windowMs).catch((error: unknown) => {
        logError("Falha ao devolver tentativa do rate limit", error);
      });
    }
  });
}
