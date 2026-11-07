import type { PgBoss } from "pg-boss";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consumerInstanceName,
  countJobConsumers,
  hasMixedConsumers,
  type JobConsumer,
  warnIfMixedConsumers,
} from "@/jobs/consumers";
import { getLogger } from "@/lib/logger";

const instance = (consumer: JobConsumer, live = true) => ({
  name: consumerInstanceName(consumer),
  live,
});

function bossWith(instances: Array<{ name: string | null; live: boolean }>) {
  const getInstances = vi.fn(async (_options: { limit: number }) => instances);
  return { boss: { getInstances } as unknown as PgBoss, getInstances };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("countJobConsumers", () => {
  it("conta só as vivas e ignora quem apenas enfileira", async () => {
    const { boss } = bossWith([
      instance("inline", false),
      instance("inline"),
      instance("worker"),
      { name: null, live: true },
    ]);

    expect(await countJobConsumers(boss)).toEqual({ inline: 1, worker: 1 });
  });

  it("pede mais linhas que as mortas que o pg-boss guarda: as novas vêm por último", async () => {
    const { boss, getInstances } = bossWith([]);

    await countJobConsumers(boss);

    expect(getInstances.mock.calls[0]?.[0].limit).toBeGreaterThan(1000);
  });
});

describe("hasMixedConsumers", () => {
  it("só acusa os dois tipos juntos", () => {
    expect(hasMixedConsumers({ inline: 1, worker: 1 })).toBe(true);
    expect(hasMixedConsumers({ inline: 3, worker: 0 })).toBe(false);
    expect(hasMixedConsumers({ inline: 0, worker: 2 })).toBe(false);
    expect(hasMixedConsumers({ inline: 0, worker: 0 })).toBe(false);
  });
});

describe("warnIfMixedConsumers", () => {
  it.each([
    ["réplicas do app", [instance("inline"), instance("inline")]],
    ["réplicas do worker", [instance("worker"), instance("worker")]],
  ])("não avisa com %s", async (_, instances) => {
    const warn = vi.spyOn(getLogger(), "warn");

    await warnIfMixedConsumers(bossWith(instances).boss);

    expect(warn).not.toHaveBeenCalled();
  });

  it("falha na verificação não derruba quem sobe", async () => {
    vi.spyOn(getLogger(), "error").mockImplementation(() => {});
    const broken = {
      getInstances: () => Promise.reject(new Error("registro indisponível")),
    } as unknown as PgBoss;

    await expect(warnIfMixedConsumers(broken)).resolves.toBeUndefined();
  });
});
