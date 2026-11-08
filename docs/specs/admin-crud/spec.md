# SPEC: Edição e exclusão no `/admin` (organizações, usuários, planos e assinaturas)

- **Status:** rascunho (revisão 3, com os ajustes do proprietário do template)
- **PRD:** sem PRD próprio; pedido do proprietário do template. Fecha lacunas de
  `tech/22-admin.md` ("detalhe de usuário", "revogar sessões").
- **Contexto carregado:** `tech/22-admin.md`, `tech/23-billing-planos.md`,
  `tech/24-billing-cobranca.md`, `tech/25-portal-clientes.md`, `tech/27-lgpd-arquivos.md`,
  `src/lib/admin/{plans,users,subscriptions}.ts`, `src/lib/schemas/admin.ts`,
  `src/lib/lgpd/deletion.ts`, `src/lib/billing/manual.ts`, `src/db/schema/{billing,lgpd}.ts`

## Objetivo

O proprietário da plataforma (`platform_owner`) edita e exclui, só pelo `/admin`:

1. **Organizações:** **editar** nome e slug, trocar o plano (já existe) e **excluir**.
2. **Usuários** de equipe, de suporte da plataforma e do portal: **editar** (inclusive o
   e-mail da pessoa do portal) e **excluir**.
3. **Planos:** editar e arquivar (já existem) e **excluir**.
4. **Assinaturas:** **editar** datas e status (manual e com provedor), **trocar** o plano,
   **marcar pago** na cobrança manual e **excluir** (= cancelar).
5. **Toda listagem que cita organização mostra o nome**, com link, nunca número ou id.
6. **`/app/clientes`** com CRUD completo do owner (conferido: já existe; seção 7).

`platform_support` continua só lendo: toda escrita nova responde 403 para ele.

## Matriz

✅ já existe · 🆕 entra nesta SPEC · ➖ fora do escopo

| Recurso | Editar | Excluir | Outras ações |
|---|---|---|---|
| Organização | 🆕 nome, slug; ✅ trocar plano | 🆕 agendada ou imediata | – |
| Usuário de equipe (`user`, papel `user`) | 🆕 nome, e-mail | 🆕 agendada ou imediata | 🆕 revogar sessões; ✅ banir |
| Suporte da plataforma (`platform_support`) | 🆕 nome, e-mail | 🆕 agendada ou imediata | 🆕 revogar sessões |
| Proprietário da plataforma (`platform_owner`) | ➖ protegido | ➖ protegido | – |
| Pessoa do portal (`portal_user`) | 🆕 nome, e-mail | 🆕 agendada ou imediata | ✅ revogar sessões |
| Cliente do tenant em `/app/clientes` (owner) | ✅ todos os campos | ✅ | ✅ criar, enviar acesso, bloquear |
| Plano | ✅ (`slug` imutável) | 🆕 só sem uso | ✅ arquivar (`active = false`) |
| Preço do plano | ✅ | 🆕 só sem uso | ✅ desativar |
| Assinatura | 🆕 datas e status (manual e com provedor) | ✅ cancelar | ✅ trocar plano e marcar pago, 🆕 também na lista de assinaturas |

Criar owner, criar cliente do portal e mudar papéis ficam fora (Decisões).

## Onde entra

- [x] API Hono (`src/api/admin.ts`, `/api/admin/*`)
- [x] Dashboard client-only (`/admin/tenants`, `/admin/tenants/:id`, `/admin/usuarios`,
  `/admin/usuarios/:id`, `/admin/usuarios/portal/:id`, `/admin/planos`, `/admin/planos/:id`,
  `/admin/assinaturas`, `/admin/auditoria`)
- [x] Job `lgpd.delete` (sem mudança de lógica; passa a executar pedidos da plataforma)

Toda rota nova herda a cadeia de `adminRoutes` (`sameOrigin` → `jsonBodyLimit` →
`authRateLimit` → `requireAuth` → `requirePlatform()`, 2FA em produção) e soma
`requirePlatform(["platform_owner"])` **antes** da validação, como as escritas atuais.

## Modelo de dados (Drizzle)

| Tabela | Coluna nova | Observações |
|---|---|---|
| `deletion_request` | `origin text not null default 'self'` (`self` \| `platform`) | `platform`: pedido feito pelo `/admin`. Cada lado só cancela o próprio pedido |
| `deletion_request` | `metadata jsonb not null default '{}'` | `{ wasBanned?, reason? }`: cancelar devolve o estado anterior ao banimento |

