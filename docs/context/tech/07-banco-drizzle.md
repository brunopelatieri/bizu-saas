# Banco de dados com Drizzle

- **Escopo:** Schema, variáveis e uso do Drizzle em qualquer Postgres.
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

Onde o Postgres pode rodar:

| Opcao | `DATABASE_URL` | `DIRECT_URL` |
|---|---|---|
| Local (Docker) | `localhost:15432` | Igual |
| VPS ou gerenciado | Conexao do servidor | Igual |

- Em pooler no modo transaction (PgBouncer, por exemplo), adicione `?prepare=false` a
  `DATABASE_URL`.

Variaveis:

- `DATABASE_URL`: runtime/API.
- `DIRECT_URL`: Drizzle Kit/migrations.

Regra arquitetural:

- Dados da aplicacao passam sempre pelo Drizzle, em qualquer Postgres.

---

