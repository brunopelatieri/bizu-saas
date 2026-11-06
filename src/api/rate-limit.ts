import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  maxKeys?: number;
  /** Chave do contador. Padrão: o cliente (`clientKey`). */
  key?: (c: Context) => string | Promise<string>;
};

type Bucket = { count: number; resetAt: number };

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
 * webhooks. Em memória, com a mesma janela fixa de `rateLimit`.
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
 * Janela fixa em memória, suficiente para um processo Node único. Com mais de
 * uma instância, cada uma conta separadamente; aí use um store compartilhado.
 */
export function rateLimit({
  limit,
  windowMs,
  maxKeys = 10_000,
  key: resolveKey = clientKey,
}: RateLimitOptions) {
  // Ordem de inserção igual à de expiração: os primeiros são sempre os mais antigos.
  const buckets = new Map<string, Bucket>();

  return createMiddleware(async (c, next) => {
    const now = Date.now();

    for (const [key, bucket] of buckets) {
      if (bucket.resetAt > now && buckets.size < maxKeys) break;
      buckets.delete(key);
    }

    const key = await resolveKey(c);
    let bucket = buckets.get(key);

    if (!bucket) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > limit) {
      c.header("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      return c.json({ error: "Muitas tentativas. Tente mais tarde." }, 429);
    }

    await next();

    // Falha do servidor não consome a tentativa de quem só quer tentar de novo.
    if (c.res.status >= 500) bucket.count -= 1;
  });
}
