# Contribuindo com o Bizu SaaS

Obrigado por querer ajudar. O Bizu SaaS é um **template**: cada decisão deve servir de ponto de
partida para projetos derivados, simples de entender, de trocar e de remover. Antes de propor
algo grande, abra uma issue para conversarmos.

## Como o trabalho flui

```text
PRD -> SPEC -> implementação -> lint + tipos + testes + build -> revisão -> contexto atualizado
```

1. **Mudança pequena** (bug, texto, ajuste): abra o PR direto, com teste quando houver
   comportamento novo.
2. **Feature relevante**: comece pelo PRD e pela SPEC em `docs/specs/<feature>/`, antes do
   código. No Claude Code, use `/prd <feature>` e `/spec <feature>`; sem ele, siga os modelos
   de `docs/specs/_templates/` e leia `docs/specs/README.md`. O PR da spec pode vir separado
   do PR do código.
3. **Contexto vivo**: mudança de código em um domínio atualiza, no mesmo PR, o arquivo
   correspondente em `docs/context/` (o mapa está em `docs/context/INDEX.md`). Arquivo ou
   responsabilidade nova atualiza também o `INDEX.md`. Mudança de paths ou de regra atualiza as
   rules, sempre em par: `.claude/rules/` e `.cursor/rules/`.
4. **Segurança**: auth, tenant, RLS, billing, webhooks e arquivos pedem revisão extra
   (`/security-review` no Claude Code, ou revisão manual contra
   `docs/specs/saas-foundation/spec-seguranca.md`). Não abra issue pública para vulnerabilidade:
   veja [SECURITY.md](SECURITY.md).

## Ambiente

Siga o tutorial do [README](README.md#3-clonar-e-instalar) até `npm run dev`. Rode o Postgres do
`docker-compose.yml`; `npm run test:db` precisa dele com as migrations aplicadas, e funciona em um
banco novo, sem o seed.

## Antes de abrir o PR

Todos os comandos abaixo devem passar:

```bash
npm run lint
npm run typecheck
npm test
npm run test:db      # com o Postgres do Docker no ar
npm run build
```

Se você mexeu em um módulo opcional, prove que ele ainda sai limpo:
`npm run check:module-removal -- stripe` (ou `sentry`, `s3`).

## Regras que não mudam

As regras inegociáveis estão em [CLAUDE.md](CLAUDE.md). As que mais pegam em revisão:

- **Dados só pelo Drizzle** (`src/db/`). Mudança de schema é migration (`npm run db:generate`),
  e toda tabela de tenant tem `tenant_id`, RLS e policy, com query dentro de `withTenant`.
- **Permissão no servidor**: `requireAuth` + `requireTenant` + `requirePermission`. O cliente só
  esconde botões.
- **Nenhum token é consumido em GET.** A página renderiza e um botão chama a API.
- **Respostas de cadastro, reenvio e reset nunca revelam se um e-mail existe.**
- **Segredos nunca entram no git.** Só `.env.example` é versionado, com valores de exemplo.
  `VITE_*` vai para o navegador: só valores públicos.
- **Entrada validada com Zod**, com o schema compartilhado em `src/lib/schemas/`.
- **Erros internos vão para `logError`**, nunca `console.error` com dados pessoais.

## Commits e PR

[Conventional Commits](https://www.conventionalcommits.org/pt-br/), em português, no imperativo
curto: `feat(billing): ...`, `fix(auth): ...`, `docs: ...`, `test: ...`, `chore: ...`. Commits
pequenos, um assunto por commit. Mudança incompatível leva `!` ou `BREAKING CHANGE:` no corpo e uma
nota na seção "Migração" do [CHANGELOG](CHANGELOG.md).

No PR, preencha o modelo: o que mudou, por quê, como verificar e quais documentos foram
atualizados. Uma mudança visível a quem usa o template entra no `CHANGELOG.md`, em
`[Não lançado]`.

## Como propor um módulo de pagamento

Provedores de pagamento são módulos: ficam em `src/lib/payments/providers/<id>/` e entram pela
variável `PAYMENT_PROVIDERS`. Apagar a pasta e uma linha de registro tira o módulo.

1. Abra uma issue com o provedor, o público (Brasil, mundo) e os métodos (cartão, Pix, boleto).
2. Escreva a SPEC curta do módulo (assinatura de webhook, ordem e idempotência de eventos, o
   que o provedor faz de forma nativa, como é a conta de testes).
3. Siga o [checklist de módulos](src/lib/payments/providers/README.md) e use o módulo Stripe
   (`src/lib/payments/providers/stripe/`) como referência de estrutura e de testes.
4. Entregue fixtures de webhook (anonimizadas), testes de assinatura inválida, evento duplicado e
   fora de ordem, um `README.md` do módulo com o passo a passo da conta de teste, e
   `npm run check:module-removal -- <id>` passando.
5. Credenciais por tenant ficam cifradas (`CREDENTIALS_ENCRYPTION_KEY`); nunca em log nem em
   resposta de API.

## Como propor um módulo de armazenamento

O `StorageProvider` (`src/lib/storage/types.ts`) tem os provedores `local` e `s3`. Um novo provedor
(Azure Blob, GCS, outro S3 compatível com particularidades) vive em
`src/lib/storage/providers/<id>/`, implementa a interface, entra em `STORAGE_PROVIDER` e em
`src/lib/env.ts` (com as variáveis exigidas só quando ele está ligado) e não adiciona dependência
ao núcleo. Todo download passa pelo app (sessão, tenant e permissão): não exponha URL pública.
Siga o mesmo caminho do módulo de pagamento: issue, spec curta, testes, README e
`check:module-removal`.

## Checklist de onboarding (para quem testa o tutorial)

Quem ainda não conhece o projeto pode validar o [README](README.md) em até 30 minutos. Cronometre
e anote onde travou:

- [ ] Clonar, `npm install`, copiar `.env.example` e gerar os três segredos.
- [ ] `docker compose up -d`, `npm run db:migrate`, `npm run jobs:install`, `npm run db:seed`.
- [ ] `npm run dev` e entrar com `owner@bizu.local` em `/admin`.
- [ ] Entrar com `acme.owner@bizu.local` em `/app` e com `julia@cliente.local` em
      `/portal/login?org=acme`.
- [ ] Cadastrar uma conta nova em `/cadastro` e confirmar o e-mail pelo Mailpit.
- [ ] Rodar `npm run lint`, `npm run typecheck`, `npm test` e `npm run test:db`.
- [ ] Seguir [Deploy em VPS](README.md#10-deploy-em-vps) até `/api/health` responder, em uma VPS
      de teste ou com `SITE_ADDRESS=http://localhost`.
- [ ] Abrir uma issue com cada passo que confundiu ou falhou.

## Licença

Ao contribuir, você concorda que sua contribuição é licenciada sob a [MIT](LICENSE).
