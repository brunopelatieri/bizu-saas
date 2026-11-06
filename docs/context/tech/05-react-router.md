# React Router Framework Mode

- **Escopo:** Arquivos principais, rotas públicas com SSR e blog.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** `src/lib/content/posts.ts`, `src/root.tsx`, `src/routes.ts`, `src/routes/*.tsx`, `src/routes/about.tsx`, `src/routes/blog-post.tsx`, `src/routes/blog.tsx`, `src/routes/contact.tsx`, `src/routes/home.tsx`, `src/routes/projects.tsx`


## 5. React Router Framework Mode

### Arquivos Principais

- `react-router.config.ts`
  - `appDirectory: "src"`
  - `ssr: true`
- `src/root.tsx`
  - Define documento HTML.
  - Registra `<Meta />`, `<Links />`, `<Scripts />`, `<ScrollRestoration />`.
  - Monta `ThemeProvider`, `AuthProvider` e `Toaster`.
  - Injeta script anti-flash para tema dark/light.
- `src/routes.ts`
  - Configuracao declarativa das rotas.
  - Divide rotas publicas, auth standalone e areas autenticadas (/app, /admin, /portal).
- `src/routes/*.tsx`
  - Route modules com `meta`, `loader` quando necessario e componente default.

### Rotas Publicas com SSR

| Rota | Arquivo | SEO |
|------|---------|-----|
| `/` | `src/routes/home.tsx` | title, description, OG |
| `/sobre` | `src/routes/about.tsx` | title, description |
| `/projetos` | `src/routes/projects.tsx` | title, description |
| `/contato` | `src/routes/contact.tsx` | title, description |
| `/blog` | `src/routes/blog.tsx` | title, description, OG |
| `/blog/:slug` | `src/routes/blog-post.tsx` | title, description, OG dinamico |
| `/precos` | `src/routes/pricing.tsx` | title, description, OG; `loader` com os planos ativos |

### Rotas de Autenticacao

Standalone, com `noindex`, sem `loader` nem `action`:

| Rota | Arquivo | Funcao |
|------|---------|--------|
| `/login` | `src/routes/auth/login.tsx` | Login, com `?next=` validado por `safeNextPath` |
| `/cadastro` | `src/routes/auth/signup.tsx` | Cadastro de owner |
| `/verificar-email` | `src/routes/auth/verify-email.tsx` | Renderiza; o botao consome `?token=` |
| `/esqueci-senha` | `src/routes/auth/forgot-password.tsx` | Pede o link de reset |
| `/redefinir-senha` | `src/routes/auth/reset-password.tsx` | Renderiza; o formulario consome `?token=` |
| `/convite/:id` | `src/routes/auth/invite.tsx` | Renderiza; o botao aceita o convite |

### Blog

Estado anterior:

- Conteudo estatico em `src/lib/content/posts.ts`.
- `loader` de `/blog` retorna `getAllPosts()`.
- `loader` de `/blog/:slug` retorna `getPostBySlug(params.slug)`.
- `meta` do post usa dados do loader para gerar Open Graph dinamico.

Evolucao planejada:

- Criar tabela `posts` no Drizzle.
- Trocar implementacao de `getAllPosts()` e `getPostBySlug()` por queries
  Drizzle.
- Manter os loaders chamando as mesmas funcoes, sem HTTP interno.

---

