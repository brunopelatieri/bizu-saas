# Hono API

- **Escopo:** Rotas `/api/*`, validação Zod e montagem no servidor único.
- **Specs relacionadas:** `docs/specs/saas-foundation/spec-rotas-api.md`
- **Paths do código:** `src/api/auth.ts`, `src/api/auth-ext.ts`, `src/api/guards.ts`, `src/api/permissions.ts`, `src/api/tenant-errors.ts`, `src/api/me.ts`, `src/api/tenant.ts`, `src/api/team.ts`, `src/api/roles.ts`, `src/api/invitations.ts`, `src/api/verification-guard.ts`, `src/api/rate-limit.ts`, `src/api/request-logger.ts`, `src/api/log.ts`, `src/api/app.ts`, `src/api/ready.ts`, `src/api/webhooks-email.ts`, `src/components/contact/contact-form.tsx`, `src/lib/schemas/contact.ts`, `src/server.ts`


## 6. Hono API

Arquivo: `src/api/app.ts`

Rotas atuais:

| Metodo | Rota | Funcao |
|--------|------|--------|
| GET | `/api/health` | Liveness simples |
| GET | `/api/ready` | Prontidão: `{ db, jobs }` (`SELECT 1` e fila `email.send`, timeout 2 s cada); 503 se algum falhar (`src/api/ready.ts`) |
| POST | `/api/webhooks/email/:provider` | Eventos de entrega, bounce e reclamação do provedor de e-mail (`src/api/webhooks-email.ts`): corpo bruto, assinatura conferida antes do JSON (400 se inválida), 404 se `:provider` não for o configurado; hard bounce e reclamação criam `email_suppression` |
| GET | `/api/me` | Rota privada: `{ user, tenants, permissions, features, limits }` |
| GET | `/api/me/invitations` | Convites abertos para o e-mail da sessão |
| GET, POST, PATCH | `/api/tenant`, `/api/tenant/active` | Criar, ler, editar e trocar o tenant ativo |
| GET, POST, PATCH, DELETE | `/api/team/*` | Equipe e convites |
| GET, POST, PATCH, DELETE | `/api/roles/*` | Papéis personalizados |
| GET, POST | `/api/invitations/:id`, `/:id/accept` | Lado de quem recebe o convite |
| POST | `/api/contact` | Persiste mensagem em `contact_messages` |
| POST | `/api/auth/sign-up/email` | Cadastro, com `signupSchema` e corpo uniforme |
| POST | `/api/auth/verify-email` | Consome o link, atras do `verificationGuard` |
| POST | `/api/auth-ext/resend-verification` | Reenvio, sempre `{ ok: true }` |
| POST | `/api/auth-ext/forgot-password` | Pedido de reset, sempre `{ ok: true }` |
| GET, POST | `/api/auth/*` | Demais rotas do Better Auth; `/api/auth/organization/*` responde 404 |

Autenticacao:

- `requireAuth` (`src/api/auth.ts`) le o cookie de sessao do Better Auth, consulta a
  sessao no banco e coloca `user`, `session` e `activeOrganizationId` no contexto.
- Sem cookie ou com sessao invalida: 401. E-mail nao verificado: 403
  `EMAIL_NOT_VERIFIED`. Auth indisponivel: 503.
- `requirePlatform()` vem depois de `requireAuth` e recusa com 403 quem nao e da plataforma.
- Rota de tenant: `requireAuth` + `requireTenant` + `requirePermission(recurso, acao)`
  (`src/api/permissions.ts`). Regras e tabela de rotas em `tech/21-tenant-rbac.md`.
- Essas rotas nao importam `@/db`: o Biome recusa (`biome.json`), e os dados passam por
  `src/lib/tenant/`. Erros saem por `handleTenantError`.
- Id de rota usa `validId`: malformado responde 404 sem chegar ao banco.
- Toda rota privada usa `authRateLimit` (60 por minuto) antes de `requireAuth`, porque
  cada sessao validada consulta o banco. O `ProtectedRoute` nao protege dados.
- No cliente, use `apiFetch` (`src/lib/api/client.ts`): envia cookies, padroniza erros em
  `ApiError` (com `code`) e, com 401 em `/app`, encerra a sessao e vai ao login.
- Detalhes do fluxo: `docs/context/tech/08-auth.md`.

Protecoes:

- `secureHeaders` em todas as rotas, inclusive paginas SSR. Ainda nao ha CSP, e o HSTS
  fica com o reverse proxy, que conhece o dominio e seus subdominios.
- `/api/contact`: `rateLimit` (5 por 10 minutos, por cliente) e `bodyLimit` (16 KB).
- O rate limit usa o IP da conexao. Atras de proxies, defina `TRUSTED_PROXY_HOPS`
  com a quantidade deles; sem isso, todos os clientes dividem o IP do proxy.
- O limite fica em memoria: com varias instancias, use um store compartilhado.
- `rateLimit({ key })` conta por outra chave; `/api/auth-ext/resend-verification` usa o
  hash do e-mail.
- `/api/auth/*`, `/api/auth-ext/*` e as rotas de tenant usam `jsonBodyLimit` (16 KB) e
  `sameOrigin` (`src/api/guards.ts`).
- `src/server.ts` liga `overrideGlobalObjects`: sem `Content-Length`, como em todo DELETE do
  navegador, o `bodyLimit` remonta a `Request` e responderia 500. Teste rota nova com corpo
  ou DELETE em `tests/db/tenant-http.test.ts`; `api.request()` nao passa por esse caminho.
- O log de requisicoes e `requestLogger` (`src/api/request-logger.ts`), que mascara
  `?token=`. O logger padrao do `react-router-hono-server` fica desligado.
- Respostas 5xx nao consomem tentativa; erros de validacao, sim.
- `logError` (`src/api/log.ts`) remove os parametros de query e credenciais de URL, e
  mantem o diagnostico dos demais erros. O cliente recebe mensagem generica.

Validacao:

- `src/lib/schemas/contact.ts` define `contactMessageSchema` com Zod.
- `src/api/app.ts` usa `@hono/zod-validator` em `/api/contact`.
- `src/components/contact/contact-form.tsx` reutiliza o mesmo schema antes do
  `fetch`, mantendo contrato consistente entre cliente e API.

O Hono e montado por `src/server.ts`:

```ts
export default await createHonoServer({
  configure(server) {
    server.route("/", api);
  },
});
```

Como tudo roda na mesma origem, o CORS antigo foi removido. Se o projeto expor a
API para outra origem no futuro (mobile app, CLI, integracoes externas), o CORS
deve voltar em escopo controlado.

---

