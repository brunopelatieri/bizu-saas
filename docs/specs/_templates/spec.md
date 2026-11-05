# SPEC: <nome da feature>

- **Status:** rascunho | aprovada | implementada
- **PRD:** `docs/specs/<feature>/prd.md`
- **Contexto carregado:** <arquivos de `docs/context/` usados, além do INDEX>

> A SPEC responde **como**. Apague as seções que não se aplicam: seção vazia gasta
> contexto em toda leitura futura.

## Onde entra

- [ ] Pública com SSR (`src/routes/`, com `meta` e `loader`)
- [ ] API Hono (`src/api/app.ts`)
- [ ] Dashboard client-only (`/dashboard/**`, sem `loader` server-side)

## Modelo de dados (Drizzle)

Dados passam sempre pelo Drizzle. Toda tabela nova leva `.enableRLS()`.

| Tabela | Colunas principais | Observações |
|---|---|---|
| `<tabela>` | `<colunas>` | <FK, índices; dados de usuário referenciam `profiles.id`> |

- **Migration:** alteração em `src/db/schema.ts` + `npm run db:generate`.
- **Rollout:** <impacto em dados existentes e etapa separada do deploy>.

## Contratos

| Método e rota | Entrada (schema Zod) | Saída | Autorização |
|---|---|---|---|
| `POST /api/<recurso>` | `<schema>` em `src/lib/schemas/` | `<resposta>` | <`requireAuth` + check de permissão> |

## Supabase

Só preencha se usar Auth, Storage, Edge Functions ou Realtime broadcast/presence.
CRUD da aplicação nunca passa por aqui.

- **Serviço:** <qual e para quê>
- **Permissão:** <validada no servidor, com `requireAuth` + checks>

## Interface

- **Rotas e telas:** <o que muda>
- **Estados:** carregando, vazio, erro e sucesso.
- **Dados no cliente:** <queries do TanStack Query com `apiFetch`, se houver>
- **Navegação:** atualizar `src/lib/constants/navigation.ts` se houver página nova.

## Segurança

- <dados sensíveis, segredos e o que nunca pode ir para o HTML inicial>

## Plano de implementação

Etapas pequenas, cada uma verificável por conta própria.

1. <etapa> → verificação: <como confirmar>

## Verificação

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] <cenário manual ou teste que cobre cada critério de aceite do PRD>
- [ ] `/code-review`

## Atualização de contexto

- [ ] Arquivo de domínio em `docs/context/`: <qual>
- [ ] `docs/context/INDEX.md`, se o escopo mudou
- [ ] Rules em `.claude/rules/` e `.cursor/rules/`, se a decisão vale para agentes futuros

## Decisões

| Decisão | Motivo | Alternativa descartada |
|---|---|---|
| <o que foi decidido> | <por quê> | <o que não foi escolhido> |
