# E-mail transacional

- **Escopo:** Contrato `EmailProvider`, provedores, layout de template e Mailpit.
- **Specs relacionadas:** `docs/specs/saas-foundation/spec-email-jobs.md`
- **Paths do código:** `src/lib/email/types.ts`, `src/lib/email/send.ts`, `src/lib/email/providers/`, `src/lib/email/templates/`

## Estado atual (fase 1)

- `types.ts`: `EmailMessage`, `RenderedEmail`, `EmailEvent` e `EmailProvider`
  (`id`, `send`, `verifyWebhook?`, `parseWebhook?`).
- `providers/memory.ts`: `createMemoryProvider()` com `sent[]` e `reset()`; usado por
  `npm test`. `EMAIL_PROVIDER=memory` é recusado em produção por `env.ts`.
- `providers/smtp.ts`: nodemailer com `SMTP_*`; em dev aponta para o Mailpit.
- `send.ts`: `createEmailProvider(env)`, `getEmailProvider()`, `sendEmail(message)` e
  `setEmailProviderForTests()`. `resend` lança erro até a fase 3.
- `templates/layout.ts`: `renderLayout({ subject, heading, paragraphs, action,
  footnote })` devolve `{ subject, html, text }` com HTML escapado.

Hoje `sendEmail` entrega direto. A fase 3 troca o miolo por `email_message` +
fila `email.send` (retry, supressão de bounces, Resend) sem mudar a assinatura.

## Como escrever um template

```ts
// src/lib/email/templates/verify-email.ts
import { renderLayout } from "@/lib/email/templates/layout";

export function verifyEmailTemplate(input: { name: string; url: string }) {
  return renderLayout({
    subject: "Confirme seu e-mail",
    heading: `Olá, ${input.name}`,
    paragraphs: ["Confirme seu e-mail para ativar a conta."],
    action: { label: "Confirmar e-mail", url: input.url },
    footnote: "Se não foi você, ignore este e-mail.",
  });
}
```

- Links sempre absolutos, montados com `APP_URL`.
- Tokens só em páginas que não consomem no GET (`spec-auth.md`).
- O layout escapa tudo que recebe: passe texto puro, não HTML.

## Mailpit

`docker compose up -d` sobe o Mailpit: SMTP em `localhost:1025`, interface em
`http://localhost:8025`. Com `EMAIL_PROVIDER=smtp` e `SMTP_HOST=localhost`, nada sai
para a internet.
