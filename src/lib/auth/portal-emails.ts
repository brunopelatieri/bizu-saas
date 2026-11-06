import {
  PORTAL_INVITE_TTL_SECONDS,
  PORTAL_MAGIC_LINK_TTL_SECONDS,
} from "@/lib/auth/constants";
import { appLink } from "@/lib/auth/links";
import { isPendingSignupExpired } from "@/lib/auth/pending-signup";
import { sendEmail } from "@/lib/email/send";
import { existingUserSignupTemplate } from "@/lib/email/templates/auth/existing-user-signup";
import { passwordChangedTemplate } from "@/lib/email/templates/auth/password-changed";
import { verifyEmailTemplate } from "@/lib/email/templates/auth/verify-email";
import { portalInviteTemplate } from "@/lib/email/templates/portal-invite";
import { portalMagicLinkTemplate } from "@/lib/email/templates/portal-magic-link";

type Recipient = { email: string; name: string };

/** Definido no servidor: a rota HTTP do plugin não responde (`src/api/portal.ts`). */
export type PortalLinkContext = {
  kind: "invite" | "login";
  tenantName: string;
  tenantSlug: string;
  customerName: string;
};

function portalLogin(org?: string | null) {
  return appLink("/portal/login", org ? { org } : undefined);
}

/** O link leva à página que só renderiza no GET: entrar exige o clique no botão. */
export async function sendPortalLink(
  email: string,
  token: string,
  { kind, tenantName, tenantSlug, customerName }: PortalLinkContext,
) {
  const url = appLink("/portal/entrar", { token, org: tenantSlug });

  if (kind === "invite") {
    await sendEmail({
      to: email,
      ...portalInviteTemplate({
        customerName,
        tenantName,
        url,
        expiresInHours: PORTAL_INVITE_TTL_SECONDS / (60 * 60),
      }),
      tags: { template: "portal-invite" },
    });
    return;
  }

  await sendEmail({
    to: email,
    ...portalMagicLinkTemplate({
      tenantName,
      url,
      expiresInMinutes: PORTAL_MAGIC_LINK_TTL_SECONDS / 60,
    }),
    tags: { template: "portal-magic-link" },
  });
}

/** `org` volta no `callbackURL` que o cadastro passou ao Better Auth. */
function orgOf(url: string) {
  const callback = new URL(url).searchParams.get("callbackURL");
  if (!callback) return null;

  return new URL(callback, url).searchParams.get("org");
}

/**
 * Ignora a `url` do Better Auth, que aponta para a API. Cadastro pendente vencido não
 * recebe link: a senha foi criada antes de o e-mail ser provado.
 */
export async function sendPortalVerificationLink(
  user: Recipient & { emailVerified: boolean; createdAt: Date },
  token: string,
  betterAuthUrl: string,
) {
  if (isPendingSignupExpired(user)) return;

  const org = orgOf(betterAuthUrl);

  await sendEmail({
    to: user.email,
    ...verifyEmailTemplate({
      name: user.name,
      url: appLink("/portal/confirmar", { token, ...(org ? { org } : {}) }),
      changing: false,
    }),
    tags: { template: "verify-email" },
  });
}

export async function sendPortalExistingUserNotice(user: Recipient) {
  await sendEmail({
    to: user.email,
    ...existingUserSignupTemplate({
      name: user.name,
      loginUrl: portalLogin(),
      forgotPasswordUrl: portalLogin(),
    }),
    tags: { template: "existing-user-signup" },
  });
}

export async function sendPortalPasswordChanged(user: Recipient) {
  await sendEmail({
    to: user.email,
    ...passwordChangedTemplate({
      name: user.name,
      forgotPasswordUrl: portalLogin(),
    }),
    tags: { template: "password-changed" },
  });
}
