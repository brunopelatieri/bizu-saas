# Specs de Features

Cada feature relevante tem uma pasta própria, criada antes do código:

```text
docs/specs/
|-- _templates/
|   |-- prd.md      o quê e por quê
|   `-- spec.md     como
`-- <feature>/
    |-- prd.md
    `-- spec.md
```

## Quando usar

| Tamanho da mudança | O que escrever |
|---|---|
| Correção pequena ou ajuste visual | Nada; vá direto ao código |
| Mudança técnica localizada | Só `spec.md`, enxuta |
| Feature nova para o usuário, integração externa ou schema novo | `prd.md` e `spec.md` |

## Fluxo

1. `/prd <feature>`: cria o PRD a partir do template.
2. `/spec <feature>`: lê o PRD, carrega só o contexto necessário e escreve a SPEC.
3. Implementa seguindo o plano da SPEC, em etapas verificáveis.
4. Roda `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` e `/code-review`.
5. Atualiza `docs/context/` e marca PRD e SPEC como entregues.

## Regras

- Spec é a fonte da intenção; `docs/context/` é a fonte do estado atual.
- Depois de entregue, a spec vira histórico. Não a mantenha sincronizada com o
  código: o que continua valendo vai para o arquivo de domínio.
- Não carregue specs antigas por padrão. Abra só a da feature em andamento.
