import type { MetaFunction } from "react-router";
import { SignupPage } from "@/pages/signup-page";

export const meta: MetaFunction = () => [
  { title: "Criar conta — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Signup() {
  return <SignupPage />;
}
