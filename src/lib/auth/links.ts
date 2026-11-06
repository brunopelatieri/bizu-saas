import { getEnv } from "@/lib/env";

/** Link absoluto do app para e-mails. Tokens vão só para páginas que não os consomem no GET. */
export function appLink(path: string, params?: Record<string, string>) {
  const url = new URL(path, getEnv().APP_URL);

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}
