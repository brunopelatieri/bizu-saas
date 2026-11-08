# SPEC: Cobrança manual, verificação de e-mail opcional e limite de organizações

- **Status:** implementada
- **PRD:** sem PRD próprio; pedido do proprietário do template (provedores de pagamento
  adiados: `PAYMENT_PROVIDERS` vazio é o caminho padrão).
- **Contexto carregado:** `core.md`, `tech/08-auth.md`, `tech/21-tenant-rbac.md`,
  `tech/22-admin.md`, `tech/23-billing-planos.md`, `tech/24-billing-cobranca.md`,
  `docs/specs/saas-foundation/spec-billing.md`

## Objetivo

1. Cadastro entra direto por padrão; a verificação de e-mail vira opção.
2. Planos, limites, trial, vencimento, `read_only` e troca de plano funcionam sem módulo de
   pagamento.
3. O proprietário da plataforma marca em `/admin` quem pagou e quem não pagou, e o sistema de
   vencimento (período, carência, `past_due`, `unpaid`/`read_only`) anda com isso.
4. O plano limita quantas organizações o dono pode ter.
5. O seed mostra tudo isso.

Quando um módulo de provedor estiver ativo, a assinatura ligada a ele (com
`provider_subscription_ref`) segue como hoje: nada do controle manual mexe nela.

## Onde entra

- [x] API Hono (`/api/auth/sign-up/email`, `/api/tenant`, `/api/admin/*`, `/api/billing/plans`)
- [x] Dashboard client-only (`/admin/tenants/:id`, `/admin/planos/:id`, `/app/assinatura`,
  cadastro)
- [x] Job `billing.period_end` (vencimento manual)

## 1. Verificação de e-mail opcional

**Variável `EMAIL_VERIFICATION_REQUIRED`** (`src/lib/env.ts`, padrão `false`), não
`platform_setting`:

- A opção muda a construção da instância do Better Auth (`requireEmailVerification`,
  `sendOnSignUp`, `sendOnSignIn`, regra de convite), que é criada uma vez por processo.
  Lida do banco, exigiria recriar a instância ou ler a cada requisição no caminho crítico.
- É postura de segurança da implantação, como `CSP_REPORT_ONLY`: fica com quem opera o
  servidor, igual em todos os processos (web e worker), e não com uma conta do `/admin`
  que, comprometida, desligaria a prova de posse do e-mail.

| Peça | Ligada (`true`) | Desligada (padrão) |
|---|---|---|
| Better Auth | como hoje | `requireEmailVerification: false`, `sendOnSignUp/OnSignIn: false` |
| `POST /api/auth/sign-up/email` | `{ ok: true, verifyEmail: true }` | `{ ok: true, verifyEmail: false }` |
| Depois do cadastro | tela "Confirme seu e-mail" | o cliente entra com a mesma senha (`signIn.email`) |
| `requireAuth` | 403 `EMAIL_NOT_VERIFIED` | aceita e-mail não verificado |
| Cadastro pendente de 24 h | apagado no novo cadastro | nunca apagado: a conta já é usável |
| Criar organização | só verificado | qualquer conta |
| `GET /api/me/invitations` | verificado | **verificado** (sem isso, quem cadastrasse o e-mail de outra pessoa veria os convites dela) |
| Aceitar convite por id | verificado | basta ter o id (que só chega pelo e-mail) e o e-mail da sessão ser o do convite |

Regras que continuam:

- `autoSignIn: false` nas duas posições: o cadastro **nunca** abre sessão. Assim a resposta é
  byte a byte a mesma para e-mail novo e existente (o Better Auth devolve a resposta genérica e
  chama `onExistingUserSignUp`, que avisa o dono da conta).
- Nenhum token é consumido em GET; `/verificar-email` segue igual e continua disponível
  (verificar é opcional, mas destrava a lista de convites).
- **Risco residual, documentado:** com a verificação desligada, o login que o cliente faz logo
  depois do cadastro só funciona se a conta acabou de nascer com aquela senha. É o preço de
  "entrar direto": qualquer cadastro sem prova de posse revela, pelo login, se o e-mail já
  tinha conta. A resposta do cadastro em si não revela. Para produtos em que isso importa,
  ligue `EMAIL_VERIFICATION_REQUIRED=true`.

## 2 e 3. Cobrança manual

### Modo de cobrança

