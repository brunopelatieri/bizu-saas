import type { MetaFunction } from "react-router";
import { CheckoutReturnPage } from "@/pages/checkout-return-page";

export const meta: MetaFunction = () => [
  { title: "Pagamento — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function CheckoutReturn() {
  return <CheckoutReturnPage />;
}
