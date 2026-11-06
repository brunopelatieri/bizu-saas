import { z } from "zod";
import {
  allPermissions,
  isStaticRole,
  type Permission,
  reservedPermissions,
} from "@/lib/auth/permissions";
import { roleNameSchema } from "@/lib/schemas/team";

const customRoleName = roleNameSchema.refine((name) => !isStaticRole(name), {
  error: "Este nome é de um papel padrão.",
});

/** Recusa o que não existe no catálogo e o que é só do owner. */
const permissions = z
  .array(z.string())
  .min(1, "Escolha ao menos uma permissão.")
  .max(allPermissions.length, "Permissões demais.")
  .superRefine((values, ctx) => {
    for (const value of values) {
      if (!allPermissions.includes(value as Permission)) {
        ctx.addIssue({
          code: "custom",
          message: `Permissão desconhecida: ${value}.`,
        });
      } else if (reservedPermissions.includes(value as Permission)) {
        ctx.addIssue({
          code: "custom",
          message: `Permissão reservada ao proprietário: ${value}.`,
        });
      }
    }
  })
  .transform((values) => [...new Set(values)]);

const description = z.string().trim().max(200, "Descrição muito longa.");

export const roleSchema = z.object({
  name: customRoleName,
  description: description.optional(),
  permissions,
});
export type RoleInput = z.input<typeof roleSchema>;

export const updateRoleSchema = roleSchema.partial();
export type UpdateRoleInput = z.input<typeof updateRoleSchema>;
