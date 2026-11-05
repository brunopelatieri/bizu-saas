---
name: spec
description: Escreve a SPEC técnica de uma feature a partir do PRD aprovado.
---

1. Leia `docs/specs/<feature>/prd.md`. Sem PRD, ofereça `/prd` ou uma SPEC enxuta.
2. Use `docs/context/INDEX.md` para carregar só os domínios tocados.
3. Copie `docs/specs/_templates/spec.md` para `docs/specs/<feature>/spec.md`.
4. Respeite as fronteiras: dados no Drizzle e Supabase apenas auxiliar.
5. Escreva um plano em etapas pequenas, cada uma com sua verificação.
6. Apague as seções que não se aplicam e peça aprovação antes de implementar.
