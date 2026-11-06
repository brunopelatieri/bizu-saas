# Skills e rules implantadas

- **Escopo:** Rules do Cursor, skill de landing page e mecanismo de contexto vivo.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** não declarado
- **Nota:** Registro histórico, de quando o projeto usava Supabase. As rules `portal-*` foram substituídas pelas rules por domínio em `.claude/rules/` e `.cursor/rules/`; a arquitetura vigente está em `docs/context/core.md`.

<!-- ORIGEM: PROJECT_TECHNICAL_SPEC.md L540-609 -->
## 13. Skills e Rules Implantadas

### Rules do Cursor

Arquivos:

- `.cursor/rules/karpathy-guidelines.mdc`
- `.cursor/rules/portal-scope.mdc`
- `.cursor/rules/portal-stack.mdc`
- `.cursor/rules/portal-supabase.mdc`

Regras ativas importantes:

- Mudancas cirurgicas.
- Simplicidade antes de abstracao.
- Assumir menos, validar mais.
- Supabase apenas auxiliar.
- Dados da app no Postgres proprio via Drizzle.
- Mobile-first.
- Novas paginas atualizam navegacao.

### Skill de Landing Page

Regra do usuario:

- Para landing pages/sales pages/marketing pages, ler e seguir
  `E:\Documentos\0004_GitHub\LLM-instructional-skills\landingpage\SKILL.md`.

Observacao operacional:

- O arquivo exato nao existia nesse caminho.
- O skill encontrado e usado foi:
  `E:\Documentos\0004_GitHub\LLM-instructional-skills\landingpage\skill_landingpage_claude_opus\SKILL.md`.

Principios desse skill:

- Antes de codigo, coletar contexto.
- Strategy Brief.
- Arquitetura de landing com hero, dores, solucao, beneficios, prova social,
  como funciona, oferta, FAQ, garantia e CTA.
- Copywriting orientado a conversao.

### Mecanismo de Contexto Vivo para LLMs

Arquivos criados/atualizados para orientar agentes de IA:

- `AI_CONTEXT.md` — contexto operacional curto, leitura obrigatoria inicial.
- `.cursor/rules/ai-context-governance.mdc` — rule always-on para manter o
  contexto tecnico atualizado.
- `CLAUDE.md` — aponta para `AI_CONTEXT.md`, `PROJECT_TECHNICAL_SPEC.md` e
  `MIGRATION_NOTES.md`.
- `PROJECT_TECHNICAL_SPEC.md` — documento tecnico completo.
- `README.md` — onboarding humano e operacional.

Regra pratica:

- Mudou arquitetura, rota, stack, deploy, banco, auth, billing ou dashboard?
  Atualize `AI_CONTEXT.md` e `PROJECT_TECHNICAL_SPEC.md`.
- Mudou onboarding/comandos? Atualize `README.md`.
- Mudou decisao que agentes futuros devem respeitar? Atualize `.cursor/rules/`.

Objetivo:

- Reduzir perda de contexto entre sessoes.
- Evitar que LLMs reintroduzam arquitetura antiga.
- Tornar o projeto uma base confiavel para desenvolvimento com Engineer AI
  Software, onde humanos e agentes tomam decisoes com o mesmo mapa tecnico.

---

