# SPEC: SaaS Foundation (índice)

- **Status:** rascunho
- **PRD:** `docs/specs/saas-foundation/prd.md`
- **Contexto carregado:** `core.md`, `status.md`, `tech/08-auth.md`, `tech/06-hono-api.md`,
  `tech/07-banco-drizzle.md`, `tech/14-deploy.md`, `tech/16-bugs-riscos.md`,
  `infra-deploy.md`, `receitas.md`, `ai-engineering.md`, além do código em `src/`.

> A SPEC passou de 300 linhas e foi dividida por domínio. Este arquivo é o índice,
> as decisões e as premissas. Abra só o arquivo do domínio que a fase toca.

| Arquivo | Conteúdo |
|---|---|
| `spec-auth.md` | Better Auth em duas instâncias, cadastro, verificação de e-mail por nível, convites, senha, 2FA, personificação |
| `spec-tenant-rbac.md` | Tenant, isolamento (`tenant_id` + RLS), identificação, catálogo de permissões e matriz por papel |
| `spec-dados.md` | Modelo de dados completo, migrations, papéis do Postgres, seed |
| `spec-billing.md` | Planos, trial, assinaturas, interface do módulo de pagamento, matriz de provedores, webhooks, reconciliação |
| `spec-email-jobs.md` | E-mail transacional, provedores, entrega (SPF/DKIM/DMARC), Mailpit, jobs com pg-boss |
| `spec-seguranca.md` | Modelo de ameaças, controles, CSRF, CSP, rate limit, segredos, LGPD, auditoria |
| `spec-rotas-api.md` | Mapa de rotas das três áreas e contratos da API |
| `spec-testes-operacao.md` | Plano de testes, variáveis de ambiente, tutorial do README, deploy, observabilidade, backups, repositório público |
| `spec-plano.md` | Fases de implementação, dependências, verificação, modelo de LLM por fase, lista de atualização de contexto |

## Onde entra

- [x] Pública com SSR: landing reposicionada, `/precos`, `/legal/*`, páginas de auth.
- [x] API Hono (`src/api/`): auth montado em `/api/auth/*` e `/api/portal/auth/*`,
  rotas de negócio em `/api/*`, webhooks em `/api/webhooks/*`.
- [x] Áreas client-only: `/app/**`, `/admin/**`, `/portal/**` (sem `loader` sensível).

## Levantamento: existe, falta, remove

**Existe e fica:** React Router 7 SSR com Hono em processo único; Drizzle +
postgres.js; `requireAuth` com falha fechada (`src/api/auth.ts`); `rateLimit` em
memória com `TRUSTED_PROXY_HOPS`; `logError` sem PII; `secureHeaders`; Zod
compartilhado; `apiFetch`; TanStack Query; shadcn/ui; tema; Biome, Vitest, CI;
Dockerfile multi-stage; `docker-compose.yml` com Postgres; `/api/contact`.

**Existe e muda:** `verifyToken` e `noProvider` (pontos de integração) viram Better
Auth; `AuthUser` ganha papel e tenant ativo; `/dashboard/**` vira `/app/**`;
`rateLimit` ganha store em Postgres; `secureHeaders` ganha CSP com nonce; `.env.example`,
`docker-compose.yml` (Mailpit, roles do Postgres), Dockerfile (migrations), CI
(Postgres de serviço).

**Falta:** tudo de auth real, tenant, RBAC, planos, billing, webhooks, e-mail,
jobs, auditoria, LGPD, `/admin`, `/portal`, onboarding, seed, LICENSE/CONTRIBUTING/
SECURITY/CHANGELOG, tutorial completo.

**Remove:** posicionamento "não é SaaS" em `CLAUDE.md`, README, landing
(`hero-section`, `faq-section`, `about-section`, `projects-page`), `core.md`,
`ai-engineering.md`, `17-roadmap.md`, `18-conclusao.md`, `01-visao-geral.md`,
`10-site-publico.md` e `.cursor/rules/ai-context-governance.mdc`; placeholders
`/dashboard/projetos|arquivos|relatorios`; `src/lib/constants/projects.ts` como
vitrine pessoal; stubs `AI_CONTEXT.md` e `PROJECT_TECHNICAL_SPEC.md`; migrations
antigas de `profiles` ficam no histórico (não se apaga migration aplicada). A lista
exata de arquivos está em `spec-plano.md`.

