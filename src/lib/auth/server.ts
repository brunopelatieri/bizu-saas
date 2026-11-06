import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { runInBackground } from "@/lib/auth/background";
import { AUTH_COOKIE_PREFIX, CLIENT_IP_HEADER } from "@/lib/auth/constants";
import {
  sendChangeEmailApproval,
  sendChangeEmailDone,
  sendExistingUserNotice,
  sendPasswordChangedNotice,
  sendResetPasswordLink,
  sendVerificationLink,
} from "@/lib/auth/emails";
import { platformAccessControl, platformRoles } from "@/lib/auth/permissions";
import { getEnv } from "@/lib/env";

function createAuth() {
  const env = getEnv();

  return betterAuth({
    appName: "Bizu SaaS",
    baseURL: env.APP_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [new URL(env.APP_URL).origin],
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),

    // Sem rota HTTP: reenvio e reset passam por /api/auth-ext (resposta uniforme e
    // limite por e-mail); personificação, pela política de consentimento da fase 9.
    // `auth.api.*` continua disponível no servidor.
    disabledPaths: [
      "/send-verification-email",
      "/request-password-reset",
      "/admin/impersonate-user",
      "/admin/stop-impersonating",
    ],

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, token }) =>
        sendResetPasswordLink(user, token),
      onPasswordReset: async ({ user }) => {
        runInBackground(sendPasswordChangedNotice(user));
      },
      onExistingUserSignUp: ({ user }) => sendExistingUserNotice(user),
    },

    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      expiresIn: 3600,
      autoSignInAfterVerification: true,
      sendVerificationEmail: ({ user, token }) =>
        sendVerificationLink(user, token),
      afterEmailVerification: async (user, request) => {
        runInBackground(sendChangeEmailDone(user, request));
      },
    },

    user: {
      additionalFields: {
        phone: { type: "string", required: false, input: false },
        locale: { type: "string", required: false, input: false },
      },
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: ({ user, newEmail, token }) =>
          sendChangeEmailApproval(user, newEmail, token),
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 300 },
    },

    // Só o reset usa `verification`: o token não fica legível no banco.
    verification: { storeIdentifier: "hashed" },

    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: {
        "/sign-in/email": { window: 10, max: 3 },
        "/sign-up/email": { window: 10, max: 3 },
        "/reset-password": { window: 60, max: 5 },
        "/change-email": { window: 60, max: 3 },
        // Toda página consulta a sessão: sem escrita no banco por leitura.
        "/get-session": false,
      },
    },

    plugins: [
      admin({
        ac: platformAccessControl,
        roles: platformRoles,
        defaultRole: "user",
        adminRoles: ["platform_owner", "platform_support"],
        impersonationSessionDuration: 3600,
      }),
    ],

    advanced: {
      cookiePrefix: AUTH_COOKIE_PREFIX,
      useSecureCookies: env.NODE_ENV === "production",
      database: { generateId: "uuid" },
      // Preenchido pela API a partir de TRUSTED_PROXY_HOPS (`src/api/auth-ext.ts`):
      // X-Forwarded-For vem do cliente e não serve para limitar tentativas.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
      backgroundTasks: { handler: runInBackground },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

/**
 * Instância `auth` (equipe e plataforma). Criada na primeira chamada, como `getDb`:
 * `src/server.ts` só carrega `.env.local` depois de importar a API.
 */
export function getAuth(): Auth {
  if (!instance) instance = createAuth();
  return instance;
}