- **Migration:** `src/db/schema/lgpd.ts` + `npm run db:generate` (`0021_*`). Aditiva, com
  default: pedidos existentes viram `origin = 'self'`.
- **Rollout:** sem backfill; deploy único.

## 1. Exclusão: agendada ou imediata (regra comum)

Toda exclusão de organização, usuário e pessoa do portal recebe
`deleteSchema = { mode: "scheduled" | "now", confirm: string, reason?: string }`.

- `confirm` precisa ser igual ao `slug` (organização) ou ao e-mail (pessoa). O servidor confere:
  400 `CONFIRMATION_MISMATCH`. Protege de clique errado e de chamada forjada com id trocado.
- **`scheduled`:** grava `deletion_request` com `origin = platform`, `requested_by` = ator e
  `scheduled_for = agora + 30 dias`; corta o acesso na hora (abaixo); reversível até o job.
- **`now`:** grava o mesmo pedido com `scheduled_for = agora` e chama
  `executeDeletion(requestId, now)` na mesma requisição. É a mesma anonimização do job, sem
  código paralelo. Irreversível. Falha no meio: o pedido fica `pending` vencido e o job
  `lgpd.delete` termina o serviço (a execução já é idempotente).
- O que fica e o que sai é o do fluxo LGPD: `invoice`, `subscription`, `audit_log` e
  `consent_log` ficam, sem apontar para ninguém.
- Pedido `pending` já existente: `scheduled` responde 409 `DELETION_PENDING`; `now` antecipa o
  pedido existente (atualiza `scheduled_for` e executa).
- Cancelar: `POST .../deletion/cancel`, só pedido `pending` com `origin = platform` (409
  `DELETION_NOT_PLATFORM`: quem pediu a própria exclusão decide se desiste). A rota da própria
  pessoa ou do owner recusa pedido `origin = platform` (409 `DELETION_BY_PLATFORM`).
- E-mail `deletion-scheduled` (agendada) ou `deletion-executed` (imediata) ao titular, com o
  texto de pedido pela administração.
- Auditoria `admin.<alvo>_deletion_requested`, `_executed`, `_canceled`, com `mode` e `reason`.

O núcleo de `requestUserDeletion`, `requestPortalDeletion` e `requestTenantDeletion` (checagens +
insert + aviso) vira `schedule*Deletion(target, { origin, actorId, scheduledFor })`, usado
pelas rotas do titular e pelas do admin, sem mudar o comportamento atual.

## 2. Organizações

| Método e rota | Entrada | Saída | Erros |
|---|---|---|---|
| `PUT /api/admin/tenants/:id/plan` | ✅ como hoje | | |
| `PATCH /api/admin/tenants/:id` 🆕 | `updateTenantSchema` `{ name?, slug? }` (`slugSchema` de `tenant.ts`) | organização | 409 `SLUG_TAKEN`, `TENANT_DELETING` |
| `DELETE /api/admin/tenants/:id` | `deleteSchema` | `{ mode, scheduledFor }` | 409 `DELETION_PENDING`, `PROVIDER_CANCEL_FAILED`; 400 `CONFIRMATION_MISMATCH` |
| `POST /api/admin/tenants/:id/deletion/cancel` | – | `{ ok: true }` | 409 `NO_PENDING_DELETION`, `DELETION_NOT_PLATFORM` |

**Editar:**

- Pelo mesmo caminho que o owner usa para editar a organização (plugin `organization`,
  `updateOrganization` no servidor), para não haver duas regras de slug.
- O slug aparece em `/portal/login?org=` e nos magic links já enviados. Trocar o slug quebra
  esses links (o `org` antigo não casa e a pessoa escolhe o tenant depois de entrar): a tela
  avisa antes de salvar. O `org` só escolhe entre os tenants da própria pessoa, então um slug
  antigo reaproveitado por outra organização não dá acesso a nada (teste).
- Organização em `deleting` → 409 `TENANT_DELETING`. Auditoria `admin.tenant_updated` com
  antes e depois, no `tenant_id`.

**Excluir:**

- Reaproveita `requestTenantDeletion`: encerra a assinatura no provedor **antes** (falha do
  provedor = nada agendado, 409 `PROVIDER_CANCEL_FAILED`), passa a organização a
  `deleting`/`locked`, avisa os owners.
