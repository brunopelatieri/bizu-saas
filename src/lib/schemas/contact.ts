import { z } from "zod";

export const contactMessageSchema = z.object({
  name: z.string().trim().min(1, "Informe seu nome.").max(120, "Nome muito longo."),
  email: z.string().trim().max(254, "E-mail muito longo.").email("Informe um e-mail válido."),
  message: z.string().trim().min(1, "Informe sua mensagem.").max(5000, "Mensagem muito longa."),
});

export type ContactMessageInput = z.infer<typeof contactMessageSchema>;
