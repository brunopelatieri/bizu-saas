import { createClient, type User } from "@supabase/supabase-js";
import { createMiddleware } from "hono/factory";
import { logError } from "@/api/log";
import { requireSupabaseConfig } from "@/lib/supabase/config";

export type AuthEnv = { Variables: { user: User } };

/** Retorna o usuário do token, `null` se for inválido e lança se o Auth falhar. */
export type VerifyToken = (token: string) => Promise<User | null>;

let authClient: ReturnType<typeof createClient> | undefined;

function getAuthClient() {
  authClient ??= createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  return authClient;
}

// Só estes status dizem que o token é ruim. Os demais, como 429 e 5xx, são falha do Auth.
const INVALID_TOKEN_STATUS = new Set([400, 401, 403]);

export const verifySupabaseToken: VerifyToken = async (token) => {
  requireSupabaseConfig();

  const { data, error } = await getAuthClient().auth.getUser(token);

  if (!error) return data.user;
  if (error.status && INVALID_TOKEN_STATUS.has(error.status)) return null;
  throw error;
};

/**
 * Exige `Authorization: Bearer <access_token>`. O gate do `ProtectedRoute` roda
 * no cliente e não protege dados: toda rota privada da API deve usar este
 * middleware. Falha fechada: se o Auth estiver indisponível, a rota não abre.
 */
export function createRequireAuth(verify: VerifyToken) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const token = c.req.header("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];

    if (!token) {
      return c.json({ error: "Autenticação necessária." }, 401);
    }

    let user: User | null;

    try {
      user = await verify(token);
    } catch (error) {
      logError("Falha ao validar token", error);
      return c.json({ error: "Autenticação indisponível." }, 503);
    }

    if (!user) {
      return c.json({ error: "Sessão inválida ou expirada." }, 401);
    }

    c.set("user", user);
    await next();
  });
}

export const requireAuth = createRequireAuth(verifySupabaseToken);
