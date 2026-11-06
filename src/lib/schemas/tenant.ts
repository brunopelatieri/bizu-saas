import { z } from "zod";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SLUG_LENGTH = 48;

const name = z
  .string()
  .trim()
  .min(2, "Informe o nome da organização.")
  .max(80, "Nome muito longo.");

export const slugSchema = z
  .string()
  .trim()
  .min(3, "Use ao menos 3 caracteres.")
  .max(MAX_SLUG_LENGTH, "Identificador muito longo.")
  .regex(SLUG_PATTERN, "Use letras minúsculas, números e hífens.");

export const createTenantSchema = z.object({
  name,
  slug: slugSchema.optional(),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const updateTenantSchema = z.object({ name });
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

export const activeTenantSchema = z.object({ tenantId: z.uuid() });

/** `Clínica São João` vira `clinica-sao-joao`. Usado na sugestão e no servidor. */
export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "");
}
