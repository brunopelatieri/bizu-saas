import { z } from "zod";
import {
  paymentEventStatuses,
  paymentProviderIds,
  priceIntervals,
  subscriptionStatusList,
} from "@/lib/billing/constants";
import { billingStates } from "@/lib/billing/state";
import { slugSchema } from "@/lib/schemas/tenant";

/** Contratos de `/api/admin/*` e dos formulários de `/admin`. */

export const PAGE_SIZE = 20;

const optionalLimit = z
  .number("Informe um número.")
  .int("Use um número inteiro.")
  .min(0, "Não pode ser negativo.")
  .max(1_000_000_000, "Valor muito alto.")
  .nullable()
  .optional();

/** Chave ausente ou `null` = ilimitado. */
export const planLimitsSchema = z.strictObject({
  members: optionalLimit,
  customers: optionalLimit,
  storage_mb: optionalLimit,
  custom_roles: optionalLimit,
});

const featureSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[a-z][a-z0-9_]*$/, "Use letras minúsculas, números e _.");

const featuresSchema = z
  .array(featureSchema)
  .max(30, "Muitas features.")
  .transform((list) => [...new Set(list)]);

// Sem `.default()` aqui: o `partial()` das atualizações o aplicaria a campos ausentes e um
// PATCH de `name` zeraria limites, features e `active`.
const planFields = {
  name: z.string().trim().min(2, "Informe o nome.").max(60, "Nome muito longo."),
  description: z.string().trim().max(280, "Descrição muito longa.").nullable(),
  limits: planLimitsSchema,
  features: featuresSchema,
  isFree: z.boolean(),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
};

export const planSchema = z.object({
  slug: slugSchema,
  name: planFields.name,
  description: planFields.description.optional(),
  limits: planFields.limits.default({}),
  features: planFields.features.default([]),
  isFree: planFields.isFree.default(false),
  active: planFields.active.default(true),
  sortOrder: planFields.sortOrder.default(0),
});
export type PlanInput = z.infer<typeof planSchema>;

/** O `slug` identifica o plano em seeds e integrações: não muda depois de criado. */
export const updatePlanSchema = z
  .object(planFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nada para alterar.");
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

const priceFields = {
  amountCents: z
    .number("Informe o valor.")
    .int("Use centavos inteiros.")
    .min(1, "O valor precisa ser maior que zero.")
    .max(100_000_000, "Valor muito alto."),
  providerPriceRef: z.string().trim().max(200).nullable(),
  active: z.boolean(),
};

export const planPriceSchema = z.object({
  provider: z.enum(paymentProviderIds),
  interval: z.enum(priceIntervals),
  amountCents: priceFields.amountCents,
  providerPriceRef: priceFields.providerPriceRef.optional(),
  active: priceFields.active.default(true),
});
export type PlanPriceInput = z.infer<typeof planPriceSchema>;

export const updatePlanPriceSchema = z
  .object(priceFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nada para alterar.");

export const platformSettingsSchema = z
  .object({
    trialPlanId: z.uuid("Plano inválido.").nullable(),
    trialDays: z
      .number("Informe os dias.")
      .int("Use um número inteiro.")
      .min(0, "Use 0 ou mais.")
      .max(365, "No máximo 365 dias."),
    graceDays: z
      .number("Informe os dias.")
      .int("Use um número inteiro.")
      .min(0, "Use 0 ou mais.")
      .max(60, "No máximo 60 dias."),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nada para alterar.");
export type PlatformSettingsInput = z.infer<typeof platformSettingsSchema>;

export const reasonSchema = z.object({
  reason: z.string().trim().max(200, "Motivo muito longo.").optional(),
});

export const changeTenantPlanSchema = z.object({ planId: z.uuid("Plano inválido.") });

const page = z.coerce.number().int().min(1).max(10_000).default(1);
const search = z.string().trim().max(100).optional();

export const tenantsQuerySchema = z.object({
  q: search,
  status: z.enum(billingStates).optional(),
  page,
});

export const usersQuerySchema = z.object({ q: search, page });

export const webhooksQuerySchema = z.object({
  status: z.enum(paymentEventStatuses).optional(),
  page,
});

export const subscriptionsQuerySchema = z.object({
  status: z.enum(subscriptionStatusList).optional(),
  q: search,
  page,
});
