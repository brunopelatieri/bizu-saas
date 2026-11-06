import { describe, expect, it } from "vitest";
import { changeEmailConfirmTemplate } from "@/lib/email/templates/auth/change-email-confirm";
import { changeEmailDoneTemplate } from "@/lib/email/templates/auth/change-email-done";
import { existingUserSignupTemplate } from "@/lib/email/templates/auth/existing-user-signup";
import { passwordChangedTemplate } from "@/lib/email/templates/auth/password-changed";
import { resetPasswordTemplate } from "@/lib/email/templates/auth/reset-password";
import { verifyEmailTemplate } from "@/lib/email/templates/auth/verify-email";

const url = "https://app.example/verificar-email?token=abc";
const name = "<b>Ana</b>";

describe("templates de autenticação", () => {
  it.each([
    ["verify-email", verifyEmailTemplate({ name, url })],
    ["reset-password", resetPasswordTemplate({ name, url })],
    [
      "change-email-confirm",
      changeEmailConfirmTemplate({ name, url, newEmail: "nova@example.com" }),
    ],
    [
      "existing-user-signup",
      existingUserSignupTemplate({
        name,
        loginUrl: url,
        forgotPasswordUrl: "https://app.example/esqueci-senha",
      }),
    ],
    [
      "password-changed",
      passwordChangedTemplate({ name, forgotPasswordUrl: url }),
    ],
    [
      "change-email-done",
      changeEmailDoneTemplate({
        name,
        newEmail: "nova@example.com",
        forgotPasswordUrl: url,
      }),
    ],
  ])("%s traz o link no HTML e no texto, com o nome escapado", (_, email) => {
    expect(email.subject).not.toBe("");
    expect(email.text).toContain(url);
    expect(email.html).toContain(url.replaceAll("&", "&amp;"));
    expect(email.html).not.toContain("<b>Ana</b>");
    expect(email.html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
  });

  it("muda o texto quando confirma o novo endereço na troca de e-mail", () => {
    const signup = verifyEmailTemplate({ name, url });
    const change = verifyEmailTemplate({ name, url, changing: true });

    expect(change.text).not.toBe(signup.text);
  });
});
