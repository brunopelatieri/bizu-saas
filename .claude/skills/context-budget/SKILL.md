---
name: context-budget
description: Mede o contexto sempre carregado e aponta o que está pesado.
---

1. Some as linhas de `CLAUDE.md`, `docs/context/INDEX.md` e das rules sem `paths:`.
2. Liste em `.claude/rules/` os arquivos sem `paths:`, e em `.cursor/rules/` os que têm `alwaysApply: true`.
3. Liste arquivos de `docs/context/` com mais de ~300 linhas e rules com mais de 40.
4. Liste as descrições de skills em `.claude/skills/` com mais de uma linha.
5. Compare com a meta de `docs/context/ai-engineering.md` (baseline abaixo de 400 linhas).
6. Reporte os números e sugira cortes. Não altere arquivos sem pedido.
