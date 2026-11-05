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

Fora do escopo do template: multi-tenant, planos e cobranca recorrente. Quem precisar
disso deve tratar como projeto SaaS, com spec propria.

### Longo prazo

- E-mails transacionais via Nodemailer.
- Papeis simples (ex.: admin e usuario) em `profiles`, se o projeto precisar.
- Observabilidade: logs estruturados, health/readiness, tracing.
- CI com typecheck/build/test.
- Backups e restore documentados para VPS.

---

