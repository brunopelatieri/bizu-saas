import { z } from "zod";

/** Sem vírgula: `member.role` separa papéis por ela, e `x,owner` valeria como dois. */
export const roleNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9_-]{1,39}$/,
    "Use de 2 a 40 letras minúsculas, números, hífen ou sublinhado.",
  );

export const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "E-mail muito longo.")
    .email("Informe um e-mail válido."),
  role: roleNameSchema,
});
export type InviteInput = z.infer<typeof inviteSchema>;

export const changeRoleSchema = z.object({ role: roleNameSchema });
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;
