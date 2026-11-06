import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin, organization } from "better-auth/plugins";
import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { runInBackground } from "@/lib/auth/background";
import { audit } from "@/lib/audit";
import {
  AUTH_COOKIE_PREFIX,
  CLIENT_IP_HEADER,
  INVITATION_TTL_SECONDS,
  MAX_CUSTOM_ROLES,
  MAX_TENANTS_PER_USER,
} from "@/lib/auth/constants";
import {
  sendChangeEmailApproval,
  sendChangeEmailDone,
  sendExistingUserNotice,
  sendInvitationLink,
  sendPasswordChangedNotice,
  sendResetPasswordLink,
  sendVerificationLink,
} from "@/lib/auth/emails";
import {
  platformAccessControl,
  platformRoles,
  tenantAccessControl,
  tenantRoles,
} from "@/lib/auth/permissions";
import { getEnv } from "@/lib/env";
import { preferredTenantId } from "@/lib/tenant/membership";

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
    // limite por e-mail); personificação, pela política de consentimento da fase 9;
    // escrita sobre usuários, por /api/admin/*, com as regras e a auditoria de lá (o plugin
    // não compara o papel do alvo). `auth.api.*` continua disponível no servidor.
    disabledPaths: [
      "/send-verification-email",
      "/request-password-reset",
      "/admin/impersonate-user",
      "/admin/stop-impersonating",
      "/admin/set-role",
      "/admin/create-user",
      "/admin/update-user",
      "/admin/ban-user",
      "/admin/unban-user",
      "/admin/revoke-user-session",
      "/admin/revoke-user-sessions",
      "/admin/remove-user",
      "/admin/set-user-password",
    ],

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, token }) =>
        sendResetPasswordLink(user, token),
      onPasswordReset: async ({ user }, request) => {
        runInBackground(sendPasswordChangedNotice(user));
        runInBackground(
          audit("auth.password_reset", {
            actor: { id: user.id },
            ip: request?.headers.get(CLIENT_IP_HEADER),
          }),
        );
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
        runInBackground(
          audit("auth.email_verified", {
            actor: { id: user.id },
            ip: request?.headers.get(CLIENT_IP_HEADER),
          }),
        );
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

    // Sessão nova abre no último tenant usado, se a pessoa ainda for membro.
    databaseHooks: {
      session: {
        create: {
          before: async (session) => ({
            data: {
              ...session,
              activeOrganizationId: await preferredTenantId(session.userId),
            },
          }),
        },
      },
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
      // Só por `auth.api.*`: `/api/auth/organization/*` não responde (`auth-ext.ts`).
      // `status`, `access_mode` e `settings` do tenant não passam pelo plugin.
      organization({
        ac: tenantAccessControl,
        roles: tenantRoles,
        creatorRole: "owner",
        dynamicAccessControl: {
          enabled: true,
          maximumRolesPerOrganization: MAX_CUSTOM_ROLES,
        },
        allowUserToCreateOrganization: (user) => user.emailVerified,
        organizationLimit: MAX_TENANTS_PER_USER,
        invitationExpiresIn: INVITATION_TTL_SECONDS,
        requireEmailVerificationOnInvitation: true,
        cancelPendingInvitationsOnReInvite: true,
        // Exclusão de tenant tem carência e fluxo próprio (fase 10).
        disableOrganizationDeletion: true,
        sendInvitationEmail: (data) => sendInvitationLink(data),
        schema: {
          organizationRole: {
            additionalFields: {
              description: { type: "string", required: false, input: true },
            },
          },
        },
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
