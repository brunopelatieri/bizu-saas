import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startJobs } from "@/jobs";
import { getBoss, stopBoss } from "@/jobs/boss";
import { QUEUE, queueDefinitions, scheduleDefinitions } from "@/jobs/queues";
import { enqueueWebhook } from "@/lib/billing/inbox";
import { setProvidersForTests } from "@/lib/payments/registry";
import {
  cleanUpBilling,
  createStubProvider,
  paymentEvents,
  sendWebhook,
} from "./billing-helpers";
import { connectOwner } from "./tenant-helpers";

/**
 * A fila de verdade, que o stub não prova: política `exclusive`, retry e o caminho rota →
 * pg-boss → worker → `payment_event`. Exige `npm run jobs:install`.
 */

let owner: postgres.Sql;
let jobs: Awaited<ReturnType<typeof startJobs>>;

async function waitForStatus(eventId: string, status: string) {
  const deadline = Date.now() + 15_000;
  let current = await paymentEvents(owner, eventId);

  while (current[0]?.status !== status && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    current = await paymentEvents(owner, eventId);
  }

  return current[0];
}

beforeAll(async () => {
  owner = connectOwner();
  setProvidersForTests([createStubProvider()]);
  jobs = await startJobs({ pollingIntervalSeconds: 0.5 });
});

afterAll(async () => {
  setProvidersForTests(undefined);
  await jobs.stop();
  await stopBoss();
  await cleanUpBilling(owner);
  await owner.end();
});

describe("filas de cobrança", () => {
  it("toda fila agendada existe e tem dead letter", () => {
    const names = new Set(queueDefinitions.map(({ name }) => name));

    for (const { queue } of scheduleDefinitions) {
      expect(names.has(queue)).toBe(true);
    }
    for (const { options } of queueDefinitions) {
      if (options.deadLetter) expect(names.has(options.deadLetter)).toBe(true);
    }
  });

  it("os crons de cobrança estão registrados no pg-boss", async () => {
    const boss = await getBoss();
    const schedules = await boss.getSchedules();
    const queues = schedules.map(({ name }) => name);

    expect(queues).toEqual(
      expect.arrayContaining([
        QUEUE.billingTrial,
        QUEUE.billingDunning,
        QUEUE.billingPeriodEnd,
        QUEUE.billingReconcile,
      ]),
    );
  });

  it("webhook.process tem 5 tentativas com backoff e política exclusive", async () => {
    const boss = await getBoss();
    const queue = await boss.getQueue(QUEUE.webhookProcess);

    expect(queue).toMatchObject({
      policy: "exclusive",
      retryLimit: 5,
      retryBackoff: true,
      deadLetter: QUEUE.webhookProcessDead,
    });
  });

  it("do webhook ao evento processado, pelo worker real", async () => {
    const id = `evt_${randomUUID()}`;

    const response = await sendWebhook([{ type: "ignored", reason: "teste" }], { id });
    expect(response.status).toBe(200);

    const row = await waitForStatus(id, "ignored");

    expect(row).toMatchObject({ status: "ignored", attempts: 1 });
  });

  it("singletonKey: com um job vivo, enfileirar de novo não cria outro", async () => {
    await jobs.stop();

    try {
      const boss = await getBoss();
      const key = randomUUID();

      const first = await boss.send(QUEUE.webhookProcess, { paymentEventId: key }, {
        singletonKey: key,
      });
      const second = await boss.send(QUEUE.webhookProcess, { paymentEventId: key }, {
        singletonKey: key,
      });

      expect(first).toEqual(expect.any(String));
      expect(second).toBeNull();

      await expect(enqueueWebhook(key)).resolves.toBeUndefined();
      await boss.deleteJob(QUEUE.webhookProcess, first as string);
    } finally {
      await stopBoss();
      jobs = await startJobs({ pollingIntervalSeconds: 0.5 });
    }
  });
});
