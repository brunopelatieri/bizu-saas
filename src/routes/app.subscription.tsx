import type { MetaFunction } from "react-router";
import { SubscriptionPage } from "@/pages/subscription-page";

export const meta: MetaFunction = () => [
  { title: "Assinatura — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function Subscription() {
  return <SubscriptionPage />;
}
