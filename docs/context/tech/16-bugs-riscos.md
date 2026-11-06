# Bugs, riscos e ajustes

- **Escopo:** Histórico de bugs corrigidos e riscos abertos.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** `src/api/app.ts`, `src/lib/content/posts.ts`, `src/lib/schemas/contact.ts`, `src/server.ts`


## 16. Bugs, Riscos e Ajustes Recomendados

### BUG-001 — `.env.example` ainda indicava `PORT=3001` (corrigido)

Estado anterior:

- O projeto migrou para processo unico.
- `Dockerfile` e runtime usam `PORT=3000`.
- `.env.example` ainda documenta `PORT=3001` como "API Hono".

Impacto:

- Confunde novos projetos criados a partir do template.
- Pode fazer o dev subir o app em porta diferente da documentada no Docker.

Status:

- Corrigido para `PORT=3000`.
- Comentario atualizado para "Servidor unico — React Router SSR + Hono API".

### BUG-002 — `README.md` estava desatualizado pos-migracao (corrigido)

Estado anterior:

- README ainda fala em Vite `:5173` + API `:3001`.
- Lista scripts que nao existem mais: `dev:client`, `dev:server`.
- Mostra estrutura antiga com `server/`.

Impacto:

- Onboarding incorreto.
- Template perde confiabilidade para novos projetos.

Status:

- README reescrito para Framework Mode, Hono unificado, metodologia AI Software
  Engineering, scripts atuais e deploy VPS/Docker/Portainer.

### BUG-003 — `.cursor/rules/portal-stack.mdc` estava desatualizada (corrigido)

Estado anterior:

- A rule diz que API Hono fica em `server/` e `/api` passa por proxy Vite.
- A arquitetura atual usa `src/api/app.ts` + `src/server.ts` em processo unico.

Impacto:

- Agentes futuros podem seguir instrucao antiga e recriar arquitetura errada.

Status:

- Rule atualizada para React Router Framework Mode + Hono integrado.
- Marcada como `alwaysApply: true`.

### BUG-004 — `.cursor/rules/portal-scope.mdc` conflitava com o estado atual (corrigido)

Estado atual:

- A rule diz "Nao adicionar auth de usuarios, dashboard ou pagamentos sem spec
  aprovada".
- O projeto ja possui login, dashboard inicial e dependencias de pagamentos.

Impacto:

- Agentes podem bloquear evolucoes legitimas do proprio template.

Status:

- Rule atualizada para o novo objetivo: template multiuso para SaaS, portal,
  site, blog, dashboard e sistemas web.

### BUG-005 — `next-themes` instalado mas nao usado (corrigido)

Estado atual:

- `next-themes` aparece em `package.json`.
- Nao ha imports de `next-themes` no codigo.
- O tema usa provider proprio com Zustand.

Impacto:

- Dependencia orfa.
- Aumenta superficie de manutencao sem beneficio.

Status:

- Dependencia removida com `npm uninstall next-themes`.

### BUG-006 — DELETE respondia 500 no servidor Node (corrigido)

O `bodyLimit` do Hono remonta a `Request` quando não há `Content-Length`, como em todo DELETE
do navegador. O `react-router-hono-server` liga o @hono/node-server com
`overrideGlobalObjects: false`, e o construtor nativo não aceita o objeto dele. Os testes não
viam: `api.request()` entrega um `Request` nativo, e `serve()` usa `true`. Corrigido com
`overrideGlobalObjects: true` em `src/server.ts`. Regressão em `tests/db/tenant-http.test.ts`.

### RISK-001 — `/api/contact` ainda nao usava Zod (corrigido)

Estado atual:

- `@hono/zod-validator` e `zod` estao instalados.
- A rota ainda faz validacao manual simples.

Impacto:

- Menos consistencia entre forms e API.
- Risco de validacoes divergentes no futuro.

Status:

- Criado `src/lib/schemas/contact.ts`.
- Aplicado `zValidator("json", contactMessageSchema)` em `src/api/app.ts`.
- Formulario de contato reutiliza `contactMessageSchema.safeParse`.

### RISK-002 — Migrations nao estao no runtime Docker

Estado atual:

- `.dockerignore` exclui `drizzle/`.
- Runtime Docker usa `npm ci --omit=dev`, portanto nao inclui `drizzle-kit`.

Impacto:

- O container de app nao executa migrations.
- Isso e aceitavel se migrations forem uma etapa separada no deploy.

Acao recomendada:

- Documentar explicitamente no README/Portainer: migrations devem rodar em job
  separado ou pipeline.

### RISK-003 — Blog ainda e estatico

Estado atual:

- Blog SSR funcional, mas dados vivem em `src/lib/content/posts.ts`.

Impacto:

- Bom para template inicial.
- Ainda nao atende CMS/blog dinamico.

Acao recomendada:

- Criar tabela `posts` no Drizzle quando o blog virar feature real.

### RISK-004 — Alertas moderados em dependencias

Estado atual:

- `npm audit --omit=dev` aponta 5 alertas moderados, sem altos ou criticos, todos na
  cadeia do `react-router-hono-server` (`@hono/node-server`, `@hono/node-ws`,
  `@hono/vite-dev-server` e `minimatch`).

Impacto:

- O mais relevante e o `serveStatic` do `@hono/node-server`, usado em producao.

Acao recomendada:

- A correcao exige `@hono/node-server` 2, que depende de `react-router-hono-server` 4
  e React Router 8. Fazer como migracao propria, nao como ajuste pontual.

### RISK-005 — Rate limit em memoria

Estado atual:

- O limite de `/api/contact` vive na memoria do processo. A chave e o IP da conexao,
  ou o de `X-Forwarded-For` quando `TRUSTED_PROXY_HOPS` esta definido.

Impacto:

- Atras de proxy e sem `TRUSTED_PROXY_HOPS`, todos dividem o limite do IP do proxy.
- Com varias instancias, cada uma conta separadamente.

Acao recomendada:

- Definir `TRUSTED_PROXY_HOPS` no deploy. Ao escalar, usar um store compartilhado.

---

### RISK-006 — Pré-sequestro de conta dentro de 24 h (risco aceito)

Quem cadastra o e-mail de outra pessoa define a senha antes de provar a posse. Se o dono
clicar no link em até 24 h, a senha do atacante continua valendo na conta verificada. O
prazo de `src/lib/auth/pending-signup.ts` fecha a conta deixada à espera por tempo
indeterminado, mas não essa janela.

Decisão do usuário: manter a confirmação em um clique. Pedir a senha na página de
confirmação fecharia a janela, mas acrescenta atrito ao cadastro de todo mundo, e o ataque
exige alvo específico e o clique da vítima dentro do prazo. Reavalie se o produto derivado
guardar dados sensíveis já no cadastro.

Falta também um job de limpeza (fase 3): hoje a conta vencida só some no próximo cadastro.
