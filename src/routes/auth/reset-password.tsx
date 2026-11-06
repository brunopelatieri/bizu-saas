import type { MetaFunction } from "react-router";
import { ResetPasswordPage } from "@/pages/reset-password-page";

export const meta: MetaFunction = () => [
  { title: "Redefinir senha — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

// Sem `loader` nem `action`: esta rota nunca toca no token no servidor.
export default function ResetPassword() {
  return <ResetPasswordPage />;
}
