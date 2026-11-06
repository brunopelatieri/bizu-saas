import { Readable } from "node:stream";
import { type Context, Hono } from "hono";
import { type AuthEnv, requireAuth } from "@/api/auth";
import {
  authRateLimit,
  jsonBodyLimit,
  MINUTE,
  sameOrigin,
  validId,
} from "@/api/guards";
import { blockWhileImpersonating } from "@/api/impersonation";
import { logError } from "@/api/log";
import { type PortalAuthEnv, requirePortalAuth } from "@/api/portal-auth";
import { clientKey, rateLimit } from "@/api/rate-limit";
import { handleTenantError } from "@/api/tenant-errors";
import {
  type ExportSubject,
  findReadyExport,
  listExports,
  requestExport,
} from "@/lib/lgpd/export";
import { verifyExportSignature } from "@/lib/lgpd/link";
import { getStorage } from "@/lib/storage";
import { notFound, TenantRuleError } from "@/lib/tenant/errors";

/**
 * Exportação e exclusão de dados pessoais (LGPD). Tudo é da própria pessoa: o sujeito vem
 * sempre da sessão, nunca da requisição. O suporte, durante a personificação, não exporta
 * nem exclui nada em nome de ninguém.
 */

const EXPORT_LIMIT = { limit: 3, windowMs: 60 * MINUTE };
const INVALID_LINK = "Link inválido ou expirado.";

/** O arquivo, sob dupla prova: a assinatura do link e a sessão de quem é dono do pedido. */
async function serveExport(c: Context, subject: ExportSubject, exportId: string) {
  const check = verifyExportSignature(exportId, c.req.query("sig"));
  if (check !== "ok") throw new TenantRuleError(403, "INVALID_LINK", INVALID_LINK);

  const key = await findReadyExport(subject, exportId);
  if (!key) throw notFound("Exportação não encontrada.");

  const stream = await getStorage().get(key);
  if (!stream) {
    logError("Exportação pronta sem arquivo", new Error("objeto ausente"));
    throw notFound("Exportação não encontrada.");
  }

  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="meus-dados.zip"',
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

export const lgpdRoutes = new Hono<AuthEnv>();

lgpdRoutes.onError(handleTenantError);
lgpdRoutes.use("/api/me/export", sameOrigin, jsonBodyLimit);
lgpdRoutes.use("/api/me/export/*", sameOrigin, jsonBodyLimit);

lgpdRoutes.post(
  "/api/me/export",
  authRateLimit,
  requireAuth,
  blockWhileImpersonating,
  rateLimit({
    name: "lgpd-export",
    ...EXPORT_LIMIT,
    key: (c) => c.get("user").id,
  }),
  async (c) => {
    const { exportId } = await requestExport(
      { type: "user", id: c.get("user").id },
      clientKey(c),
    );

    return c.json({ exportId }, 202);
  },
);

lgpdRoutes.get(
  "/api/me/export",
  authRateLimit,
  requireAuth,
  blockWhileImpersonating,
  async (c) =>
    c.json({ exports: await listExports({ type: "user", id: c.get("user").id }) }),
);

lgpdRoutes.get(
  "/api/me/export/:id/download",
  authRateLimit,
  requireAuth,
  blockWhileImpersonating,
  validId,
  (c) =>
    serveExport(c, { type: "user", id: c.get("user").id }, c.req.valid("param").id),
);

export const portalLgpdRoutes = new Hono<PortalAuthEnv>();

portalLgpdRoutes.onError(handleTenantError);
portalLgpdRoutes.use("/api/portal/me/export", sameOrigin, jsonBodyLimit);
portalLgpdRoutes.use("/api/portal/me/export/*", sameOrigin, jsonBodyLimit);

portalLgpdRoutes.post(
  "/api/portal/me/export",
  authRateLimit,
  requirePortalAuth,
  rateLimit({
    name: "lgpd-portal-export",
    ...EXPORT_LIMIT,
    key: (c) => c.get("portalUser").id,
  }),
  async (c) => {
    const { exportId } = await requestExport(
      { type: "portal_user", id: c.get("portalUser").id },
      clientKey(c),
    );

    return c.json({ exportId }, 202);
  },
);

portalLgpdRoutes.get("/api/portal/me/export", authRateLimit, requirePortalAuth, async (c) =>
  c.json({
    exports: await listExports({ type: "portal_user", id: c.get("portalUser").id }),
  }),
);

portalLgpdRoutes.get(
  "/api/portal/me/export/:id/download",
  authRateLimit,
  requirePortalAuth,
  validId,
  (c) =>
    serveExport(
      c,
      { type: "portal_user", id: c.get("portalUser").id },
      c.req.valid("param").id,
    ),
);
