# SPEC: Segurança, auditoria e LGPD

- **Parte de:** `docs/specs/saas-foundation/spec.md`
- **Paths previstos:** `src/api/security.ts` (CSRF, CSP, nonce), `src/api/rate-limit.ts`,
  `src/lib/crypto/secrets.ts`, `src/lib/audit.ts`, `src/api/lgpd.ts`, `SECURITY.md`

## Modelo de ameaças

**Ativos:** credenciais e sessões; dados de clientes/leads dos tenants; dados de
faturamento (CPF/CNPJ); credenciais de provedores; segredos da plataforma;
disponibilidade.

**Atores:** usuário anônimo; usuário de um tenant atacando outro; colaborador
escalando permissão; cliente/lead acessando dados de equipe; proprietário ou
suporte abusando da personificação; atacante com webhook forjado; atacante com
acesso ao banco ou ao backup.

| Ameaça | Controle | Onde | Teste |
|---|---|---|---|
| Enumeração de e-mails | Respostas uniformes em cadastro, reenvio, reset, magic link e change-email; tempo uniforme (envio em fila) | `spec-auth.md` | teste compara corpo e status para e-mail existente e inexistente |
| Força bruta de senha/OTP | Rate limit do Better Auth em banco (`/sign-in/email` 3/10 s, `/two-factor/*` 3/10 s), lockout de 2FA nativo, senha ≥ 10 | `src/lib/auth/server.ts` | `api.request()` 4x → 429 |
| Scanner consome token | GET não consome; botão faz a chamada | `spec-auth.md` | teste GET + POST |
| Token reutilizado | `email_verification_issue` com hash, apagado no uso; magic link `storeToken: "hashed"` e consumo atômico | idem | teste de segundo uso |
| Sequestro de sessão | Cookies `HttpOnly`, `Secure`, `SameSite=Lax`; sessão em banco revogável; `revokeSessionsOnPasswordReset` | Better Auth | teste de revogação |
| CSRF | Better Auth valida `Origin` contra `trustedOrigins`; rotas próprias usam `hono/csrf` com `origin: APP_URL`; só JSON, sem forms HTML para a API | `src/api/security.ts` | POST com `Origin` estranho → 403 |
| XSS | React escapa; CSP com nonce (`secureHeaders` + `NONCE`), `script-src 'self' 'nonce-…'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`; nonce injetado em `root.tsx` (script anti-flash e hidratação) | `src/api/security.ts`, `src/root.tsx` | teste de header; smoke no navegador sem erro de CSP |
| Acesso entre tenants | `withTenant` + RLS com `bizu_app` sem `BYPASSRLS` + `FORCE` | `spec-tenant-rbac.md` | `rls.test.ts` |
| Escalada de permissão | `hasPermission` no servidor; permissões reservadas rejeitadas em papéis personalizados; `admin` não altera `owner` | `src/api/permissions.ts` | matriz table-driven |
| Cliente acessa dados de equipe | Instâncias de auth separadas; `requirePortalAuth` nunca satisfaz `requireAuth`; rotas `/api/portal/*` só leem `customer` do `portal_user` | `src/api/portal.ts` | cookie de portal em rota de app → 401 |
| Webhook forjado ou replay | HMAC/ECDSA por provedor com corpo bruto; tolerância de 5 min no Stripe; token estático exige confirmação na API; unique `(provider, provider_event_id)` | `spec-billing.md` | fixtures com assinatura inválida, repetida e antiga |
| Abuso de personificação | Consentimento por `impersonation_grant`, 1 h, banner, bloqueio de ações financeiras, auditoria dupla (`impersonator_id`) | `spec-auth.md` | teste de bloqueio e de expiração |
| Vazamento de segredos | Só env; `.env.example` sem valores; `VITE_*` nunca para segredo; `logError` sem credenciais; `SECURITY.md` com canal de report | repo | lint de segredo no CI (`gitleaks` opcional) |
| Credenciais de provedores por tenant | AES-256-GCM com `CREDENTIALS_ENCRYPTION_KEY` (32 bytes base64), nonce por registro, `key_version`, rotação por job | `src/lib/crypto/secrets.ts` | round-trip e falha com chave errada |
| Backup vazado | Backups cifrados em repouso (`age` ou GPG, documentado), hashes de senha do Better Auth (scrypt), tokens só em hash | `spec-testes-operacao.md` | – |
| DoS por corpo grande / upload | `bodyLimit` por rota (16 KB JSON, 1 MB webhook, `MAX_UPLOAD_MB` upload) | `src/api/*` | 413 |
| Rate limit ineficaz com várias instâncias | Store em Postgres (`rate_limit_bucket`: `key`, `window_start`, `count`, upsert atômico `ON CONFLICT ... DO UPDATE`) selecionado por `RATE_LIMIT_STORE=postgres`; memória só em dev | `src/api/rate-limit.ts` | teste com dois `rateLimit` compartilhando store |
| IP falsificado | `TRUSTED_PROXY_HOPS` já existente; Better Auth `advanced.ipAddress.trustedProxies` | existente | existente |
| Dependências vulneráveis | `npm audit` no CI (falha em high/critical), Dependabot | `.github/` | CI |