Não há coluna nova: **assinatura manual** é a que não tem `provider_subscription_ref` (ou tem,
mas encerrada). Assinatura viva no provedor é do provedor. A plataforma está em "modo manual"
quando `PAYMENT_PROVIDERS` está vazio; com provedor ativo, as assinaturas sem referência
continuam manuais e o admin ainda pode marcá-las.

### Preço manual

`plan_price.provider` aceita `"manual"` (`billingProviderIds` em `constants.ts`; a coluna é
`text` sem `CHECK`, então não precisa de migration para isso). O preço manual é editado na
mesma tela de preços do plano, sem `provider_price_ref`. `getProvider("manual")` é `null`, então
o checkout nunca o aceita. `/precos` e `GET /api/billing/plans` mostram os preços manuais quando
não há provedor ativo.

### Modelo de dados

| Tabela | Mudança | Observação |
|---|---|---|
| `invoice` | `period_start`, `period_end` (timestamptz, nulos) | período que a fatura cobre; o provedor pode deixar nulo |
| `invoice.provider` | aceita `"manual"` | `provider_ref` nulo; a unique `(provider, provider_ref)` não colide com nulos |
| `plan.limits` | chave `organizations` | jsonb, sem migration |

**Migration:** `drizzle/0020_cobranca_manual.sql`, só `ADD COLUMN` nulas. **Rollout:** sem
backfill; faturas antigas ficam com período nulo.

### Máquina de estados (eventos novos, `state-machine.ts`)

| Evento | De | Para | Observação |
|---|---|---|---|
| `manual.paid` | qualquer (exceto assinatura viva no provedor) | `active` + `full` | período novo; limpa carência e avisos de cobrança |
| `manual.unpaid` | `active`, `trialing` | `past_due` + `grace_until = agora + grace_days` | `immediate`: direto a `unpaid` + `read_only` |
| `manual.unpaid` `immediate` | `past_due` | `unpaid` + `read_only` | |
| `manual.due` | `active` com período vencido, plano pago, sem provedor | `past_due` + `grace_until = fim do período + grace_days` | job |

Depois disso, `past_due → unpaid + read_only` é o `billing.dunning` de sempre, com os avisos
T-3/T0. Trial manual continua no `billing.trial` (`expired` + `read_only`).

**Período no pagamento:** em `active` ou `past_due`, o novo período começa no início da fatura
aberta ou no vencimento (quem paga atrasado paga o período que usou; quem paga adiantado não
perde dias). Nos demais estados, começa agora. Nunca termina no passado: se terminaria, começa
agora. O fim soma o intervalo do preço escolhido (`month` = 1 mês de calendário, `year` = 1 ano),
e a fatura paga é corrigida para esse período e valor. Sem preço manual, a ação responde 409
`MANUAL_PRICE_REQUIRED`.

### Faturas manuais (`src/lib/billing/manual.ts`)

- O job abre a fatura do período seguinte (`open`, `due_at` = fim do período), se não houver
  outra aberta; sem preço manual, transita sem fatura e registra no log.
- "Marcar como paga": a fatura aberta (ou a indicada) vira `paid`; sem fatura, cria uma já paga.
- "Marcar como não paga": a fatura aberta (ou a indicada) vira `failed`; sem fatura, cria uma
  `failed` para o período devido.
- Troca de plano anula (`void`) as faturas manuais em aberto: o valor era do plano antigo.

### Troca de plano pelo admin

`PUT /api/admin/tenants/:id/plan` continua. Novo: plano pago em assinatura `active` sem período
(vindo do gratuito) ganha vencimento **agora** (`current_period_end = agora`): o job abre a
fatura e a carência começa; o admin registra o pagamento quando ele chegar. Plano gratuito limpa
o período. Assinatura viva no provedor continua 409 `PROVIDER_SUBSCRIPTION_ACTIVE`.

### Contratos

| Método e rota | Entrada (Zod, `schemas/admin.ts`) | Saída | Autorização |
|---|---|---|---|
| `POST /api/admin/subscriptions/:id/manual-payment` | `manualPaymentSchema` `{ invoiceId?, planPriceId?, method? }` | `{ subscription, invoice }` | `requireAuth` + `requirePlatform(["platform_owner"])` |
| `POST /api/admin/subscriptions/:id/manual-unpaid` | `manualUnpaidSchema` `{ invoiceId?, immediate? }` | `{ subscription, invoice }` | idem |
| `GET /api/admin/tenants/:id` | — | soma período, carência, modo e as 12 últimas faturas | plataforma |
| `GET /api/billing/plans` | — | soma `billingMode` e `manualPrices` | `billing:read` |

