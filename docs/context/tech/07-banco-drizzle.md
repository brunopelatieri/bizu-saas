# Banco de dados com Drizzle

- **Escopo:** Schema, variáveis, profiles e uso do Drizzle em qualquer Postgres.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** `src/db/profiles.ts`, `src/db/index.ts`, `src/db/schema.ts`

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

profiles (espelho local do Supabase Auth)
  id uuid primary key            mesmo valor de user.id
  email text
  full_name text
  created_at timestamp with timezone default now
  updated_at timestamp with timezone default now
```

Onde o Postgres pode rodar:

| Opcao | `DATABASE_URL` | `DIRECT_URL` |
|---|---|---|
| Local (Docker) | `localhost:15432` | Igual |
| VPS ou gerenciado | Conexao do servidor | Igual |
| Supabase | Pooler (porta 6543 ou 5432) | Conexao direta ou session pooler |

- No transaction pooler (porta 6543), adicione `?prepare=false` a `DATABASE_URL`.
- Toda tabela usa `.enableRLS()`, sem policies. No Postgres do Supabase isso fecha a
  Data API, que expoe o schema `public`. O app acessa como dono das tabelas e nao e
  afetado. Requisito de deploy: a role da `DATABASE_URL` precisa ser dona das tabelas.
  Com outra role, as operacoes falham com o codigo `42501`, registrado no log.

Variaveis:

- `DATABASE_URL`: runtime/API.
- `DIRECT_URL`: Drizzle Kit/migrations.

Regra arquitetural:

- Dados da aplicacao passam sempre pelo Drizzle, em qualquer Postgres.
- Nao usar `supabase.from()` para CRUD da app.
- Tabelas ligadas a usuario referenciam `profiles.id`. Nao use FK para `auth.users`:
  com Postgres fora do Supabase ela nem existe.
- `syncProfile` (`src/db/profiles.ts`) cria o perfil em `GET /api/me` e so grava se o
  e-mail mudar. `full_name` e copiado na criacao e depois pertence a aplicacao.

---

