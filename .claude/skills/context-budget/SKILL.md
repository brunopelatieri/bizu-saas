---
name: context-budget
description: Mede o contexto sempre carregado e aponta o que está pesado.
---

1. Some os bytes de `CLAUDE.md`, `docs/context/INDEX.md`, das rules sem `paths:` e das descrições de skills. Divida por 4 para estimar tokens.
2. Liste em `.claude/rules/` os arquivos sem `paths:`, e em `.cursor/rules/` os que têm `alwaysApply: true`.
3. Liste arquivos de `docs/context/` com mais de ~300 linhas e rules com mais de 40.
4. Liste as descrições de skills em `.claude/skills/` com mais de uma linha.
5. Compare com a meta de `docs/context/ai-engineering.md` (baseline abaixo de ~3 mil tokens).
6. Reporte os números e sugira cortes. Não altere arquivos sem pedido.
