import { z } from "zod";

/** Campos opcionais do multipart de `POST /api/files`: a quem o arquivo pertence no domínio do projeto. */
export const ownerSchema = z.object({
  ownerType: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,31}$/)
    .optional(),
  ownerId: z.uuid().optional(),
});