- Vale também para organização suspensa pela plataforma (a rota do owner recusa; a do admin
  aceita).
- Cancelar volta o acesso como no fluxo do owner (`read_only` se a assinatura foi encerrada).

## 3. Usuários

### Equipe e suporte (`user`)

Alvo permitido: papel `user` ou `platform_support`. `platform_owner` responde 403
`PLATFORM_OWNER_PROTECTED`; o próprio ator, 409 `SELF_ACTION`. A regra fica em
`assertManageableUser(targetId, actorId)`, que substitui a de `assertBannable` (banir continua
restrito a papel `user`).

| Método e rota | Entrada (`src/lib/schemas/admin.ts`) | Saída | Erros |
|---|---|---|---|
| `GET /api/admin/users/:id` | `validId` | perfil, papel, verificado, 2FA, banido, sessões vivas, organizações (nome, slug, papel, estado de cobrança, plano), exclusão pendente | 404 |
| `PATCH /api/admin/users/:id` | `updateUserSchema` `{ name?, email? }` | perfil | 409 `EMAIL_TAKEN`, `SELF_ACTION`; 403 `PLATFORM_OWNER_PROTECTED` |
| `POST /api/admin/users/:id/revoke-sessions` | – | `{ revoked }` | 403, 409 `SELF_ACTION` |
| `DELETE /api/admin/users/:id` | `deleteSchema` + `deleteSoleOrganizations: boolean` | `{ mode, scheduledFor, tenants[] }` | 409 `LAST_OWNER` `{ tenants }`, `DELETION_PENDING`, `SELF_ACTION`; 403 |
| `POST /api/admin/users/:id/deletion/cancel` | – | `{ ok: true }` | 409 `NO_PENDING_DELETION`, `DELETION_NOT_PLATFORM` |

**Editar:**

- `name`: grava direto.
- `email`: único (409 `EMAIL_TAKEN`; o `/admin` já vê todas as contas, então revelar aqui é
  aceitável), `emailVerified = false`, sessões encerradas, aviso `email-changed` ao endereço
  antigo e link de definir senha (reset do Better Auth) ao novo. Quem conclui o reset provou o
  e-mail: `onPasswordReset` passa a marcar `emailVerified = true`.
- Papéis não se editam (Decisões). Auditoria `admin.user_updated` com os campos alterados.

**Excluir:**

1. Organizações em que ele é o **único** owner (`soleOwnerTenants`):
   `deleteSoleOrganizations: false` → 409 `LAST_OWNER` `{ tenants: [{ id, name }] }`; `true` →
   cada uma segue a seção 2 no **mesmo** `mode`. Falha em qualquer uma (provedor) aborta antes
   de tocar no usuário.
2. `scheduled`: bane a conta (`auth.api.banUser`, motivo "Exclusão agendada pela plataforma",
   `metadata.wasBanned` guarda o estado anterior), o que encerra as sessões e barra o login na
   carência. Cancelar desbaneia só se `wasBanned` era `false`. Organizações agendadas junto
   **não** voltam sozinhas: cada uma tem o próprio cancelamento.
3. `now`: executa as organizações e depois o usuário.
4. A anonimização passa a zerar o papel (`role = 'user'`): conta de suporte excluída não
   sobra com acesso de plataforma.

### Pessoas do portal (`portal_user`)

| Método e rota | Entrada | Saída | Erros |
|---|---|---|---|
| `GET /api/admin/portal-users/:id` | `validId` | pessoa (nome, e-mail, verificado, senha definida, sessões vivas), vínculos `[{ tenant: { id, name }, status, lastLoginAt }]`, exclusão pendente | 404 |
| `PATCH /api/admin/portal-users/:id` | `updatePortalUserSchema` `{ name?, email? }` | pessoa | 404, 409 `EMAIL_TAKEN` `{ tenants? }` |
| `DELETE /api/admin/portal-users/:id` | `deleteSchema` | `{ mode, scheduledFor }` | 409 `DELETION_PENDING`; 400 |
| `POST /api/admin/portal-users/:id/deletion/cancel` | – | `{ ok: true }` | 409 `NO_PENDING_DELETION`, `DELETION_NOT_PLATFORM` |

- **Editar nome:** grava em `portal_user.name` (o `customer.name` de cada tenant é do owner e
  não muda).
