# Roadmap técnico

- **Escopo:** Evolução recomendada no curto, médio e longo prazo.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** não declarado

<!-- ORIGEM: PROJECT_TECHNICAL_SPEC.md L859-884 -->
## 17. Roadmap Tecnico Recomendado

### Curto prazo

- Criar stack Portainer completa para app + Postgres + reverse proxy.
- Documentar rotina de migrations como job/pipeline separado.
- Criar API client tipado para Hono ou helpers de fetch padronizados.

### Medio prazo

- Criar tabela `posts`.
- Criar modelos `clients`, `projects`, `project_updates`, `files`.
- Integrar Supabase Storage aos arquivos do dashboard.

### Longo prazo

- Multi-tenant/organizations.
- Billing Stripe.
- E-mails transacionais via Nodemailer.
- RBAC/permissoes.
- Observabilidade: logs estruturados, health/readiness, tracing.
- CI com typecheck/build/test.
- Backups e restore documentados para VPS.

---

