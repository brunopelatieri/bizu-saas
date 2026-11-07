import { z } from "zod";

/** Re-aceite pelo modal: a versão vista precisa ser a vigente, senão a página está velha. */
export const acceptConsentSchema = z.object({
  accept: z.literal(true, { error: "Aceite os termos e a política de privacidade." }),
  version: z.string().min(1).max(32),
});

export const marketingConsentSchema = z.object({ accepted: z.boolean() });

/** `DELETE /api/me` e `DELETE /api/tenant`: a senha e, com 2FA ativo, o código. */
export const confirmIdentitySchema = z.object({
  password: z.string().min(1, "Informe sua senha.").max(128),
  totp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "O código tem 6 dígitos.")
    .optional(),
});

/** `DELETE /api/portal/me`: quem tem senha a confirma; quem não tem, confirma pelo e-mail. */
export const portalDeleteSchema = z.object({
  password: z.string().max(128).optional(),
});

export type ConfirmIdentityInput = z.infer<typeof confirmIdentitySchema>;
