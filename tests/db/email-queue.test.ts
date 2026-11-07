import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { checkReady } from "@/api/ready";
import { getDb } from "@/db";
import { emailMessages, emailSuppressions } from "@/db/schema";
import { startJobs } from "@/jobs";
import { stopBoss } from "@/jobs/boss";
import { pruneOldData } from "@/jobs/maintenance";
import { QUEUE } from "@/jobs/queues";
import { hashEmail } from "@/lib/email/address";
import { createMemoryProvider } from "@/lib/email/providers/memory";
import { sendEmail, setEmailProviderForTests } from "@/lib/email/send";
import { eq } from "drizzle-orm";
import type { EmailProvider } from "@/lib/email/types";

/**
 * Fluxo real: sendEmail → email_message (queued) → pg-boss → worker (bizu_app) →
 * provedor → status. Exige `npm run db:migrate` e `npm run jobs:install`.
 */

const owner = postgres(process.env.DIRECT_URL ?? "", { max: 1 });
let jobs: Awaited<ReturnType<typeof startJobs>>;

async function statusOf(id: string) {
  const [row] = await getDb()
    .select()
    .from(emailMessages)
    .where(eq(emailMessages.id, id));
  return row;
}

async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean) {
  const deadline = Date.now() + 15_000;
  let value = await read();
  while (!done(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    value = await read();
  }
  return value;
}

const unique = () => `fila-${randomUUID()}@example.com`;
const mail = (to: string) => ({
  to,
  subject: "Teste da fila",
  html: "<p>oi</p>",
  text: "oi",
  tags: { template: "teste" },
});

beforeAll(async () => {
  jobs = await startJobs({ pollingIntervalSeconds: 0.5 });
});

afterEach(() => setEmailProviderForTests(undefined));

afterAll(async () => {
  await stopBoss();
  await owner.end();
});

describe("e-mail pela fila", () => {
  it("enfileira, o worker entrega e a email_message vira sent", async () => {
    const memory = createMemoryProvider();
    setEmailProviderForTests(memory, { queue: true });
    const to = unique();

    const result = await sendEmail(mail(to));
    expect(result.status).toBe("queued");

    const row = await waitFor(
      () => statusOf(result.id),
      (r) => r?.status !== "queued",
    );

    expect(row?.status).toBe("sent");
    expect(row?.provider).toBe("memory");
    expect(row?.providerMessageId).toBe("memory-1");
    expect(row?.toHash).toBe(hashEmail(to));
    expect(row?.template).toBe("teste");
    expect(memory.sent.map((m) => m.to)).toEqual([to]);
    // Nenhuma coluna guarda o endereço em claro.
    expect(JSON.stringify(row)).not.toContain(to);
  });

  it("endereço suprimido falha com suppressed e não chega ao provedor", async () => {
    const memory = createMemoryProvider();
    setEmailProviderForTests(memory, { queue: true });
    const to = unique();
    await getDb()
      .insert(emailSuppressions)
      .values({ emailHash: hashEmail(to), reason: "hard_bounce" });

    const result = await sendEmail(mail(to));
    const row = await waitFor(
      () => statusOf(result.id),
      (r) => r?.status !== "queued",
    );

    expect(row?.status).toBe("failed");
    expect(row?.error).toBe("suppressed");
    expect(memory.sent).toHaveLength(0);
  });

  it("esgota os retries, marca failed e manda o job para email.send.dead", async () => {
    const attempts: string[] = [];
    const failing: EmailProvider = {
      id: "memory",
      async send(message) {
        attempts.push(message.to);
        throw new Error(`recusado para ${message.to}`);
      },
    };
    setEmailProviderForTests(failing, { queue: true });
    // Backoff curto só neste teste; a configuração real fica em queues.ts.
    await jobs.boss.updateQueue(QUEUE.emailSend, {
      retryLimit: 2,
      retryDelay: 1,
      retryBackoff: false,
    });

    try {
      const to = unique();
      const result = await sendEmail(mail(to));
      const row = await waitFor(
        () => statusOf(result.id),
        (r) => r?.status === "failed",
      );

      expect(row?.status).toBe("failed");
      expect(row?.error).toContain("recusado");
      expect(row?.error).not.toContain(to);
      expect(attempts).toHaveLength(3); // 1 tentativa + 2 retries

      const dead = await waitFor(
        () =>
          owner`select count(*)::int as total from pgboss.job
                where name = ${QUEUE.emailSendDead} and data->>'emailMessageId' = ${result.id}`,
        (rows) => (rows[0]?.total ?? 0) > 0,
      );
      expect(dead[0]?.total).toBe(1);
    } finally {
      await jobs.boss.updateQueue(QUEUE.emailSend, {
        retryLimit: 5,
        retryDelay: 30,
        retryBackoff: true,
      });
    }
  });
});

describe("manutenção e prontidão", () => {
  it("maintenance.prune apaga email_message com mais de 180 dias", async () => {
    const old = unique();
    const [row] = await getDb()
      .insert(emailMessages)
      .values({
        toHash: hashEmail(old),
        template: "prune",
        createdAt: new Date(Date.now() - 181 * 86_400_000).toISOString(),
      })
      .returning({ id: emailMessages.id });
    const [fresh] = await getDb()
      .insert(emailMessages)
      .values({ toHash: hashEmail(unique()), template: "prune" })
      .returning({ id: emailMessages.id });

    await pruneOldData();

    expect(await statusOf(row?.id ?? "")).toBeUndefined();
    expect(await statusOf(fresh?.id ?? "")).toBeDefined();
  });

  it("/api/ready enxerga banco e fila", async () => {
    expect(await checkReady()).toEqual({ ok: true, db: true, jobs: true, schema: true });
  });
});
