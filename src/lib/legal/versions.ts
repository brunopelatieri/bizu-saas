/**
 * Versões vigentes dos textos legais. Subir uma versão aqui (e atualizar o markdown em
 * `src/lib/legal/`) faz `/api/me` devolver `consentRequired` no próximo login, e o app pede o
 * novo aceite. O formato é livre; `AAAA-MM` basta.
 */
export const LEGAL_VERSIONS = {
  terms: "2026-11",
  privacy: "2026-11",
} as const;

/** Versão que o formulário de cadastro envia: termos e privacidade andam juntos nele. */
export const TERMS_VERSION = LEGAL_VERSIONS.terms;

/** Os documentos que exigem aceite; `marketing` é opcional e nunca bloqueia o uso. */
export const REQUIRED_CONSENTS = ["terms", "privacy"] as const;
export type RequiredConsent = (typeof REQUIRED_CONSENTS)[number];