- **Editar e-mail:** a pessoa é a mesma, só o endereço muda; por isso os vínculos ficam. Em uma
  transação (`withPlatformScope("admin: e-mail do portal")`):
  1. `portal_user.email` único → senão 409 `EMAIL_TAKEN`.
  2. Atualiza `customer.email` em **todos** os vínculos da pessoa. Algum tenant já tem outro
     cliente com o endereço novo → 409 `EMAIL_TAKEN` `{ tenants: [{ id, name }] }` e nada muda.
  3. `emailVerified = false`, senha removida e sessões encerradas
     (`revokeUnprovenAccountAccess`): o endereço novo só entra por magic link, que é onde a
     posse se prova. Quem controlava o endereço antigo perde o acesso na hora.
  4. Aviso `email-changed` ao endereço antigo. Auditoria `admin.portal_user_updated` e, em cada
     tenant, `customer.updated` com `actor_type = platform`.
- **Excluir `scheduled`:** encerra as sessões; na carência, pedido `pending` com
  `origin = platform` barra o acesso em `requirePortalAuth` (401), `requestPortalLogin` (não
  envia link; a resposta pública não muda) e no `sign-in/email` (o mesmo 401 de senha errada).
  `customer.status` não é tocado, para o cancelamento não perder o estado.
- **Excluir `now`:** anonimiza a pessoa e todos os `customer`, como o job.
- `notes` e `tags` do cliente são do tenant e não saem no `/admin`.

## 4. Planos e preços

### Excluir plano: `DELETE /api/admin/plans/:id`

Exclusão física só quando o plano nunca chegou a um tenant. O caminho normal é **arquivar**
(`PATCH { active: false }`), que tira o plano de `/precos` e da oferta.

Em uma transação, com o plano travado (`FOR UPDATE`) e leitura de `subscription` em
`withPlatformScope("admin: excluir plano", ...)`:

| Checagem | Erro |
|---|---|
| Plano não existe | 404 |
| Alguma `subscription` com `plan_id` ou `pending_plan_id` = plano (qualquer status) | 409 `PLAN_IN_USE` `{ tenants: [{ id, name }] }` |
| `platform_setting.trial_plan_id` = plano | 409 `PLAN_IS_TRIAL_DEFAULT` |
| `trial_plan_id` nulo e o plano é o único gratuito ativo (fallback do trial) | 409 `LAST_FREE_PLAN` |

Passou: `DELETE plan` (o `cascade` leva os `plan_price`). A FK `subscription.plan_id` é
`restrict`: assinatura criada entre a checagem e o `DELETE` vira o mesmo 409 `PLAN_IN_USE`.
Auditoria `admin.plan_deleted` com `{ slug, name, prices }`. Preço com `provider_price_ref` não
é apagado no provedor: a resposta traz `providerRefs[]` e a tela avisa.

### Excluir preço: `DELETE /api/admin/plans/:id/prices/:priceId`

| Checagem | Erro |
|---|---|
| Preço não existe ou é de outro plano | 404 |
| `subscription.plan_price_id` = preço, ou `metadata->>'pendingPlanPriceId'` = preço | 409 `PRICE_IN_USE` |

Senão apaga e audita `admin.plan_price_deleted`. Em uso, o caminho é desativar.

### Editar e arquivar

Sem regra nova. "Arquivar" e "Reativar" viram botões explícitos na lista e no detalhe (hoje é
um campo do formulário). `PATCH` passa a auditar `admin.plan_updated` /
`admin.plan_price_updated` com os campos alterados, se ainda não auditar.

## 5. Assinaturas

| Método e rota | Entrada | Saída | Erros |
|---|---|---|---|
| `PATCH /api/admin/subscriptions/:id` 🆕 | `updateSubscriptionSchema` `{ status?, currentPeriodEnd?, trialEndsAt?, graceUntil?, reason }` (datas ISO 8601; `reason` obrigatório, vai para o evento) | assinatura | 409 `SUBSCRIPTION_CLOSED`, `FIELD_NOT_APPLICABLE`, `STATUS_NOT_ALLOWED`, `PROVIDER_UNSUPPORTED`, `PROVIDER_STATUS_MANAGED`, `PROVIDER_UPDATE_FAILED`; 400 `INVALID_DATE` |
| `PUT /api/admin/tenants/:id/plan` | ✅ trocar plano, agora também chamado da lista de assinaturas | | |
| `POST /api/admin/subscriptions/:id/manual-payment` | ✅ marcar pago, agora também na lista | | |
| `POST /api/admin/subscriptions/:id/manual-unpaid` | ✅ marcar não pago, agora também na lista | | |
| `POST /api/admin/subscriptions/:id/cancel` | ✅ "Excluir" = cancelar | | |

