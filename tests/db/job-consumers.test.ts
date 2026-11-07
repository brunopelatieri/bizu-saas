import type { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createBoss } from "@/jobs/boss";
import { countJobConsumers, warnIfMixedConsumers } from "@/jobs/consumers";
import { getLogger } from "@/lib/logger";

/**
 * App em `JOBS_MODE=inline` com o serviço `--worker` ao mesmo tempo: nada impede a combinação,
 * então ela precisa aparecer. Instâncias reais do pg-boss, com o papel de runtime (`bizu_app`).
 */

let reader: PgBoss;
const running: PgBoss[] = [];

async function startConsumer(consumer: "inline" | "worker") {
  const boss = createBoss("worker", consumer);
  await boss.start();
  running.push(boss);
  return boss;
}

async function stopConsumers() {
  await Promise.all(
    running.splice(0).map((boss) => boss.stop({ graceful: true, timeout: 5_000 })),
  );
}

beforeAll(async () => {
  reader = createBoss("producer");
  await reader.start();
});

afterEach(async () => {
  await stopConsumers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await reader.stop({ graceful: true, timeout: 5_000 });
});

describe("consumidores da fila", () => {
  it("quem só enfileira não conta como consumidor", async () => {
    expect(await countJobConsumers(reader)).toEqual({ inline: 0, worker: 0 });
  });

  it("conta por tipo e esquece quem parou", async () => {
    await startConsumer("inline");
    await startConsumer("inline");
    const worker = await startConsumer("worker");

    expect(await countJobConsumers(reader)).toEqual({ inline: 2, worker: 1 });

    await worker.stop({ graceful: true, timeout: 5_000 });

    expect(await countJobConsumers(reader)).toEqual({ inline: 2, worker: 0 });
  });

  it("avisa em nível warn quando app e worker consomem a mesma fila", async () => {
    const warn = vi.spyOn(getLogger(), "warn");
    await startConsumer("inline");
    const worker = await startConsumer("worker");

    await warnIfMixedConsumers(worker);

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toEqual({ consumers: { inline: 1, worker: 1 } });
    expect(warn.mock.calls[0]?.[1]).toContain("APP_JOBS_MODE=off");
  });

  it.each([
    ["réplicas do app", ["inline", "inline"]],
    ["réplicas do worker", ["worker", "worker"]],
  ] as const)("não avisa com %s", async (_, consumers) => {
    const warn = vi.spyOn(getLogger(), "warn");
    const [first] = await Promise.all(consumers.map(startConsumer));

    await warnIfMixedConsumers(first as PgBoss);

    expect(warn).not.toHaveBeenCalled();
  });

  it("falha na verificação não derruba quem sobe", async () => {
    const broken = {
      getInstances: () => Promise.reject(new Error("registro indisponível")),
    } as unknown as PgBoss;

    await expect(warnIfMixedConsumers(broken)).resolves.toBeUndefined();
  });
});
