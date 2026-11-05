# Hono API

- **Escopo:** Rotas `/api/*`, validação Zod e montagem no servidor único.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** `src/api/auth.ts`, `src/api/rate-limit.ts`, `src/api/log.ts`, `src/api/app.ts`, `src/components/contact/contact-form.tsx`, `src/lib/schemas/contact.ts`, `src/server.ts`

<!-- ORIGEM: PROJECT_TECHNICAL_SPEC.md L251-284 -->
## 6. Hono API

Arquivo: `src/api/app.ts`

Rotas atuais:

| Metodo | Rota | Funcao |
|--------|------|--------|
| GET | `/api/health` | Healthcheck |
| GET | `/api/me` | Rota privada: sincroniza e retorna o `profile` do usuario |
| POST | `/api/contact` | Persiste mensagem em `contact_messages` |

Autenticacao:

- `requireAuth` (`src/api/auth.ts`) exige `Authorization: Bearer <access_token>`,
  valida o token no Supabase Auth e coloca o usuario em `c.get("user")`.
- Sem token ou com token invalido: 401. Auth indisponivel ou limitando (429, 5xx): 503.
- Toda rota privada usa esse middleware; o `ProtectedRoute` nao protege dados.
- No cliente, use `apiFetch` (`src/lib/api/client.ts`), que envia o token da sessao.

Protecoes:

- `secureHeaders` em todas as rotas, inclusive paginas SSR. Ainda nao ha CSP.
- `/api/contact`: `rateLimit` (5 por 10 minutos, por cliente) e `bodyLimit` (16 KB).
- O rate limit usa o IP da conexao. Atras de proxies, defina `TRUSTED_PROXY_HOPS`
  com a quantidade deles; sem isso, todos os clientes dividem o IP do proxy.
- O limite fica em memoria: com varias instancias, use um store compartilhado.
- `logError` (`src/api/log.ts`) registra so tipo e codigo do erro, porque mensagens
  do Drizzle trazem os parametros da query. O cliente recebe mensagem generica.

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

