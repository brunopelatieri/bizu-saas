import { z } from "zod";

/**
 * Sem isto, o Zod testa `new Function("")` ao criar cada `z.object` para compilar o
 * validador, e a CSP (sem `unsafe-eval`) relata uma violação em toda página com formulário.
 * Tem de ser o primeiro import de `src/root.tsx`: o teste roda quando o schema nasce.
 */
z.config({ jitless: true });
