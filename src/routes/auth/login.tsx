import type { MetaFunction } from "react-router";
import { LoginPage } from "@/pages/login-page";

export const meta: MetaFunction = () => [
  { title: "Entrar — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Login() {
  return <LoginPage />;
}