A edição mora em `src/lib/billing/admin-edit.ts` (`editSubscription`) e passa pelas mesmas
peças das transições existentes: grava `subscription_event` (`source = admin`, antes, depois e
`reason`), acerta `organization.access_mode` e audita `admin.subscription_updated` com o
`tenant_id`. Suspensão da plataforma (`locked` por `suspend`) tem precedência e não é tocada.

### Datas

| Status | Campo editável | Efeito |
|---|---|---|
| `trialing` | `trialEndsAt` | copia em `organization.trial_ends_at` e limpa os avisos ainda não enviados de `metadata.trialNotices`, para o job reavisar no prazo novo |
| `active` | `currentPeriodEnd` | depois de `currentPeriodStart`; o job `billing.period_end` vence na data nova |
| `past_due` | `graceUntil` | data futura; estender a carência adia o `unpaid` |
| `unpaid`, `paused` | `currentPeriodEnd` | só a data; o acesso não muda |
| `canceled`, `expired` | – | 409 `SUBSCRIPTION_CLOSED` |

Campo fora do status → 409 `FIELD_NOT_APPLICABLE`. Data no passado só em `active` (vence na
próxima rodada do job); nos outros, 400 `INVALID_DATE`.

### Status (assinatura manual)

O admin escolhe o status de destino; o servidor aplica junto os efeitos que deixam assinatura,
tenant e jobs coerentes. A tabela é uma função pura (`adminStatusChange`) com teste unitário de
cada linha:

| Para | De | Efeitos |
|---|---|---|
| `trialing` | `active`, `past_due`, `unpaid`, `expired` | exige `trialEndsAt` futuro no mesmo PATCH; `access_mode = full`; zera `trialNotices` |
| `active` | qualquer | exige `currentPeriodEnd` futuro se não houver um; `grace_until = null`; `access_mode = full`. Não cria fatura paga: para registrar pagamento, use "marcar pago" (a tela sugere) |
| `past_due` | `active`, `trialing` | `grace_until = agora + grace_days` (ou o `graceUntil` enviado); acesso total |
| `unpaid` | `active`, `past_due`, `trialing` | `access_mode = read_only` |
| `paused` | `active` | `metadata.paidThrough = currentPeriodEnd`; `access_mode = read_only` |
| `expired` | `trialing`, `unpaid`, `past_due` | `access_mode = read_only` |
| `canceled` | – | 409 `STATUS_NOT_ALLOWED`: use "Excluir" (cancelar), que já encerra no provedor e grava tudo |

Combinação fora da tabela → 409 `STATUS_NOT_ALLOWED`. Faturas abertas não mudam: status não é
pagamento.

### Assinatura com provedor (`provider_subscription_ref` viva)

O provedor é a fonte da verdade: mudar só aqui seria desfeito pelo webhook seguinte ou pelo
`billing.reconcile`. Por isso a edição vai **primeiro ao provedor** e só grava aqui se ele
aceitar (falha → 409 `PROVIDER_UPDATE_FAILED`, nada muda). O webhook que vier depois confirma
o mesmo estado e é absorvido como repetido.

`PaymentProvider` (`src/lib/payments/types.ts`) ganha um método opcional:

```ts
updateSubscriptionSchedule?(
  ctx: PaymentContext,
  ref: string,
  input: { trialEnd?: Date; nextBillingAt?: Date },
): Promise<RemoteSubscription>;
```

| Edição | Com provedor |
|---|---|
| `trialEndsAt` | `updateSubscriptionSchedule({ trialEnd })` |
| `currentPeriodEnd` | `updateSubscriptionSchedule({ nextBillingAt })`. No Stripe: `trial_end` = data nova com `proration_behavior: none` (adia a próxima cobrança sem crédito nem cobrança extra) |
| `graceUntil` | só local: a carência é regra nossa, não do provedor |
| status `paused` / `active` (de `paused`) | `pauseSubscription` / `resumeSubscription`, que já existem como opcionais |
| outro status | 409 `PROVIDER_STATUS_MANAGED`: o status vem dos pagamentos no provedor |
| provedor sem o método | 409 `PROVIDER_UNSUPPORTED` |

