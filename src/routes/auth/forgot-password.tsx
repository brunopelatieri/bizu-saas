import type { MetaFunction } from "react-router";
import { ForgotPasswordPage } from "@/pages/forgot-password-page";

export const meta: MetaFunction = () => [
  { title: "Esqueci a senha — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function ForgotPassword() {
  return <ForgotPasswordPage />;
}