## Headers e configuração

- `secureHeaders` mantido; HSTS no proxy; `Referrer-Policy: strict-origin-when-cross-origin`;
  `Permissions-Policy` restritiva; `X-Frame-Options` substituído por
  `frame-ancestors`.
- CSP em modo `report-only` na primeira fase (`CSP_REPORT_ONLY=true`) com
  `report-uri /api/csp-report`, depois `enforce`.
- Cookies do Better Auth com `advanced.cookiePrefix` distinto por instância.

## Auditoria

- `audit(action, { actor, tenantId, target, metadata })` em `src/lib/audit.ts`, chamado
  nos hooks do Better Auth (`databaseHooks`, `organizationHooks`,
  `afterEmailVerification`, `onPasswordReset`) e nos handlers de mutação.
- Ações mínimas: `auth.signed_up`, `auth.email_verified`, `auth.password_reset`,
  `auth.email_changed`, `auth.2fa_enabled`, `auth.session_revoked`,
  `tenant.created`, `tenant.updated`, `tenant.deleted`, `member.invited`,
  `member.joined`, `member.role_changed`, `member.removed`, `role.created`,
  `role.updated`, `customer.created`, `customer.invited`, `customer.deleted`,
  `billing.checkout_started`, `billing.subscription_changed`,
  `platform.impersonation_requested`, `platform.impersonation_started`,
  `platform.impersonation_blocked_action`, `platform.plan_changed`,
  `platform.tenant_suspended`, `lgpd.export_requested`, `lgpd.deletion_requested`.
- `metadata` só com ids e enums; `ip_hash = sha256(ip + AUDIT_SALT)`.
- Leitura: `/app/auditoria` (permissão `audit:read`, só do tenant) e
  `/admin/auditoria` (bypass, filtros por tenant, ator e ação). Exportação CSV por
  feature `audit_export`.
- Retenção: `platform_setting.audit_retention_days` (padrão 365), job
  `maintenance.prune`.

## LGPD

| Tema | Implementação |
|---|---|
| Consentimento | Checkbox obrigatório de termos e privacidade no cadastro (versão em `src/lib/legal/versions.ts`), `consent_log`; marketing opcional; nova versão exige re-aceite no próximo login (modal) |
| Páginas legais | `/legal/termos`, `/legal/privacidade` (SSR, markdown em `src/lib/legal/*.md`) com placeholders para controlador e DPO |
| Exportação | `POST /api/me/export` e `POST /api/portal/me/export` → job `lgpd.export` → zip JSON (perfil, membros, auditoria própria, clientes do tenant se owner) em `StorageProvider` → e-mail `data-export-ready` com link assinado de 7 dias |
| Exclusão | `DELETE /api/me` (senha + 2FA) → `deletion_request` com 30 dias → e-mail `deletion-scheduled` → job anonimiza (`user.email = deleted+<id>@invalid`, `name = "Usuário removido"`), remove sessões, mantém `invoice` e `audit_log` anonimizados. Último owner precisa transferir ou excluir o tenant antes |
| Retenção | Tabela em `docs/context/lgpd.md`: sessões 7 d; `payment_event` 90 d; `email_message` 180 d; auditoria 365 d; faturas 5 anos; exportações 7 d |
| Dados pessoais em logs | `logError` já filtra; `email_message` guarda hash; `audit_log` sem texto livre; pino com `redact` em `req.headers.cookie`, `email`, `document` |
| Encarregado | `platform_setting.dpo_email` exibido nas páginas legais |

## Checklist de revisão antes de cada fase

- [ ] Toda rota nova tem `requireAuth`/`requirePortalAuth` + `requireTenant` ou
      `requirePlatform` + `requirePermission`.
- [ ] Toda query de tenant está dentro de `withTenant`.
- [ ] Nenhuma resposta revela existência de e-mail.
- [ ] Nenhum token é consumido em GET.
- [ ] Mutação sensível grava `audit`.
- [ ] Nenhum segredo novo fora de `.env.example` com valor de exemplo.
- [ ] `/security-review` e `/code-review` executados.
