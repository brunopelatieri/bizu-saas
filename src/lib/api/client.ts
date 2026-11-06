export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Sessão recusada dentro de `/app` ou `/admin`: limpa os cookies antes de ir ao login. Sem isso,
 * o cache da sessão no cookie mandaria de volta para `/app`, em ciclo.
 */
async function leaveExpiredSession() {
  if (typeof window === "undefined") return;

  const { pathname, search } = window.location;
  if (!pathname.startsWith("/app") && !pathname.startsWith("/admin")) return;

  await fetch("/api/auth/sign-out", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => {});

  window.location.assign(
    `/login?next=${encodeURIComponent(pathname + search)}`,
  );
}

/** Chama a API do próprio app, com cookies, e padroniza os erros em `ApiError`. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (typeof init?.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) await leaveExpiredSession();

    throw new ApiError(
      body?.error ?? "Não foi possível concluir a solicitação.",
      response.status,
      body?.code,
    );
  }

  return body as T;
}