## Decisões

| Decisão | Motivo | Alternativas descartadas |
|---|---|---|
| **Better Auth 1.7.x** com `@better-auth/drizzle-adapter`, sessões no Postgres | Roda sobre o Drizzle já adotado; plugins oficiais de organização (papéis dinâmicos, convites), admin (personificação, ban), 2FA, magic link e OTP; rate limit com storage em banco; sem serviço externo | **Auth.js**: sem organizações nem 2FA nativos, foco em OAuth. **Lucia**: descontinuada como biblioteca, virou guia. **Clerk/Auth0/Supabase Auth**: hospedados, prendem o projeto e contrariam "tudo sobre Postgres". **Auth própria**: mais risco de erro em fluxo sensível e mais código para manter |
| **Duas instâncias do Better Auth**: `auth` (plataforma e equipe) e `portalAuth` (clientes/leads), mesma biblioteca, tabelas e cookies distintos | Decisão do usuário: clientes separados. Reusar a biblioteca evita duplicar verificação, reset, 2FA e rate limit | Tabela única com flag `kind` (rejeitada pelo usuário); auth própria só para o portal (duplicaria código sensível) |
| **Identidade do cliente é global por e-mail, vínculo por tenant** (`portal_user` + `customer`) | A tabela de usuário do Better Auth exige e-mail único; o vínculo `customer` por tenant permite o mesmo e-mail em vários tenants e isola os dados | Um `portal_user` por tenant (quebra a unicidade de e-mail do Better Auth); e-mail composto `tenant:email` (gambiarra) |
| **Organização ativa na sessão + caminho**, um domínio por instalação | Decisão do usuário. Cookies simples, sem TLS wildcard, sem resolução de host no SSR | Subdomínio por tenant e `/t/:slug` (módulo futuro de white label) |
| **`tenant_id` na aplicação + RLS no Postgres** com papel de runtime sem `BYPASSRLS` e `set_config('app.tenant_id')` por transação | Decisão do usuário. Query esquecida vira resultado vazio, não vazamento | Só aplicação (uma query vaza tudo); schema por tenant (migrations N vezes, pooling difícil) |
| **Verificação por link com página de confirmação** (GET não consome; botão faz POST) + camada própria de uso único e invalidação | Exigência do PRD; resiste a scanners; Better Auth não armazena o token (JWT) nem invalida anteriores | OTP numérico puro (não é "link"); link que verifica no GET (scanner consome); reimplementar tudo (mais código) |
| **Portal com magic link** de uso único e hash em banco (`storeToken: "hashed"`), senha opcional | Primeira entrada do lead sem senha; o clique prova o e-mail; cabe em "link de verificação" | Senha temporária por e-mail (insegura); OTP (mais atrito no celular) |
| **Clique em convite não substitui verificação** para equipe; convite de cliente é magic link e verifica | Equipe acessa dados do tenant: regra única e auditável. Cliente: o próprio link mágico prova a posse | Convite valendo como verificação para equipe (dois caminhos de verificação) |
| **Núcleo de billing próprio + módulos** por provedor em `src/lib/payments/providers/<id>/`; Stripe e Asaas primeiro | Estado da assinatura mora no Postgres; provedor só executa e notifica; módulo some ao apagar a pasta | Stripe Billing como fonte da verdade (prende); biblioteca de billing genérica (não cobre Pix/boleto BR) |
| **Fluxo (b) é módulo futuro**, mas `tenant_payment_credential` e `PaymentContext.credentials` já existem na interface | Decisão do usuário; evita refazer a interface depois | Entregar (b) agora (dobra webhooks e onboarding de subcontas) |
| **E-mail por interface `EmailProvider`**: SMTP (nodemailer) e Resend na primeira entrega | SMTP cobre Mailpit e qualquer provedor; Resend tem SDK simples e webhooks de bounce | Só SMTP (sem bounce estruturado); só Resend (sem Mailpit) |
| **Jobs com pg-boss 12.x** no mesmo processo, com modo worker separado por env | Só Postgres, sem Redis; cron, retry com backoff, dead letter | Graphile Worker (sem cron nativo tão simples); BullMQ (Redis); setInterval (sem retry nem persistência) |
| **Rate limit em Postgres** para rotas próprias e `rateLimit.storage: "database"` no Better Auth | Vale com mais de uma instância sem Redis | Memória (atual); Redis (serviço extra) |
| **Auditoria em tabela própria** `audit_log`, sem PII em texto livre | Base para personificação, LGPD e suporte | Só logs (não consultáveis por tenant) |
| **Personificação com consentimento** registrado em `impersonation_grant`, 1 h, banner, bloqueio de ações financeiras | Exigência do PRD; admin plugin dá o mecanismo, a política é nossa | Personificação livre pelo admin (sem consentimento) |
| **Arquivos, notificações, white label, API pública**: módulos ou fase futura | Mantém o núcleo enxuto | Entregar tudo agora |
| **Manter React Router 7.18** nesta entrega | Não misturar migração de framework com auth e billing | Migrar para RR8 junto |

