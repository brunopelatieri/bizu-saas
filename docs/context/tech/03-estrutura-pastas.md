# Estrutura de pastas

- **Escopo:** Árvore do repositório e papel de cada diretório.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** não declarado

<!-- ORIGEM: PROJECT_TECHNICAL_SPEC.md L150-188 -->
## 3. Estrutura de Pastas

```text
.
|-- .claude/
|   |-- rules/                regras por dominio (carregadas por paths)
|   `-- skills/               skills de contexto e de fluxo
|-- .cursor/
|   `-- rules/                regras por dominio para o Cursor
|-- .github/workflows/        CI: lint, tipos, testes e build
|-- docs/
|   |-- context/              contexto para LLMs, a partir do INDEX.md
|   `-- specs/                templates de PRD/SPEC e specs de features
|-- drizzle/                  migrations Drizzle
|-- src/
|   |-- api/                  Hono API (/api/*): app, auth e rate limit
|   |-- components/
|   |   |-- auth/
|   |   |-- contact/
|   |   |-- dashboard/
|   |   |-- landing/
|   |   |-- layout/
|   |   |-- projects/
|   |   `-- ui/               shadcn/ui
|   |-- db/                   Drizzle: schema, client e profiles
|   |-- lib/
|   |   |-- api/              cliente da API com token da sessao
|   |   |-- constants/
|   |   |-- content/
|   |   |-- supabase/
|   |   `-- theme.ts
|   |-- pages/                componentes de pagina reaproveitados por routes
|   |-- providers/
|   |-- routes/               route modules do React Router Framework Mode
|   |-- stores/
|   |-- styles/theme.css
|   |-- root.tsx              document/root app
|   |-- routes.ts             route config do RR
|   `-- server.ts             servidor Hono + RR SSR
|-- Dockerfile
|-- docker-compose.yml        Postgres local de desenvolvimento
|-- react-router.config.ts
|-- vite.config.ts
`-- PROJECT_TECHNICAL_SPEC.md
```

---

