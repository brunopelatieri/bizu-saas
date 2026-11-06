import type { MetaFunction } from "react-router";
import { OnboardingPage } from "@/pages/onboarding-page";

export const meta: MetaFunction = () => [
  { title: "Sua organização — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Onboarding() {
  return <OnboardingPage />;
}
