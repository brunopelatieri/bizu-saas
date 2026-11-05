# AI Software Engineering

- **Escopo:** Método de trabalho com agentes, economia de tokens e adaptação do template.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** não declarado
- **Inspiração:** padrões do [ECC](https://github.com/affaan-m/everything-claude-code),
  adaptados à mão. Nada dele foi clonado ou instalado, e este projeto não depende dele.

## Princípio

Mantenha enxuta a janela de contexto e persista o resto em arquivos. Tudo que é
carregado em toda sessão custa tokens em toda mensagem; o que fica em arquivo
custa só quando é lido.

## Fluxo

| Etapa | Saída | Regra |
|---|---|---|
| PRD | `docs/specs/<feature>/prd.md` | O quê e por quê, sem detalhe técnico |
| SPEC | `docs/specs/<feature>/spec.md` | Como, com plano em etapas verificáveis |
| Implementação | Código | Mudanças pequenas, seguindo o plano |
| Verificação | `npm run lint`, `typecheck`, `test` e `build` | Cada etapa confirmada antes da próxima |
| Revisão | `/code-review` | De preferência em sessão nova |
| Contexto | `docs/context/` | Atualizado no mesmo trabalho |

Os níveis de contexto estão em `docs/context/core.md`.

## Técnicas de economia

**Na arquitetura do contexto:**

1. **Roteamento por índice:** o INDEX diz o que ler; o agente não explora às cegas.
2. **Rules por escopo:** toda rule de domínio tem `paths:`. Rule sem `paths:` carrega sempre.
3. **Skills sob demanda:** só a `description` fica carregada, então mantenha-a curta.
4. **Uma fonte por fato:** duplicar regra em dois arquivos duplica custo e cria divergência.
5. **Arquivo morto:** histórico fica fora do caminho padrão de leitura.

**Durante a sessão:**

6. **Leitura cirúrgica:** busque primeiro e leia só o trecho necessário.
7. **Subagentes para busca ampla:** a pesquisa fica no contexto deles; volta só a conclusão.
8. **Compactação em pontos naturais:** depois da pesquisa, antes da implementação, ao
   fechar um marco ou após abandonar uma abordagem. Evite no meio da implementação.
9. **Sessão nova para tarefa nova:** e também para revisar, sem o viés de quem implementou.
10. **Poucos MCPs ativos:** as descrições das ferramentas também ocupam contexto.

**Fora do modelo:**

11. **Hooks, se forem úteis:** verificações determinísticas rodam fora do contexto.
    Este template não ativa nenhum por padrão.
12. **Memória como pista:** resumos de sessões anteriores podem estar defasados;
    confirme no código antes de agir.

## Escolha de modelo

Discuta o modelo antes de tarefas relevantes. A regra é usar o mais leve que resolve.

| Tipo de tarefa | Modelo | Motivo |
|---|---|---|
| Busca, resumo, edição mecânica | Leve (Haiku) | Pouco raciocínio, maior volume |
| Implementação guiada por SPEC, refatoração localizada | Equilibrado (Sonnet) | Melhor custo-benefício no dia a dia |
| PRD/SPEC complexos, arquitetura, bug difícil, segurança | Forte (Opus) | O erro de decisão custa mais que os tokens |

## Orçamento de contexto

- Baseline (`CLAUDE.md`, INDEX, rules sem `paths:` e descrições de skills): abaixo de
  ~3 mil tokens. Meça em bytes ÷ 4; contar linhas esconde tabelas longas.
- INDEX: uma linha por tarefa. Paths ficam nas rules, não no índice.
- Arquivo de domínio: até ~300 linhas; acima disso, divida.
- Rule de domínio: até 40 linhas.
- Meça com `/context-budget`.

## Adaptar para um novo projeto

Para as tarefas de código, siga `docs/context/receitas.md`.

1. Confirme o encaixe: se o projeto precisa de multi-tenant ou cobrança recorrente, ele
   é um SaaS e está fora do propósito deste starter.
2. Reescreva "Domínio" e "Regras inegociáveis" no `CLAUDE.md`.
3. Atualize `docs/context/core.md` e `docs/context/status.md`.
4. Crie um arquivo em `docs/context/` para cada domínio de negócio novo.
5. Para cada domínio, crie rule com `paths:` e, se for grande, skill `ctx-<domínio>`.
6. Registre os arquivos novos no INDEX e remova o que não se aplica.
7. Escolha onde o Postgres roda: local, VPS ou Supabase. Só muda a `DATABASE_URL`.
8. Comece a primeira feature por `/prd`.
