import { getEnv } from "@/lib/env";

/**
 * Link absoluto do app para e-mails: `appUrl("/convite/abc")` vira
 * `https://app.exemplo/convite/abc`. Tokens vão no path/query de páginas que não
 * consomem no GET (ver spec-auth.md).
 */
export function appUrl(path: string, base: string = getEnv().APP_URL) {
  return new URL(path, base).toString();
}
