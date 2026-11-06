const DEFAULT_PATH = "/app";

/**
 * Destino do `?next=` depois do login. Só aceita caminho interno: `//site.com` e
 * `/\site.com` são lidos pelo navegador como outro domínio.
 */
export function safeNextPath(next: string | null | undefined) {
  if (!next?.startsWith("/")) return DEFAULT_PATH;
  if (next.startsWith("//") || next.includes("\\")) return DEFAULT_PATH;
  return next;
}