## Premissas registradas

- Domínio único por instalação, HTTPS no reverse proxy, `TRUSTED_PROXY_HOPS=1`.
- Trial padrão 14 dias no plano "Pro"; carência de inadimplência 7 dias; ambos em
  `platform_setting` e editáveis em `/admin/configuracoes`.
- Upgrade imediato com proração do provedor quando houver; downgrade e cancelamento
  no fim do período, em todos os provedores.
- Cadastro de cliente por auto-serviço no portal desligado por padrão (`tenant.settings.portal_self_signup`).
- Proprietário é criado por seed ou `npx auth create-admin`, nunca por cadastro público.
- 2FA obrigatório para papéis de plataforma quando `NODE_ENV=production`.
- Idioma pt-BR, moeda BRL, timezone de exibição `America/Sao_Paulo`, banco em UTC.
- Mercado Pago é o próximo módulo depois de Stripe e Asaas.
- Templates de e-mail só por código nesta entrega.

### Desvios da SPEC na fase 2 (auth)

Conferidos no código do Better Auth 1.7.18. Em cada caso seguiu a alternativa mais segura.

| Previsto | Implementado | Motivo |
|---|---|---|
| Botão chama `authClient.verifyEmail`, guard em `/api/auth/verify-email` | `POST /api/auth/verify-email` próprio, que passa pelo guard e remonta um GET interno; GET externo responde 405 | O endpoint do Better Auth é GET e consumiria o token em qualquer visita, contra a regra de nenhum token em GET |
| Guard apaga a linha "na mesma transação" do Better Auth | `DELETE ... RETURNING` antes de chamar o Better Auth | Não dá para compartilhar a transação com o handler. Se ele falhar depois, o link se perde e a pessoa pede outro |
| `requireEmailVerification` já dá resposta anti-enumeração no cadastro | Rota própria devolve sempre `{ ok: true }` | O corpo do Better Auth traz id e datas e não é idêntico entre e-mail novo e existente |
| Better Auth valida `Origin` | `sameOrigin` em todo `/api/auth/*` e `/api/auth-ext/*` | Ele só valida quando há cookie; cadastro e login aceitariam envio de outro site |
| `afterEmailVerification` envia `change-email-done` ao antigo | Mantido, lendo o e-mail antigo das claims do token | Nesse hook o usuário já tem o e-mail novo |
| Instância `auth` exportada | `getAuth()` | `src/server.ts` carrega `.env.local` depois dos imports |
| `npx auth generate` e `@better-auth/cli` | Schema escrito a partir de `getAuthTables` | A CLI está na 1.4.21, atrás da 1.7, e traz Prisma e `better-sqlite3` |
| `session.cookieCache` em tudo | Mantido em `/get-session`; `requireAuth` lê do banco | Sessão revogada precisa cair na hora |
| `audit_log` em `afterEmailVerification` e `onPasswordReset` | Não grava | A tabela chega na fase 4 |
| `consent_log` no cadastro | Aceite exigido, sem registro | A tabela chega na fase 10 |
| Rate limit em Postgres nas rotas próprias | `rateLimit` em memória | `rate_limit_bucket` é da fase 9 |
| `platform_support` só sem `delete`, `set-role` e `set-password` | Também sem `ban` e sem `session.revoke` | O plugin não compara o papel do alvo: o suporte baniria o proprietário. `spec-tenant-rbac.md` não dá essas ações ao suporte |
| Cadastro pendente sem prazo | Expira em 24 h: sem link novo, e novo cadastro recria a conta | Conta pendente guarda a senha de quem cadastrou. A janela de 24 h é risco aceito pelo usuário, que manteve a confirmação em um clique (`tech/16-bugs-riscos.md`, RISK-006) |