A resposta do provedor (`RemoteSubscription`) é aplicada pela função de reconciliação que já
existe, não por cópia direta: o que ele devolveu é o que fica. O módulo Stripe implementa o
método; sem sandbox real, a validação é por fixtures, como o resto do módulo (pendência já
registrada em `status.md`).

## 6. Nome da organização nas listagens

Toda resposta que cita organização traz `{ id, name }` e a tela mostra o nome com link para
`/admin/tenants/:id`. Muitas organizações: as 3 primeiras e "+N", que leva à lista filtrada.

| Tela | Hoje | Passa a |
|---|---|---|
| `/admin/usuarios` (equipe) | coluna com o número de organizações | nomes (com o papel), `organizations: [{ id, name, role }]` + `more` |
| `/admin/usuarios` (portal) | número de organizações | nomes (com o status do vínculo) |
| `/admin/planos` e detalhe | número de organizações no plano | nomes; "+N" leva a `/admin/tenants?plan=<id>` (filtro novo em `tenantsQuerySchema`) |
| `/admin/auditoria` | filtro de organização por id | busca por nome (`tenantQ`, `ilike` em `organization.name`) |
| `/admin/assinaturas`, `/admin/tenants` | já mostram o nome | sem mudança |

As consultas leem `member`/`customer` em `withPlatformScope` com subconsulta agregada
(`json_agg` limitado a 3 + contagem), sem N+1.

## 7. `/app/clientes` (CRUD do owner)

Conferido no código: o CRUD já está completo, com todos os campos de `customer`. Nada novo de
API; só fica registrado aqui para o smoke cobrir.

| Ação | Onde | Permissão |
|---|---|---|
| Listar, buscar, filtrar por situação | `GET /api/customers`, `pages/customers-page.tsx` | `customer:read` |
| Criar (nome, e-mail, telefone, documento, etiquetas, observações) | `POST /api/customers`, `customer-form-dialog.tsx` | `customer:create` + limite `customers` do plano |
| Ver detalhe | `GET /api/customers/:id`, `pages/customer-detail-page.tsx` | `customer:read` |
| Editar os mesmos campos | `PATCH /api/customers/:id`, mesmo diálogo | `customer:update` |
| Bloquear e desbloquear (status) | `PATCH /api/customers/:id { status }`, botões no detalhe | `customer:update` |
| Enviar acesso (`lead` → `active`) | `POST /api/customers/:id/invite` | `customer:invite` |
| Excluir | `DELETE /api/customers/:id` | `customer:delete` |

O status não está no formulário de propósito: `lead` vira `active` só por "Enviar acesso" (a
decisão do owner vem junto com o e-mail), e bloquear tem botão próprio. Só um ajuste entra: a
lista mostra telefone e etiquetas, que hoje só aparecem no detalhe.

## Interface

| Rota | Arquivo | O que muda |
|---|---|---|
| `/admin/tenants/:id` | `pages/admin/tenant-detail-page.tsx` | "Editar" (nome e slug, com aviso sobre links do portal), "Excluir organização" e "Cancelar exclusão" |
| `/admin/usuarios` | `pages/admin/users-page.tsx`, `components/admin/portal-users-card.tsx` | nomes das organizações; linha leva ao detalhe |
| `/admin/usuarios/:id` 🆕 | `pages/admin/user-detail-page.tsx`, `routes/admin/user.tsx` | dados, organizações, editar, revogar sessões, banir/desbanir, excluir/cancelar |
| `/admin/usuarios/portal/:id` 🆕 | `pages/admin/portal-user-detail-page.tsx`, `routes/admin/portal-user.tsx` | dados, vínculos, editar nome e e-mail, revogar sessões, excluir/cancelar |
| `/admin/planos`, `/admin/planos/:id` | `plans-page.tsx`, `plan-detail-page.tsx` | arquivar/reativar como botão; "Excluir plano" (desabilitado com uso, explicando "arquive"); excluir preço; nomes das organizações |
| `/admin/assinaturas` | `subscriptions-page.tsx` | menu por linha: editar (datas e status, com motivo obrigatório; só mostra os destinos permitidos para o status e o tipo, manual ou provedor), trocar plano, marcar pago/não pago (reaproveita `manual-billing-card`), cancelar |
| `/admin/auditoria` | `routes/admin/audit.tsx` | filtro por nome da organização |
| `/app/clientes` | `pages/customers-page.tsx` | colunas telefone e etiquetas na lista |

