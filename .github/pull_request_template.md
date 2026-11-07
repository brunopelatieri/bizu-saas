## O que muda e por quê

<!-- Uma ou duas frases. Link para a issue ou para a spec em docs/specs/, se houver. -->

## Como verificar

<!-- Passos para ver funcionando, ou os testes que cobrem. -->

## Checklist

- [ ] `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` passam
- [ ] `npm run test:db` passa (obrigatório se mexeu em schema, RLS, auth ou jobs)
- [ ] Mudança de schema é migration Drizzle (`npm run db:generate`), com RLS e policy em tabela de tenant
- [ ] Feature relevante tem PRD/SPEC em `docs/specs/`
- [ ] `docs/context/` atualizado (e `INDEX.md`, se surgiu arquivo novo); rules `.claude/rules/` e `.cursor/rules/` em par
- [ ] Variável nova está em `src/lib/env.ts`, `.env.example` e, se for de produção, em `docker/.env.prod.example`
- [ ] Nenhum segredo, token ou dado pessoal no diff, nos logs ou nos testes
- [ ] Mudança visível a quem usa o template entrou em `CHANGELOG.md` (com nota em "Migração", se incompatível)
- [ ] Mudança de auth, tenant, billing, webhook ou arquivo passou por `/security-review`
