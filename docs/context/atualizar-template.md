# Atualizar a partir do template

- **Escopo:** Trazer correções e novidades do Bizu SaaS para um projeto derivado, sem perder o que você mudou.
- **Specs relacionadas:** `docs/specs/saas-foundation/spec-testes-operacao.md` (seção "Repositório público")
- **Paths do código:** `CHANGELOG.md`, `package.json`, `drizzle/`, `.env.example`, `docker/.env.prod.example`

Seu projeto nasceu como cópia deste repositório e tem histórico próprio. Por isso o Git não
sabe que os dois têm a mesma origem, e a **primeira** atualização pede `--allow-unrelated-histories`.
Depois dela, os merges seguintes são normais.

## Antes de começar

1. Árvore limpa e branch própria: `git switch -c chore/atualizar-template`.
2. Descubra de qual versão você partiu (a seção do `CHANGELOG.md` mais próxima da data em que clonou) e
   a que você vai: `git ls-remote --tags template` depois do passo 1 abaixo.
3. Leia a seção **Migração** de cada versão entre as duas, do `CHANGELOG.md`. Ela diz o que muda em
   banco, variáveis de ambiente, rotas e compose, e em que ordem. Em `0.x`, uma versão menor pode
   quebrar compatibilidade.

## Primeira vez

```bash
git remote add template https://github.com/brunopelatieri/bizu-saas.git
git fetch template --tags
git merge template/main --allow-unrelated-histories
```

Para ir a uma versão específica em vez do `main`: `git merge v0.2.0 --allow-unrelated-histories`.

Sem ancestral comum, o Git trata **todo arquivo que existe nos dois lados com conteúdo diferente** como
conflito. Isso inclui arquivos que você nunca editou, se o seu clone já estava defasado. Resolva um
a um (veja a tabela abaixo); para um arquivo que você nunca tocou, aceite a versão do template:

```bash
git checkout --theirs caminho/do/arquivo && git add caminho/do/arquivo
```

(`--theirs` é o template; `--ours`, o seu projeto.)

Se o merge ficar confuso, aborte com `git merge --abort` e tente por partes: `git checkout template/main -- docker/ .github/`
traz só a infra, por exemplo.

## Depois do primeiro merge

```bash
git fetch template --tags
git merge template/main
```

O Git agora conhece o ancestral comum, e só o que você e o template mudaram no mesmo trecho conflita.

## Conflitos esperados

| Arquivo | O que costuma acontecer | O que fazer |
|---|---|---|
| `README.md` | Você reescreveu para o seu produto | Fique com o seu e copie do template só o que mudou em instalação, deploy e scripts |
| `CLAUDE.md`, `.claude/rules/`, `.cursor/rules/` | Você adaptou ao domínio do seu produto | Mantenha as suas regras e incorpore as novas regras inegociáveis do template; as rules ficam sempre em par |
| `docs/context/**` | Você documentou o seu produto | Mantenha o seu e leia o do template para saber o que mudou; atualize `INDEX.md` se surgiu arquivo |
| `package.json`, `package-lock.json` | Dependências e `name`, `version`, `repository` próprios | Fique com o seu `name`, `version`, `repository`, `author`; some as dependências novas do template; regenere o lock com `npm install` |
| `CHANGELOG.md` | O seu e o do template são histórias diferentes | Mantenha o seu e use o do template só como leitura |
| `src/lib/legal/*.md` | Você preencheu o controlador | Mantenha o seu texto e traga cláusulas novas à mão; ao mudar o texto, a versão em `versions.ts` sobe e os usuários reaceitam |
| `src/db/schema/*`, `drizzle/` | Você criou tabelas e migrations | Veja a seção abaixo; não apague migration já aplicada |
| `.env.example`, `docker/.env.prod.example` | Você acrescentou variáveis | Some as duas listas; variável nova do template entra no seu `.env` de produção também |
| `docker/compose.prod.yml`, `docker/caddy/Caddyfile` | Você ajustou domínio, volumes ou serviços | Mantenha os seus ajustes sobre o arquivo novo |
| `src/lib/constants/`, `src/components/landing/`, `src/pages/` | Você trocou marca e textos | Mantenha os seus |
| `.github/` | Você trocou o `CODEOWNERS` e os modelos | Mantenha os seus; traga os ajustes de `ci.yml` |

## Migrations do banco

- As migrations do template são numeradas em sequência (`0000_...`, `0001_...`). Se você também criou
  migrations, os números **colidem**. Nunca renumere nem apague uma migration que já foi aplicada em
  algum banco. Renumere só as que ainda não rodaram em lugar nenhum e preserve o resto; depois, rode
  `npm run db:generate`: se o schema mesclado diferir do último snapshot, ele gera a migration que falta.
- Confira `drizzle/meta/_journal.json` depois do merge: a ordem do journal é a ordem de aplicação.
- Tabela de tenant nova **sempre** tem `tenant_id`, `enableRLS()` e policy (`spec-tenant-rbac.md`); o teste
  `tests/db/rls.test.ts` falha se faltar.
- Aplique em um banco de cópia antes de produção: `npm run db:migrate` e `npm run jobs:install`
  (a fila do pg-boss muda de versão com o pacote).
- Em produção, as migrations rodam no serviço `migrate` do compose, nunca no start do app.

## Verificar antes de ir ao ar

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run db:migrate
npm run test:db
npm run build
```

Depois suba o compose de produção em uma cópia (ou um domínio de teste) e confira `/api/health`,
`/api/ready`, um login e um e-mail real. Atualize o que as notas de migração pedirem (variáveis no
`docker/.env.prod`, volumes, perfis do compose).

## Depois de atualizar

- Registre no seu projeto a versão do template em que está (uma linha no seu `CHANGELOG.md` ou no
  `docs/context/status.md`): é o que torna a próxima atualização rápida.
- Atualize `docs/context/` onde o template mudou o comportamento (regra de contexto vivo do `CLAUDE.md`).
- Um aviso em [SECURITY.md](../../SECURITY.md) do template é para você: aplique a correção mesmo que
  não queira o resto da versão (use `git cherry-pick <commit>` do `template/main`).
