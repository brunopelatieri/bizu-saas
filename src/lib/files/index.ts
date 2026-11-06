import { and, eq, sql } from "drizzle-orm";
import type { Readable } from "node:stream";
import { withTenant } from "@/db/rls";
import { file } from "@/db/schema";
import { auditInTransaction } from "@/lib/audit";
import { logError } from "@/api/log";
import { loadTenantPlan } from "@/lib/billing/subscription";
import {
  isAllowedMime,
  matchesSignature,
  sanitizeFileName,
} from "@/lib/files/types";
import { getStorage, newStorageKey } from "@/lib/storage";
import { TenantRuleError, notFound } from "@/lib/tenant/errors";

const MB = 1024 * 1024;

export type FileRecord = typeof file.$inferSelect;

/** Soma dos bytes do tenant: base do limite `storage_mb`. */
export async function storageUsedBytes(tenantId: string) {
  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select({ total: sql<number>`coalesce(sum(${file.size}), 0)::float8` })
      .from(file),
  );

  return row?.total ?? 0;
}

/** Recusa o upload que ultrapassaria `storage_mb` do plano (sem limite no plano, passa). */
export async function assertStorageAvailable(tenantId: string, incomingBytes: number) {
  const limitMb = (await loadTenantPlan(tenantId))?.plan.limits.storage_mb ?? null;
  if (limitMb === null) return;

  if ((await storageUsedBytes(tenantId)) + incomingBytes > limitMb * MB) {
    throw new TenantRuleError(
      403,
      "PLAN_LIMIT_REACHED",
      `Seu plano permite até ${limitMb} MB de armazenamento. Mude de plano para continuar.`,
    );
  }
}

export type UploadInput = {
  tenantId: string;
  userId: string;
  name: string;
  mime: string;
  content: Buffer;
  ownerType?: string;
  ownerId?: string | null;
  ip?: string | null;
};

/**
 * Guarda o conteúdo no provedor e o registro no banco. Tipo fora da lista e conteúdo que não
 * bate com o tipo são recusados; o limite do plano vale antes de gravar. Se o banco falhar
 * depois do `put`, o objeto órfão é apagado.
 */
export async function uploadFile(input: UploadInput): Promise<FileRecord> {
  const { tenantId, userId, content } = input;

  if (content.length === 0) {
    throw new TenantRuleError(400, "EMPTY_FILE", "O arquivo está vazio.");
  }

  if (!isAllowedMime(input.mime) || !matchesSignature(input.mime, content)) {
    throw new TenantRuleError(
      415,
      "UNSUPPORTED_FILE_TYPE",
      "Tipo de arquivo não permitido.",
    );
  }

  await assertStorageAvailable(tenantId, content.length);

  const storage = getStorage();
  const key = newStorageKey(`tenants/${tenantId}`);
  await storage.put(key, content, { contentType: input.mime });

  try {
    return await withTenant(tenantId, async (tx) => {
      const [created] = await tx
        .insert(file)
        .values({
          tenantId,
          ownerType: input.ownerType ?? "tenant",
          ownerId: input.ownerId ?? tenantId,
          key,
          name: sanitizeFileName(input.name),
          size: content.length,
          mime: input.mime,
          provider: storage.id,
          createdBy: userId,
        })
        .returning();

      if (!created) throw new Error("Insert de arquivo sem retorno.");

      await auditInTransaction(tx, "file.uploaded", {
        actor: { id: userId },
        tenantId,
        target: { type: "file", id: created.id },
        metadata: { size: content.length, mime: input.mime },
        ip: input.ip,
      });

      return created;
    });
  } catch (error) {
    await storage.delete(key).catch((cleanup) => logError("Falha ao limpar upload órfão", cleanup));
    throw error;
  }
}

/** Metadados e fluxo do arquivo do tenant. Id de outro tenant é 404, como inexistente. */
export async function openFile(
  tenantId: string,
  id: string,
): Promise<{ record: FileRecord; stream: Readable }> {
  const [record] = await withTenant(tenantId, (tx) =>
    tx
      .select()
      .from(file)
      .where(and(eq(file.id, id), eq(file.tenantId, tenantId))),
  );
  if (!record) throw notFound("Arquivo não encontrado.");

  const stream = await getStorage().get(record.key);
  if (!stream) throw notFound("Arquivo não encontrado.");

  return { record, stream };
}

export async function deleteFile(
  tenantId: string,
  id: string,
  actor: { userId: string; ip?: string | null },
) {
  const record = await withTenant(tenantId, async (tx) => {
    const [removed] = await tx
      .delete(file)
      .where(and(eq(file.id, id), eq(file.tenantId, tenantId)))
      .returning();

    if (removed) {
      await auditInTransaction(tx, "file.deleted", {
        actor: { id: actor.userId },
        tenantId,
        target: { type: "file", id },
        ip: actor.ip,
      });
    }

    return removed;
  });
  if (!record) throw notFound("Arquivo não encontrado.");

  // O registro já saiu: falha aqui deixa um objeto órfão no provedor, que fica no log.
  await getStorage()
    .delete(record.key)
    .catch((error) => logError("Falha ao apagar objeto do armazenamento", error));
}
