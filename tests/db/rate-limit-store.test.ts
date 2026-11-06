import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rateLimit } from "@/api/rate-limit";
import {
  postgresRateLimitStore as store,
  pruneRateLimitBuckets,
  RATE_LIMIT_RETENTION_MS,
} from "@/api/rate-limit-postgres";
import { hashIp } from "@/lib/audit";
import { connectOwner } from "./tenant-helpers";

const HOUR = 60 * 60 * 1000;

/** Janela longa: o teste não vira de janela no meio. */
function instance(name: string, limit: number, status = 200) {
  const app = new Hono();

  app.get(
    "/",
    rateLimit({ name, limit, windowMs: HOUR, store, key: () => "cliente" }),
    (c) => c.text("ok", status as 200),
  );

  return app;
}

describe("store Postgres do rate limit", () => {
  let owner: postgres.Sql;

  beforeAll(() => {
    owner = connectOwner();
  });

  afterAll(async () => {
    await owner.end();
  });

  it("duas instâncias dividem o mesmo limite", async () => {
    const name = randomUUID();
    const first = instance(name, 3);
    const second = instance(name, 3);

    expect((await first.request("/")).status).toBe(200);
    expect((await second.request("/")).status).toBe(200);
    expect((await first.request("/")).status).toBe(200);

    const blocked = await second.request("/");

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("limites com nomes diferentes não se misturam", async () => {
    const first = instance(randomUUID(), 1);
    const second = instance(randomUUID(), 1);

    expect((await first.request("/")).status).toBe(200);
    expect((await second.request("/")).status).toBe(200);
    expect((await first.request("/")).status).toBe(429);
  });

  it("o upsert não perde contagem em requisições simultâneas", async () => {
    const key = randomUUID();
    const now = Date.now();

    const hits = await Promise.all(
      Array.from({ length: 20 }, () => store.hit(key, HOUR, now)),
    );

    expect(hits.map(({ count }) => count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
  });

  it("falha do servidor devolve a tentativa", async () => {
    const name = randomUUID();
    const broken = instance(name, 1, 500);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await broken.request("/")).status).toBe(500);
    }

    const working = instance(name, 1);

    expect((await working.request("/")).status).toBe(200);
    expect((await working.request("/")).status).toBe(429);
  });

  it("janela nova zera a contagem", async () => {
    const key = randomUUID();
    const now = Date.now();

    await store.hit(key, 1000, now);
    const { count } = await store.hit(key, 1000, now + 1000);

    expect(count).toBe(1);
  });

  it("a chave vai em hash: o IP não fica legível no banco", async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 250)}-${randomUUID()}`;

    await store.hit(ip, HOUR, Date.now());

    const stored = await owner`
      select 1 from rate_limit_bucket where key = ${hashIp(ip)}
    `;
    const inClear = await owner`
      select 1 from rate_limit_bucket where key = ${ip}
    `;

    expect(stored).toHaveLength(1);
    expect(inClear).toHaveLength(0);
  });

  it("a limpeza apaga só os buckets vencidos", async () => {
    const oldKey = randomUUID();
    const freshKey = randomUUID();
    const now = Date.now();

    await store.hit(oldKey, HOUR, now - RATE_LIMIT_RETENTION_MS - 2 * HOUR);
    await store.hit(freshKey, HOUR, now);

    expect(await pruneRateLimitBuckets(new Date(now))).toBeGreaterThan(0);

    const left = await owner<{ key: string }[]>`
      select key from rate_limit_bucket
      where key in (${hashIp(oldKey)}, ${hashIp(freshKey)})
    `;

    expect(left.map(({ key }) => key)).toEqual([hashIp(freshKey)]);
  });
});