- **Diálogo de exclusão** (`components/admin/delete-dialog.tsx`, um para todos): escolha
  "Agendar (30 dias, reversível)" ou "Excluir agora (irreversível)", campo para digitar o slug
  ou o e-mail, motivo opcional e o que acontece com as organizações ligadas.
- **Estados:** carregando, vazio, erro e sucesso por `QueryState`; mutações por
  `useAdminMutation` com toast; escrita só aparece com `useIsPlatformOwner`.
- **Navegação:** as duas rotas novas em `src/routes.ts` dentro de `admin`; sem item novo em
  `admin-nav.ts`.

## Segurança

- Permissão só no servidor: `platform_owner` em toda escrita; o cliente só esconde botões.
- `platform_owner` não é editado nem excluído por aqui; ninguém age sobre si mesmo.
- Sessão personificada recebe 403 nas rotas novas (`requirePlatform` olha o papel real; teste).
- `confirm` conferido no servidor; "excluir agora" é irreversível e fica auditado com o ator.
- Nenhum token sai na resposta da API: definir senha e magic link só por e-mail.
- `/security-review` obrigatório (auth, tenant, billing e LGPD).

## Plano de implementação

Etapas pequenas, cada uma com teste próprio. Modelo sugerido entre parênteses.

1. **Nome da organização nas listagens** (usuários, portal, planos, filtro `plan` em tenants,
   auditoria por nome) → testes de forma da resposta em `tests/db/admin.test.ts` + smoke.
   *(Sonnet)*
2. **Excluir plano e preço; arquivar como botão** → testes: sem uso apaga; com assinatura
   (inclusive `pending_plan_id`), trial padrão e último gratuito dão 409; suporte 403. *(Sonnet)*
3. **Editar datas e status da assinatura manual + ações na lista de assinaturas** → teste
   unitário de cada linha de `adminStatusChange`; testes de banco: `access_mode` acertado,
   `subscription_event` com motivo, avisos de trial reabertos, suspensão preservada, `canceled`
   recusado. *(Opus: máquina de estados da cobrança)*
3b. **Datas e pausa com provedor** (`updateSubscriptionSchedule` no contrato e no módulo Stripe)
   → testes com provedor falso: falha não grava nada; sucesso aplica a resposta pela
   reconciliação; provedor sem o método 409; status gerenciado 409; fixtures do Stripe.
   *(Opus)*
3c. **Editar organização** (nome e slug) → testes: `SLUG_TAKEN`, `TENANT_DELETING`, magic link
   com slug antigo não entra em outra organização. *(Sonnet)*
4. **Migration `deletion_request.origin/metadata`** + extrair `schedule*Deletion` + `mode: now`
   → `tests/db/lgpd-deletion.test.ts` continua verde; novos casos de origem e cancelamento
   cruzado. *(Opus: mexe no núcleo da LGPD)*
5. **Excluir organização pelo admin** (agendada e imediata, cancelar) → testes: provedor falha
   não agenda, suspensa aceita, owner não cancela pedido da plataforma. *(Opus)*
6. **Detalhe, edição, revogar sessões e exclusão de usuário de equipe e suporte** → testes:
   `platform_owner` 403, si mesmo 409, troca de e-mail desverifica e derruba sessões,
   `LAST_OWNER` sem a flag, banido na carência, cancelar respeita `wasBanned`, suporte
   excluído perde o papel. *(Opus)*
7. **Detalhe, edição e exclusão de pessoa do portal** + barreira na carência → testes em
   `portal-auth.test.ts`: sem sessão, sem link, senha responde 401 igual; troca de e-mail
   atualiza todos os vínculos, recusa conflito sem mudar nada, tira senha e sessões. *(Opus)*
8. **Telas** (detalhes de usuário e pessoa do portal, diálogo de exclusão, edição de
   organização e de assinatura, botões em planos, colunas em `/app/clientes`) → smoke.
   *(Sonnet)*
9. **Contexto e revisão:** docs abaixo, `/code-review` e `/security-review`. *(Opus)*

## Verificação

- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db`, `npm run build`
- [ ] Testes de cada etapa acima
- [ ] Smoke com o seed: nomes nas listagens; arquivar e excluir um plano novo; tentar excluir
  `pro` (409); mudar o vencimento de `cliente-em-dia` e marcar pago pela lista de assinaturas;
  passar `cliente-atrasado` a `unpaid` pelo status e ver o `read_only`; renomear o `acme` e
  trocar o slug; trocar o e-mail de `lead@cliente.local` e entrar pelo magic link novo; criar,
  editar, bloquear e excluir um cliente em `/app/clientes`;
  agendar e cancelar a exclusão de `acme.membro`; excluir agora um suporte criado para o
  teste; agendar a exclusão de `julia@cliente.local` e confirmar que o magic link não chega;
  excluir agora `cliente-vencido`
- [ ] `/code-review` e `/security-review`

## Atualização de contexto

- [ ] `tech/22-admin.md`: rotas, telas e regras de exclusão; tirar "detalhe de usuário" e
  "revogar sessões" de "Ainda não existe"
- [ ] `tech/23-billing-planos.md`: "plano nunca se apaga" vira "só sem uso; senão arquiva"
- [ ] `tech/24-billing-cobranca.md`: edição de datas e status, `updateSubscriptionSchedule`
- [ ] `src/lib/payments/providers/README.md`: o método opcional novo
- [ ] `tech/25-portal-clientes.md`: edição (inclusive e-mail) e exclusão pelo admin, barreira
  na carência, colunas novas em `/app/clientes`
- [ ] `tech/21-tenant-rbac.md`: edição de nome e slug pela plataforma
- [ ] `tech/27-lgpd-arquivos.md`: `origin`, `metadata` e `mode: now`
- [ ] `tech/08-auth.md`: `onPasswordReset` marca o e-mail como verificado
- [ ] `tech/19-email.md`: templates `email-changed` e `deletion-executed`
- [ ] `status.md` e `docs/context/INDEX.md` (linha do admin)
- [ ] Rules em `.claude/rules/` e `.cursor/rules/` do admin, se citarem "plano nunca se apaga"

## Decisões

| Decisão | Motivo | Alternativa descartada |
|---|---|---|
| Admin escolhe entre agendar (30 dias) e excluir agora | Pedido do proprietário; "agora" reaproveita `executeDeletion`, sem anonimização paralela | Só agendada ou só imediata |
| Confirmação digitando slug ou e-mail, conferida no servidor | "Excluir agora" não tem volta | Só um botão de confirmar |
| `platform_owner` protegido; suporte editável e excluível | Evita a plataforma ficar sem dono ou um dono derrubar outro | Todas as contas, menos a própria |
| "Excluir assinatura" = cancelar | Mantém faturas e histórico; o cancelamento já existe | Apagar o registro |
| Status editável, mas por tabela de transições com efeitos | Pedido do proprietário; a tabela mantém `access_mode`, carência e jobs coerentes | Campo de status livre, que deixaria tenant e assinatura em desacordo |
| `active` pelo status não registra pagamento | Status não é dinheiro; fatura paga só por "marcar pago" | Criar fatura paga ao ativar |
| Com provedor, a edição vai primeiro ao provedor | Mudar só aqui seria desfeito pelo webhook ou pela reconciliação | Override local que o provedor ignora |
| Com provedor, só datas e pausa; outros status 409 | O status vem dos pagamentos lá; forçar aqui criaria divergência | Status livre também com provedor |
| E-mail do portal trocado pelo admin mantém os vínculos, mas tira senha e sessões | É a mesma pessoa; a posse do endereço novo se prova no magic link | Desfazer os vínculos (como na troca pelo owner) ou manter a senha |
| Slug editável com aviso | Pedido do proprietário; o `org` só escolhe entre os tenants da pessoa, então slug antigo não abre outra organização | Slug imutável |
| Excluir plano só sem nenhuma assinatura | `subscription.plan_id` é `restrict` e o histórico precisa do plano; arquivar resolve a oferta | Mover os tenants e apagar |
| Organizações de único owner só caem com flag explícita | Excluir uma conta não pode apagar um tenant sem a decisão ficar visível | Recusar sempre ou apagar sempre |
| Criar owner, criar cliente e mudar papéis fora do escopo | Não pedidos; papel de plataforma pela tela amplia a superfície de ataque | Incluir na mesma entrega |
| Bloqueio do portal na carência por checagem do pedido | O portal não tem banimento; mudar `customer.status` perderia o estado ao cancelar | Pôr os vínculos em `blocked` |
