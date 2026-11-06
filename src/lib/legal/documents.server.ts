import { loadSettings } from "@/lib/billing/settings";
import { siteConfig } from "@/lib/constants/navigation";
import { getEnv } from "@/lib/env";
import { type Block, fillPlaceholders, parseMarkdown } from "@/lib/legal/markdown";
import privacidade from "@/lib/legal/privacidade.md?raw";
import termos from "@/lib/legal/termos.md?raw";
import { LEGAL_VERSIONS } from "@/lib/legal/versions";

/** Textos legais renderizados no servidor, com os dados da plataforma no lugar dos placeholders. */

export const LEGAL_DOCUMENTS = {
  termos: {
    title: "Termos de uso",
    description: "Regras de uso do serviço, planos, cobrança e encerramento da conta.",
    kind: "terms",
    source: termos,
  },
  privacidade: {
    title: "Política de privacidade",
    description:
      "Quais dados tratamos, por quê, por quanto tempo e como exercer seus direitos pela LGPD.",
    kind: "privacy",
    source: privacidade,
  },
} as const;

export type LegalSlug = keyof typeof LEGAL_DOCUMENTS;

export function isLegalSlug(value: string): value is LegalSlug {
  return Object.hasOwn(LEGAL_DOCUMENTS, value);
}

const DPO_FALLBACK = "[e-mail do encarregado ainda não informado]";

export async function loadLegalDocument(slug: LegalSlug): Promise<{
  title: string;
  description: string;
  version: string;
  blocks: Block[];
}> {
  const { title, description, kind, source } = LEGAL_DOCUMENTS[slug];
  const { dpoEmail } = await loadSettings();
  const version = LEGAL_VERSIONS[kind];

  const text = fillPlaceholders(source, {
    VERSION: version,
    APP_NAME: siteConfig.name,
    APP_URL: getEnv().APP_URL,
    DPO_EMAIL: dpoEmail ?? DPO_FALLBACK,
  });

  return { title, description, version, blocks: parseMarkdown(text) };
}