### Desvios da SPEC na fase 4 (tenant e RBAC)

Conferidos no código do Better Auth 1.7.18. Em cada caso seguiu a alternativa mais segura.

| Previsto | Implementado | Motivo |
|---|---|---|
| Plugin com rotas HTTP; `authClient.organization.setActive` | `/api/auth/organization/*` responde 404; tudo passa por rotas próprias e `auth.api.*`; troca em `POST /api/tenant/active`, sem `organizationClient` | As rotas do plugin pulam `requireTenant`, reservadas, último owner com trava e auditoria |
| Reservadas em `beforeCreateOrgRole`/`beforeUpdateOrgRole` | `roleSchema` nas rotas `/api/roles` | Esses hooks não existem na 1.7.18 |
| `requirePermission` chama `auth.api.hasPermission` | Lista única de `loadRoleCatalog`, usada também por `/api/me`; teste compara com `hasPermission` | Evita outra leitura de sessão por checagem e `/api/me` precisaria da lista de qualquer forma |
| `requirePermission("customer:delete")` | `requirePermission("customer", "delete")` | Forma pedida na fase, tipada pelo catálogo |
| Só `admin` não altera `owner` | `canActOnRole`: ninguém concede ou altera papel com mais permissões que o seu | Papel personalizado com `member:update` promoveria alguém a `admin` |
| Último owner pela checagem do plugin | Troca de papel e remoção próprias, em transação com `FOR UPDATE` | Dois owners se rebaixando ao mesmo tempo deixavam o tenant sem nenhum |
| Colunas extras por `additionalFields` | Colunas lidas por Drizzle; o plugin não as conhece | Nada delas entra pela API do plugin; `requireTenant` já as lê direto |
| `billing_profile_id` em `organization` | Fora | `spec-dados.md` usa `billing_profile.tenant_id`; chega com a fase 5 |
| `organization_role.permission` jsonb | `text` | O plugin grava e relê JSON serializado; em jsonb viraria uma string dentro do JSON |
| `withTenant` em `src/db/tenant.ts`, `tenantPolicy` em `src/db/rls.ts` | `withTenant` em `src/db/rls.ts`; `tenantPolicy` em `src/db/tenant-policy.ts` | O Drizzle Kit carrega o schema sem `@/` nem ambiente; `rls.ts` importa a conexão |
| Policy `to bizu_app` | `to bizu_app, bizu_owner` | Com `FORCE`, o dono sem policy não acessa nada, e o seed precisa gravar |
| `/app/equipe/papeis` | Seção em `/app/configuracoes` | Pedido da fase; `GET /api/roles` exige `role:create`, porque o catálogo não tem `role:read` |
| `callbackURL=/convite/:id/aceitar` na verificação | Onboarding lista os convites abertos do e-mail verificado | A verificação pode ocorrer em outro aparelho; o link do e-mail ignora a `url` do Better Auth |
| `customer` em `rls.test.ts` | `audit_log` | `customer` chega na fase 8; o inventário cobrirá |
| `tenant_id` em `email_message` | Sem a coluna | `spec-dados.md` a deixa sem RLS, e o inventário exige RLS em toda tabela com a coluna |

Fora desta fase: perfil de cobrança e trial no onboarding, `checkLimit`, `POST /api/team/transfer`
(dá para promover outro owner e se rebaixar), sair da organização, `/trocar-organizacao`,
`/app/auditoria` e `DELETE /api/tenant`.

## Não verificado (marcar antes de implementar)

- Better Auth, conferido na 1.7.18: token de verificação é JWT HS256; `expiresIn` vale;
  `beforeEmailVerification` não expõe o token, mas a `request` traz a URL com ele; o campo
  da sessão se chama `impersonatedBy`; `send-verification-email` responde igual para e-mail
  inexistente quando não há sessão.
- Drizzle Kit, conferido na 0.31: gera `pgPolicy` com papel próprio em string, sem `entities.roles`;
  `FORCE ROW LEVEL SECURITY` fica em migration customizada.
- Stripe: Connect com contas conectadas brasileiras; `application_fee_amount`;
  cartão no Brasil (assumido disponível); assinatura por boleto (listada como
  "recurring ✓" mas "off-session ✗").
