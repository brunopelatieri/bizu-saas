# Banco de dados com Drizzle

- **Escopo:** Schema, variáveis e regra de dados no Postgres próprio via Drizzle.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** `src/db/index.ts`, `src/db/schema.ts`

<!-- ORIGEM: PROJECT_TECHNICAL_SPEC.md L285-318 -->
## 7. Banco de Dados

### Drizzle

Arquivos:

- `src/db/schema.ts`
- `src/db/index.ts`
- `drizzle.config.ts`

Schema atual:

```text
contact_messages
  id uuid primary key defaultRandom
  name text not null
  email text not null
  message text not null
  created_at timestamp with timezone default now
```

Variaveis:

- `DATABASE_URL`: runtime/API.
- `DIRECT_URL`: Drizzle Kit/migrations.

Regra arquitetural:

- Dados da aplicacao ficam no Postgres proprio via Drizzle.
- Nao usar `supabase.from()` para CRUD da app.
- Supabase Auth `user.id` pode ser FK futura em tabelas Drizzle.

---

