const DEFAULT_PATH = "/app";

/**
 * Destino do `?next=` depois do login. Só aceita caminho interno: `//site.com`,
 * `/\site.com` e `/<tab>/site.com` são lidos pelo navegador como outro domínio.
 */
export function safeNextPath(next: string | null | undefined) {
  if (!next?.startsWith("/")) return DEFAULT_PATH;
  if (next.startsWith("//") || /[\s\\]/.test(next)) return DEFAULT_PATH;
  return next;
}