- Asaas: trial em assinaturas (não há campo); header de idempotência (não há);
  número e intervalo de retentativas de webhook; eventos de assinatura.
- Mercado Pago: template exato do manifest do `x-signature`; `X-Idempotency-Key`;
  campos de `POST /preapproval`; split em assinaturas.
- Pagar.me: autenticação de webhook (nenhuma assinatura documentada); endpoint de
  estorno; URL de sandbox (mesma base, chave de teste).
- PagBank: eventos de webhook (nomes); idempotência na API de pedidos; trial.
- pg-boss: 12.38.1 no npm hoje; exige Node ≥ 22.12 e Postgres ≥ 13 segundo o README.
- Google/Yahoo: exigências de remetente (SPF, DKIM, DMARC, unsubscribe em marketing)
  vieram de fontes de terceiros; conferir nas páginas oficiais ao configurar DNS.

## Fontes consultadas

- Better Auth: `/docs/concepts/email`, `/docs/concepts/users-accounts`,
  `/docs/authentication/email-password`, `/docs/plugins/organization`, `/docs/plugins/admin`,
  `/docs/plugins/2fa`, `/docs/plugins/email-otp`, `/docs/plugins/magic-link`,
  `/docs/concepts/rate-limit`, `/docs/concepts/cookies`, `/docs/concepts/session-management`,
  `/docs/adapters/drizzle`, `/docs/integrations/hono`, `/docs/concepts/database`,
  `/docs/plugins/bearer`, `/docs/reference/options` em `https://better-auth.com`.
- Drizzle RLS: `https://orm.drizzle.team/docs/rls`.
- Stripe: `docs.stripe.com/payments/pix`, `/payments/boleto`, `/webhooks`,
  `/billing/subscriptions/overview`, `/billing/subscriptions/webhooks`,
  `/billing/subscriptions/pause-payment`, `/billing/subscriptions/cancel`,
  `/billing/revenue-recovery/smart-retries`, `/connect`, `/connect/charges`,
  `/api/idempotent_requests`, changelog `2026-04-22` (Pix recorrente).
- Asaas: `docs.asaas.com/docs/autenticação-1`, `/docs/sandbox`, `/docs/o-que-pode-ser-testado`,
  `/reference/criar-nova-assinatura`, `/docs/split-de-pagamentos`, `/docs/estornos`,
  `/reference/estornar-cobranca`, `/docs/sobre-os-webhooks`, `/docs/webhook-para-cobrancas`,
  `/docs/retries-e-idempotência`, changelog de obrigatoriedade do `authToken`.
- Mercado Pago: `/developers/pt/docs/subscriptions/overview`,
  `/checkout-pro-preferences/additional-content/notifications/webhooks`,
  `/checkout-pro-preferences/how-tos/integrate-marketplace`,
  `/checkout-api-orders/payment-management/refunds-cancellations`.
- Pagar.me: `docs.pagar.me/reference/criar-pedido-2`, `/reference/assinaturas-1`,
  `/reference/eventos-de-webhook-1`, `/docs/webhooks`, `/docs/chaves-de-acesso`.
- PagBank: `developer.pagbank.com.br/reference/criar-pedido`, `/reference/cancelar-pagamento`,
  `/reference/divisao-de-pagamento`, `/reference/criar-assinatura`,
  `/reference/validacao-de-autenticidade`, `/reference/webhooks`,
  `/docs/ambientes-disponiveis`, `/docs/token-de-autenticacao`,
  `/docs/chaves-publicas-e-de-idempotencia`.
- Verificação de e-mail e scanners: OWASP Forgot Password Cheat Sheet;
  `docs.descope.com/flows/use-cases/email-scanner`; `flaviocopes.com/scanner-safe-double-opt-in`.
- pg-boss: `github.com/timgit/pg-boss` (README). Mailpit: `github.com/axllent/mailpit`.
- Versões no npm em 2026-11-05: better-auth 1.7.18, @better-auth/drizzle-adapter 1.7.18,
  @better-auth/cli 1.4.21, pg-boss 12.38.1, drizzle-orm 0.45.4, hono 4.13.16,
  nodemailer 10.3.1, resend 6.37.0, stripe 23.1.0, mercadopago 3.6.1, react-router 8.5.1
  (projeto em 7.18.5).
