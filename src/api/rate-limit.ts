import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  maxKeys?: number;
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
function clientKey(c: Context) {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 0);

  if (hops > 0) {
    const forwarded = c.req.header("X-Forwarded-For")?.split(",").at(-hops)?.trim();
    if (forwarded) return forwarded;
  }

  return socketAddress(c) ?? "unknown";
}

/**
 * Janela fixa em memória, suficiente para um processo Node único. Com mais de
 * uma instância, cada uma conta separadamente; aí use um store compartilhado.
 */
export function rateLimit({ limit, windowMs, maxKeys = 10_000 }: RateLimitOptions) {
  // Ordem de inserção igual à de expiração: os primeiros são sempre os mais antigos.
  const buckets = new Map<string, Bucket>();

  return createMiddleware(async (c, next) => {
    const now = Date.now();

    for (const [key, bucket] of buckets) {
      if (bucket.resetAt > now && buckets.size < maxKeys) break;
      buckets.delete(key);
    }

    const key = clientKey(c);
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
  });
}
