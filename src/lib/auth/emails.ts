import { appLink } from "@/lib/auth/links";
import { isPendingSignupExpired } from "@/lib/auth/pending-signup";
import {
  readVerificationClaims,
  recordVerificationIssue,
} from "@/lib/auth/verification-issue";
import { sendEmail } from "@/lib/email/send";
import { changeEmailConfirmTemplate } from "@/lib/email/templates/auth/change-email-confirm";
import { changeEmailDoneTemplate } from "@/lib/email/templates/auth/change-email-done";
import { existingUserSignupTemplate } from "@/lib/email/templates/auth/existing-user-signup";
import { passwordChangedTemplate } from "@/lib/email/templates/auth/password-changed";
import { resetPasswordTemplate } from "@/lib/email/templates/auth/reset-password";
import { verifyEmailTemplate } from "@/lib/email/templates/auth/verify-email";

type Recipient = { id: string; email: string; name: string };

function verificationLink(token: string) {
  return appLink("/verificar-email", { token });
}

/**
 * Ignora a `url` do Better Auth, que aponta para a API: o link leva à página que só
 * renderiza no GET. Vale para o cadastro e para o novo endereço na troca de e-mail.
 * Cadastro pendente vencido não recebe link: quem for o dono cadastra de novo.
 */
export async function sendVerificationLink(
  user: Recipient & { emailVerified: boolean; createdAt: Date },
  token: string,
) {
  const changing = Boolean(readVerificationClaims(token).updateTo);

  if (!changing && isPendingSignupExpired(user)) return;

  await recordVerificationIssue(user.id, token, changing ? "change" : "verify");
  await sendEmail({
    to: user.email,
    ...verifyEmailTemplate({
      name: user.name,
      url: verificationLink(token),
      changing,
    }),
    tags: { template: "verify-email" },
  });
}

/** Primeira etapa da troca: aprovação no endereço atual. */
export async function sendChangeEmailApproval(
  user: Recipient,
  newEmail: string,
  token: string,
) {
  await recordVerificationIssue(user.id, token, "change");
  await sendEmail({
    to: user.email,
    ...changeEmailConfirmTemplate({
      name: user.name,
      newEmail,
      url: verificationLink(token),
    }),
    tags: { template: "change-email-confirm" },
  });
}

/** Na conclusão o usuário já tem o e-mail novo: o antigo vem do token consumido. */
export async function sendChangeEmailDone(
  user: Recipient,
  request: Request | undefined,
) {
  const token = request && new URL(request.url).searchParams.get("token");
  if (!token) return;

  const { email: previousEmail, requestType } = readVerificationClaims(token);
  if (requestType !== "change-email-verification" || !previousEmail) return;

  await sendEmail({
    to: previousEmail,
    ...changeEmailDoneTemplate({
      name: user.name,
      newEmail: user.email,
      forgotPasswordUrl: appLink("/esqueci-senha"),
    }),
    tags: { template: "change-email-done" },
  });
}

export async function sendExistingUserNotice(user: Recipient) {
  await sendEmail({
    to: user.email,
    ...existingUserSignupTemplate({
      name: user.name,
      loginUrl: appLink("/login"),
      forgotPasswordUrl: appLink("/esqueci-senha"),
    }),
    tags: { template: "existing-user-signup" },
  });
}

export async function sendResetPasswordLink(user: Recipient, token: string) {
  await sendEmail({
    to: user.email,
    ...resetPasswordTemplate({
      name: user.name,
      url: appLink("/redefinir-senha", { token }),
    }),
    tags: { template: "reset-password" },
  });
}

export async function sendPasswordChangedNotice(user: Recipient) {
  await sendEmail({
    to: user.email,
    ...passwordChangedTemplate({
      name: user.name,
      forgotPasswordUrl: appLink("/esqueci-senha"),
    }),
    tags: { template: "password-changed" },
  });
}
