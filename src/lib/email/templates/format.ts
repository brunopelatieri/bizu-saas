/**
 * Auxiliares dos templates: links absolutos e formatação em pt-BR.
 * Texto vindo de dados não é escapado aqui; o `renderLayout` escapa tudo.
 */

/** Recusa link relativo: e-mail não tem origem. Monte com `appUrl` (`@/lib/email/links`). */
export function assertAbsoluteUrl(url: string) {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("Link de e-mail precisa ser absoluto (use APP_URL).");
  }
  return url;
}

export function formatMoney(amountCents: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(
    amountCents / 100,
  );
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

export function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}
