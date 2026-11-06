import { z } from "zod";
import { paymentMethods } from "@/lib/billing/constants";

/** Contratos de `/api/billing/*` e dos formulários de `/app/assinatura`. */

const onlyDigits = (value: string) => value.replace(/\D/g, "");

const repeated = (digits: string) => /^(\d)\1+$/.test(digits);

/** Dígito verificador de CPF e CNPJ, a partir dos pesos de cada um. */
function checkDigit(digits: string, weights: number[]) {
  const sum = weights.reduce(
    (total, weight, index) => total + weight * Number(digits[index]),
    0,
  );
  const rest = sum % 11;

  return rest < 2 ? 0 : 11 - rest;
}

export function isValidCpf(value: string) {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || repeated(digits)) return false;

  const first = checkDigit(digits, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(digits, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);

  return digits.endsWith(`${first}${second}`);
}

export function isValidCnpj(value: string) {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || repeated(digits)) return false;

  const first = checkDigit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return digits.endsWith(`${first}${second}`);
}

const text = (max: number) => z.string().trim().max(max).optional();

export const billingAddressSchema = z.strictObject({
  line1: text(200),
  number: text(20),
  complement: text(100),
  district: text(100),
  city: text(100),
  state: text(2),
  postalCode: text(9),
});

export const billingProfileSchema = z
  .object({
    legalName: z
      .string("Informe o nome.")
      .trim()
      .min(2, "Informe o nome.")
      .max(200, "Nome muito longo."),
    document: z
      .string("Informe o documento.")
      .trim()
      .max(20, "Documento inválido.")
      .transform(onlyDigits),
    documentType: z.enum(["cpf", "cnpj"], "Escolha CPF ou CNPJ."),
    email: z.email("Informe um e-mail válido.").max(200),
    address: billingAddressSchema.default({}),
  })
  .refine(
    ({ document, documentType }) =>
      documentType === "cpf" ? isValidCpf(document) : isValidCnpj(document),
    { path: ["document"], message: "Documento inválido." },
  );
export type BillingProfileInput = z.infer<typeof billingProfileSchema>;

export const checkoutSchema = z.object({
  planPriceId: z.uuid("Escolha um plano."),
  method: z.enum(paymentMethods, "Escolha a forma de pagamento."),
});

export const changePlanSchema = z.object({
  planPriceId: z.uuid("Escolha um plano."),
});

/** O owner cancela no fim do período. Imediato é só no `/admin`. */
export const cancelSchema = z.object({
  atPeriodEnd: z.literal(true).default(true),
});
