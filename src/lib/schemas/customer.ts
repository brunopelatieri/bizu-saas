import { z } from "zod";
import { customerStatuses } from "@/lib/tenant/customer-constants";

/** Contratos de `/api/customers/*` e dos formulários de `/app/clientes`. */

export const CUSTOMER_PAGE_SIZE = 20;

export const phoneSchema = z
  .string()
  .trim()
  .max(30, "Telefone muito longo.")
  .regex(/^[\d\s()+.-]*$/, "Use só números e + ( ) - .");

/** Texto opcional: vazio vira `null`, ausente segue ausente (o PATCH não mexe). */
export const optionalText = (schema: z.ZodType<string, string>) =>
  schema
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : value));

// Sem `.default()`: em `partial()` ele preencheria o que o PATCH não mandou.
export const customerSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120, "Nome muito longo."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "E-mail muito longo.")
    .email("Informe um e-mail válido."),
  phone: optionalText(phoneSchema),
  document: optionalText(z.string().trim().max(30, "Documento muito longo.")),
  status: z.enum(customerStatuses).optional(),
  tags: z
    .array(z.string().trim().min(1).max(30, "Etiqueta muito longa."))
    .max(20, "Muitas etiquetas.")
    .transform((list) => [...new Set(list)])
    .optional(),
  notes: optionalText(z.string().trim().max(2000, "Observação muito longa.")),
});
export type CustomerInput = z.infer<typeof customerSchema>;
export type CustomerFormValues = z.input<typeof customerSchema>;

export const updateCustomerSchema = customerSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Nada para alterar.",
  });
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const customersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(customerStatuses).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
});
export type CustomersQuery = z.infer<typeof customersQuerySchema>;
