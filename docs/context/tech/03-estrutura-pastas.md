# Estrutura de pastas

- **Escopo:** Árvore do repositório e papel de cada diretório.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** não declarado
- **Nota:** Anterior a `docs/context/`; a árvore não lista essa pasta.

<!-- ORIGEM: PROJECT_TECHNICAL_SPEC.md L150-188 -->
## 3. Estrutura de Pastas

```text
.
|-- .cursor/
|   `-- rules/                regras de contexto do workspace
|-- drizzle/                  migrations Drizzle
|-- src/
|   |-- api/app.ts            Hono API (/api/*)
|   |-- components/
|   |   |-- auth/
|   |   |-- contact/
|   |   |-- landing/
|   |   |-- layout/
|   |   |-- projects/
|   |   `-- ui/               shadcn/ui
|   |-- db/                   Drizzle schema + client
|   |-- lib/
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

