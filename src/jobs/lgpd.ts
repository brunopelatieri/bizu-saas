import type { JobWithMetadata } from "pg-boss";
import type { LgpdExportJob } from "@/jobs/queues";
import { processExport } from "@/lib/lgpd/export";

/**
 * `lgpd.export`: um pedido por job. Falha relança para o pg-boss tentar de novo (3 vezes); na
 * última, `processExport` marca o pedido como `failed`.
 */
export async function handleLgpdExport(jobs: JobWithMetadata<LgpdExportJob>[]) {
  for (const job of jobs) await processExport(job.data.exportId, job);
}
