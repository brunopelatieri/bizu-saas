# Hono API

- **Escopo:** Rotas `/api/*`, validação Zod e montagem no servidor único.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** `src/api/app.ts`, `src/components/contact/contact-form.tsx`, `src/lib/schemas/contact.ts`, `src/server.ts`

<!-- ORIGEM: PROJECT_TECHNICAL_SPEC.md L251-284 -->
## 6. Hono API

Arquivo: `src/api/app.ts`

Rotas atuais:

| Metodo | Rota | Funcao |
|--------|------|--------|
| GET | `/api/health` | Healthcheck |
| POST | `/api/contact` | Persiste mensagem em `contact_messages` |

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

