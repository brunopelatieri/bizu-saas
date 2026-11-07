import type { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createBoss } from "@/jobs/boss";
import { countJobConsumers, warnIfMixedConsumers } from "@/jobs/consumers";
import { getLogger } from "@/lib/logger";

/**
 * App em `JOBS_MODE=inline` com o serviço `--worker` ao mesmo tempo: nada impede a combinação,
 * então ela precisa aparecer. Instâncias reais do pg-boss, com o papel de runtime (`bizu_app`).
 * As contagens são relativas: um `npm run dev` no mesmo banco também é um consumidor. Os casos
 * sem aviso estão em `src/jobs/consumers.test.ts`, porque dependem de não haver outro processo.
 */

let reader: PgBoss;
const running: PgBoss[] = [];

async function startConsumer(consumer: "inline" | "worker") {
  const boss = createBoss("worker", consumer);
  await boss.start();
  running.push(boss);
  return boss;
}

beforeAll(async () => {
  reader = createBoss("producer");
  await reader.start();
});

afterEach(async () => {
  await Promise.all(
    running.splice(0).map((boss) => boss.stop({ graceful: true, timeout: 5_000 })),
  );
  vi.restoreAllMocks();
});

afterAll(async () => {
  await reader.stop({ graceful: true, timeout: 5_000 });
});

describe("consumidores da fila", () => {
  it("quem só enfileira não conta como consumidor", async () => {
    const before = await countJobConsumers(reader);
    const producer = createBoss("producer");

    await producer.start();
    running.push(producer);

    expect(await countJobConsumers(reader)).toEqual(before);
  });

  it("conta por tipo e esquece quem parou", async () => {
    const before = await countJobConsumers(reader);
    await startConsumer("inline");
    await startConsumer("inline");
    const worker = await startConsumer("worker");

    expect(await countJobConsumers(reader)).toEqual({
      inline: before.inline + 2,
      worker: before.worker + 1,
    });

    await worker.stop({ graceful: true, timeout: 5_000 });

    expect(await countJobConsumers(reader)).toEqual({
      inline: before.inline + 2,
      worker: before.worker,
    });
  });

  it("avisa em nível warn quando app e worker consomem a mesma fila", async () => {
    const warn = vi.spyOn(getLogger(), "warn");
    await startConsumer("inline");
    const worker = await startConsumer("worker");

    await warnIfMixedConsumers(worker);

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[1]).toContain("APP_JOBS_MODE=off");
  });
});
