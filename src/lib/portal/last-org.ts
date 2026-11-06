const KEY = "bizu.portal.org";

/**
 * O último tenant do login, para `/portal/login` sem `?org=`. Sessão vencida cai lá sem o
 * parâmetro, e sem ele não há magic link. Conveniência: sem armazenamento, só some o atalho.
 */
export function rememberPortalOrg(org: string) {
  try {
    window.localStorage.setItem(KEY, org);
  } catch {
    // Armazenamento bloqueado: a pessoa usa o link da empresa.
  }
}

export function lastPortalOrg() {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
