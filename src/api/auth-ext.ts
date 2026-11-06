import { createHash } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { Hono } from "hono";
import {
  jsonBodyLimit,
  MINUTE,
  sameOrigin,
  validationError,
} from "@/api/guards";
import { clientKey, rateLimit } from "@/api/rate-limit";
import {
  INVALID_LINK_MESSAGE,
  verificationGuard,
} from "@/api/verification-guard";
import { runInBackground } from "@/lib/auth/background";
import { CLIENT_IP_HEADER } from "@/lib/auth/constants";
import { purgeExpiredPendingSignup } from "@/lib/auth/pending-signup";
import { getAuth } from "@/lib/auth/server";
import { readVerificationClaims } from "@/lib/auth/verification-issue";
import {
  emailOnlySchema,
  signupSchema,
  type VerificationStep,
  verifyEmailSchema,
} from "@/lib/schemas/auth";

/** O IP resolvido por `TRUSTED_PROXY_HOPS`, sobrescrevendo o que o cliente mandar. */
function forwardedHeaders(c: Context) {
  const headers = new Headers(c.req.raw.headers);
  headers.set(CLIENT_IP_HEADER, clientKey(c));
  // Quem chama estas funções remonta o corpo.
  headers.delete("Content-Length");
  return headers;
}

/** O corpo do Better Auth não diz em que etapa o token estava. */
function verificationStep(token: string): VerificationStep {
  const { requestType } = readVerificationClaims(token);

  if (requestType === "change-email-confirmation") return "change-approved";
  if (requestType === "change-email-verification") return "change-done";
  return "verified";
}

const validEmail = zValidator("json", emailOnlySchema, validationError);

/** Conta por e-mail, exista ele ou não: o 429 não revela nada. */
const rateLimitByEmail = rateLimit({
  limit: 3,
  windowMs: 60 * MINUTE,
  key: async (c) => {
    const { email } = (await c.req.json()) as { email: string };
    return createHash("sha256")
      .update(email.trim().toLowerCase())
      .digest("hex");
  },
});

/**
 * Rotas de autenticação com regra própria, antes do handler do Better Auth.
 *
 * - Cadastro: exige o aceite de termos e devolve sempre o mesmo corpo. O do Better
 *   Auth traz id e datas, que diferem entre e-mail novo e existente.
 * - `verify-email`: o endpoint do Better Auth é GET e consumiria o token em qualquer
 *   visita. Aqui só existe POST, atrás do `verificationGuard`.
 * - `/api/auth-ext/*`: respondem `{ ok: true }` na hora, antes de saber se o e-mail
 *   existe. O trabalho segue em segundo plano.
 * - `/api/auth/organization/*`: fechado. Tenant, equipe e papéis passam pelas rotas
 *   próprias (`tenant.ts`, `team.ts`, `roles.ts`), que aplicam `requireTenant`, permissões
 *   reservadas, regra de último owner e auditoria; o plugin só responde a `auth.api.*`.
 */
export const authRoutes = new Hono();

authRoutes.use("/api/auth/*", jsonBodyLimit, sameOrigin);
authRoutes.use("/api/auth-ext/*", jsonBodyLimit, sameOrigin);

authRoutes.post(
  "/api/auth/sign-up/email",
  zValidator("json", signupSchema, validationError),
  async (c) => {
    const { name, email, password } = c.req.valid("json");

    await purgeExpiredPendingSignup(email);

    const response = await getAuth().handler(
      new Request(c.req.url, {
        method: "POST",
        headers: forwardedHeaders(c),
        body: JSON.stringify({ name, email, password }),
      }),
    );

    return response.ok ? c.json({ ok: true }) : response;
  },
);

authRoutes.get("/api/auth/verify-email", (c) =>
  c.json({ error: "Use o botão da página de confirmação." }, 405),
);

authRoutes.post(
  "/api/auth/verify-email",
  rateLimit({ limit: 10, windowMs: MINUTE }),
  zValidator("json", verifyEmailSchema, validationError),
  verificationGuard,
  async (c) => {
    const token = c.get("verificationToken");
    const url = new URL(c.req.url);
    url.search = new URLSearchParams({ token }).toString();

    const headers = forwardedHeaders(c);
    headers.delete("Content-Type");

    const response = await getAuth().handler(
      new Request(url, { method: "GET", headers }),
    );

    // Expirado ou adulterado: a mesma resposta de link já usado.
    if (!response.ok) return c.json({ error: INVALID_LINK_MESSAGE }, 400);

    for (const cookie of response.headers.getSetCookie()) {
      c.header("Set-Cookie", cookie, { append: true });
    }

    return c.json({ step: verificationStep(token) });
  },
);

authRoutes.all("/api/auth/organization/*", (c) =>
  c.json({ error: "Não encontrado." }, 404),
);

authRoutes.on(["GET", "POST"], "/api/auth/*", async (c) => {
  // Remontada: no servidor Node, `c.req.raw` é um objeto do @hono/node-server que o
  // construtor de `Request` não aceita. O `jsonBodyLimit` já limitou o corpo.
  const { method, url } = c.req;
  const body = method === "POST" ? await c.req.text() : undefined;

  return getAuth().handler(
    new Request(url, { method, headers: forwardedHeaders(c), body }),
  );
});

authRoutes.post(
  "/api/auth-ext/resend-verification",
  rateLimit({ limit: 3, windowMs: 15 * MINUTE }),
  validEmail,
  rateLimitByEmail,
  (c) => {
    const { email } = c.req.valid("json");

    // Sem `headers`: a chamada não herda a sessão de quem pede. O próprio endpoint só
    // envia a usuário existente e não verificado.
    runInBackground(getAuth().api.sendVerificationEmail({ body: { email } }));

    return c.json({ ok: true });
  },
);

authRoutes.post(
  "/api/auth-ext/forgot-password",
  rateLimit({ limit: 3, windowMs: 15 * MINUTE }),
  validEmail,
  (c) => {
    const { email } = c.req.valid("json");

    runInBackground(getAuth().api.requestPasswordReset({ body: { email } }));

    return c.json({ ok: true });
  },
);
