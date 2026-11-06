import { z } from "zod";

const reportField = z.string().max(2048).optional();

/** Corpo de `report-uri`. O restante do relatório é ignorado de propósito. */
export const cspReportSchema = z.object({
  "csp-report": z.object({
    "document-uri": reportField,
    "violated-directive": reportField,
    "effective-directive": reportField,
    "blocked-uri": reportField,
  }),
});

export const SUPPORT_GRANT_HOURS = 24;

export const supportGrantSchema = z.object({
  hours: z
    .number("Informe as horas.")
    .int("Use um número inteiro.")
    .min(1, "No mínimo 1 hora.")
    .max(72, "No máximo 72 horas."),
});

export const tenantSecuritySchema = z.object({ require2fa: z.boolean() });

const TOTP_CODE = /^\d{6}$/;

export const totpCodeSchema = z.object({
  code: z.string().trim().regex(TOTP_CODE, "Informe os 6 dígitos do aplicativo."),
  trustDevice: z.boolean(),
});
export type TotpCodeInput = z.infer<typeof totpCodeSchema>;

export const backupCodeSchema = z.object({
  code: z.string().trim().min(8, "Informe um código de backup.").max(32),
  trustDevice: z.boolean(),
});
export type BackupCodeInput = z.infer<typeof backupCodeSchema>;

export const passwordConfirmSchema = z.object({
  password: z.string().min(1, "Informe sua senha."),
});
export type PasswordConfirmInput = z.infer<typeof passwordConfirmSchema>;

const page = z.coerce.number().int().min(1).max(10_000).default(1);
const action = z.string().trim().max(60).optional();

export const AUDIT_PAGE_SIZE = 25;

export const auditQuerySchema = z.object({
  actor: z.uuid().optional(),
  action,
  page,
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export const adminAuditQuerySchema = auditQuerySchema.extend({
  tenant: z.uuid().optional(),
});
export type AdminAuditQuery = z.infer<typeof adminAuditQuerySchema>;
