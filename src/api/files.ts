import { Readable } from "node:stream";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requireAuth } from "@/api/auth";
import { authRateLimit, MINUTE, sameOrigin, validId } from "@/api/guards";
import {
  requirePermission,
  requireTenant,
  type TenantEnv,
} from "@/api/permissions";
import { clientKey, rateLimit } from "@/api/rate-limit";
import { handleTenantError } from "@/api/tenant-errors";
import { getEnv } from "@/lib/env";
import { deleteFile, openFile, uploadFile } from "@/lib/files";
import { attachmentHeader } from "@/lib/files/types";
import { ownerSchema } from "@/lib/schemas/files";
import { TenantRuleError } from "@/lib/tenant/errors";

/**
 * Módulo de arquivos do tenant. Sem tela genérica: a exportação LGPD usa o `StorageProvider`
 * direto, e projetos derivados chamam estas rotas. O conteúdo sempre sai como anexo, com o tipo
 * guardado (da lista de `ALLOWED_UPLOAD_MIME`) e `nosniff`.
 */
export const fileRoutes = new Hono<TenantEnv>();

fileRoutes.onError(handleTenantError);
fileRoutes.use("/api/files/*", sameOrigin, authRateLimit);

fileRoutes.post(
  "/api/files",
  rateLimit({ name: "file-upload", limit: 30, windowMs: 10 * MINUTE }),
  // O limite vale para o corpo inteiro; o campo de texto e o multipart somam poucos KB.
  (c, next) =>
    bodyLimit({
      maxSize: getEnv().MAX_UPLOAD_MB * 1024 * 1024 + 16 * 1024,
      onError: (ctx) =>
        ctx.json({ error: "Arquivo grande demais.", code: "FILE_TOO_LARGE" }, 413),
    })(c, next),
  requireAuth,
  requireTenant,
  requirePermission("file", "upload"),
  async (c) => {
    const form = await c.req.parseBody().catch(() => null);
    const upload = form?.file;

    if (!(upload instanceof File)) {
      throw new TenantRuleError(400, "FILE_REQUIRED", "Envie o arquivo no campo file.");
    }

    if (upload.size > getEnv().MAX_UPLOAD_MB * 1024 * 1024) {
      throw new TenantRuleError(413, "FILE_TOO_LARGE", "Arquivo grande demais.");
    }

    const owner = ownerSchema.safeParse({
      ownerType: typeof form?.ownerType === "string" ? form.ownerType : undefined,
      ownerId: typeof form?.ownerId === "string" ? form.ownerId : undefined,
    });
    if (!owner.success) {
      throw new TenantRuleError(400, "INVALID_OWNER", "Dono do arquivo inválido.");
    }

    const created = await uploadFile({
      tenantId: c.get("tenant").id,
      userId: c.get("user").id,
      name: upload.name,
      mime: upload.type,
      content: Buffer.from(await upload.arrayBuffer()),
      ownerType: owner.data.ownerType,
      ownerId: owner.data.ownerId,
      ip: clientKey(c),
    });

    return c.json(
      {
        file: {
          id: created.id,
          name: created.name,
          size: created.size,
          mime: created.mime,
          ownerType: created.ownerType,
          ownerId: created.ownerId,
          createdAt: created.createdAt,
        },
      },
      201,
    );
  },
);

fileRoutes.get(
  "/api/files/:id",
  requireAuth,
  requireTenant,
  requirePermission("file", "read"),
  validId,
  async (c) => {
    const { record, stream } = await openFile(
      c.get("tenant").id,
      c.req.valid("param").id,
    );

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": record.mime,
        "Content-Length": String(record.size),
        "Content-Disposition": attachmentHeader(record.name),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  },
);

fileRoutes.delete(
  "/api/files/:id",
  requireAuth,
  requireTenant,
  requirePermission("file", "delete"),
  validId,
  async (c) => {
    await deleteFile(c.get("tenant").id, c.req.valid("param").id, {
      userId: c.get("user").id,
      ip: clientKey(c),
    });

    return c.json({ ok: true });
  },
);
