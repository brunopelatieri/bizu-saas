# Receitas

- **Escopo:** Passo a passo das tarefas mais comuns em um projeto derivado.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** `src/db/schema.ts`, `src/api/app.ts`, `src/routes.ts`, `src/lib/constants/`

## Personalizar a marca

1. Edite `siteConfig` em `src/lib/constants/navigation.ts`: nome, descrição, URL e links.
2. Troque os arquivos de imagem em `public/` e as URLs de `sitemap.xml` e `robots.txt`.
3. Ajuste os títulos em `src/routes/*.tsx` e as seções de `src/components/landing/`.
4. Remova o que for da demonstração: `src/lib/constants/projects.ts`, posts de exemplo
   em `src/lib/content/posts.ts` e os cards de exemplo do dashboard.

## Criar uma tabela

Em `src/db/schema.ts`:

```ts
export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});
```

Depois gere e aplique a migration:

```bash
npm run db:generate
npm run db:migrate
```

## Criar uma rota privada

Em `src/api/app.ts`, use `authRateLimit` e `requireAuth`, e **filtre sempre pelo dono**. O middleware só
prova quem é o usuário; quem decide o que ele pode ver é a query.

```ts
api.get("/api/notes", authRateLimit, requireAuth, async (c) => {
  const user = c.get("user");
  const rows = await getDb()
    .select()
    .from(notes)
    .where(eq(notes.userId, user.id));

  return c.json({ notes: rows });
});
```

- Valide a entrada com `zValidator` e um schema em `src/lib/schemas/`.
- Enquanto não houver provedor de autenticação, estas rotas respondem 401 ou 503.
- Envolva o acesso ao banco em `try/catch` e registre com `logError`.
- Teste com `api.request()`, como em `src/api/app.test.ts`.

## Criar uma tela no dashboard

1. Crie o route module em `src/routes/dashboard.notes.tsx`, com `meta` e sem `loader`.
2. Registre em `src/routes.ts`, dentro do layout do dashboard.
3. Adicione o item em `src/lib/constants/dashboard-nav.ts` (menu e título).
4. Busque os dados com TanStack Query e `apiFetch`, seguindo `AccountCard`.

```ts
const { data } = useQuery({
  queryKey: ["notes"],
  queryFn: () => apiFetch<{ notes: Note[] }>("/api/notes"),
});
```

## Adicionar recursos opcionais

O template não instala o que nem todo projeto usa. Quando precisar:

| Recurso | Pacote | Observação |
|---|---|---|
| Tabelas ricas | `@tanstack/react-table` | Junto com o componente `table` do shadcn/ui |
| Gráficos | `recharts` | Use os tokens `chart-1` a `chart-5` |
| Datas | `date-fns` | Formate em pt-BR |
| E-mail | `nodemailer` | Só em `src/api/`, com SMTP em variáveis de runtime |

## Criar uma página pública

1. Crie o route module em `src/routes/`, com `meta`.
2. Use `loader` só para dados públicos e indexáveis.
3. Registre em `src/routes.ts` e adicione o link em `src/lib/constants/navigation.ts`.
4. Inclua a URL em `public/sitemap.xml`.
