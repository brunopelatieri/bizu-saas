# Módulo Sentry (opcional)

Envia ao Sentry os erros que passam por `logError` (`src/api/log.ts`). Sem `SENTRY_DSN`,
o módulo nunca é carregado e o `@sentry/node` não entra em memória.

## Ligar

1. Crie um projeto Node no Sentry e copie o DSN.
2. Defina `SENTRY_DSN` no ambiente do `app` e do `worker`. Reinicie.

O que sai: nome do erro, código, mensagem **sem e-mails** e a pilha. Não saem cabeçalhos,
corpo, IP nem usuário (`dataCollection` zerado e `beforeSend`). Erro do Drizzle perde a mensagem
inteira, porque ela traz os parâmetros da query.

## Remover

1. Tire `SENTRY_DSN` do ambiente.
2. Apague esta pasta (`src/lib/monitoring/sentry/`).
3. `npm uninstall @sentry/node`.

`npm run check:module-removal -- sentry` prova que typecheck e testes passam sem a pasta.