Erros: 404, 409 `PROVIDER_SUBSCRIPTION_ACTIVE`, `FREE_PLAN`, `MANUAL_PRICE_REQUIRED`,
`INVOICE_NOT_OPEN`, `ALREADY_PAST_DUE`. Auditoria: `admin.manual_payment_recorded`,
`admin.manual_payment_missed` (com `tenant_id`) e `billing.subscription_changed` da transição;
o job grava `billing.subscription_changed` com ator `system`.

## 4. Limite de organizações

- `plan.limits.organizations` (editável em `/admin/planos/:id`, Zod em `planLimitsSchema`).
- Conta as organizações em que a pessoa é **owner** (`member.role` contém `owner`), fora as
  `deleted`.
- O limite da pessoa é o maior entre as organizações que ela já tem. Cada uma vale o
  `organizations` do plano só com assinatura `active` ou `past_due` e tenant `active`; em
  trial, vencida, cancelada, suspensa ou sem assinatura, vale **1**. Plano sem valor (chave
  ausente ou `null`) também vale 1. Sem organização nenhuma, a primeira sempre passa.
- `POST /api/tenant` cria por `createOrganizationWithinLimit`: lock por pessoa e contagem na
  mesma transação, 403 `PLAN_LIMIT_REACHED`. O teto fixo `MAX_TENANTS_PER_USER` sai e o plugin
  fica sem `organizationLimit`.

## 5. Seed

- `free` (organizations 1), `basic` (2), `pro` (5); preços manuais mensais e anuais para
  `basic` e `pro`. Plano existente sem a chave `organizations` ganha a chave; o resto do plano
  editado não é tocado.
- Tenants de exemplo no controle manual, com owners próprios: `cliente-em-dia` (pago, período
  corrente, fatura paga), `cliente-atrasado` (`past_due`, carência correndo, fatura aberta) e
  `cliente-vencido` (`unpaid` + `read_only`, fatura `failed`).

## Segurança

- Escritas do admin só para `platform_owner`, antes da validação; tabelas de tenant por
  `withPlatformScope`/`withTenant`; transição com a linha travada (`lockSubscription`).
- Nenhuma resposta do cadastro difere entre e-mail novo e existente (ver risco residual).
- Nada de dado pessoal no `metadata` da auditoria: só ids e enums.

## Plano de implementação

1. Env + Better Auth + `requireAuth` + cadastro no cliente → `tests/db/auth*.test.ts`.
2. Migration `0020` + constantes (`manual`, `organizations`) → `db:generate`, `db:migrate`.
3. Eventos da máquina de estados → `state-machine.test.ts`.
4. `manual.ts`, rotas do admin, job → `tests/db/billing-manual.test.ts`.
5. Limite de organizações → `organizations.test.ts` e `tests/db/billing-manual.test.ts`.
6. Telas (`/admin/tenants/:id`, preços manuais, `/app/assinatura`) → build e smoke.
7. Seed → `npm run db:seed` duas vezes.

## Verificação

- [x] `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db`, `npm run build`
- [x] `npm run db:seed` idempotente

## Atualização de contexto

- [x] `tech/08-auth.md`, `tech/21-tenant-rbac.md`, `tech/22-admin.md`,
  `tech/23-billing-planos.md`, `tech/24-billing-cobranca.md`, `status.md`
- [x] `INDEX.md` (cobrança manual na linha de cobrança)
- [x] Rules de billing e auth em `.claude/rules/` e `.cursor/rules/`
- [x] `README.md`, `CHANGELOG.md`, `.env.example`, `docker/.env.prod.example`, compose

## Decisões

| Decisão | Motivo | Alternativa descartada |
|---|---|---|
| Verificação por variável de ambiente | muda a instância do Better Auth; postura da implantação | `platform_setting`, editável no `/admin` |
| Cadastro nunca abre sessão (`autoSignIn: false`) | resposta idêntica para e-mail novo e existente | sessão direto no cadastro, com cookie só para conta nova |
| Manual = sem assinatura viva no provedor | nenhuma coluna nova; provedor e manual convivem por assinatura | coluna `billing_mode` |
| Preço manual em `plan_price` com `provider = "manual"` | reaproveita editor, intervalos e valores | valor solto no formulário do admin |
| Vencimento no `billing.period_end` | já roda de hora em hora sobre `current_period_end` | fila nova |
| Trial limita a 1 organização | trial não pago não deve multiplicar tenants | valer o limite do plano do trial |
