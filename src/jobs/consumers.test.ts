import type { PgBoss } from "pg-boss";
import { describe, expect, it } from "vitest";
import {
  consumerInstanceName,
  countJobConsumers,
  hasMixedConsumers,
} from "@/jobs/consumers";

describe("countJobConsumers", () => {
  it("segue a paginação: a instância nova vem depois das mortas", async () => {
    const dead = Array.from({ length: 500 }, (_, i) => ({
      id: `morta-${i}`,
      name: consumerInstanceName("inline"),
      live: false,
    }));
    const live = { id: "viva", name: consumerInstanceName("worker"), live: true };
    const boss = {
      getInstances: async ({ after }: { after?: string }) => (after ? [live] : dead),
    } as unknown as PgBoss;

    expect(await countJobConsumers(boss)).toEqual({ inline: 0, worker: 1 });
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
