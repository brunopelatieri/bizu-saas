import { PricingPage } from "@/pages/pricing-page";
import { siteConfig } from "@/lib/constants/navigation";
import { listPublicPlans } from "@/lib/billing/public-plans.server";
import { buildMeta } from "@/lib/seo";
import type { Route } from "./+types/pricing";

// Dados públicos e indexáveis: lidos no servidor, direto do Drizzle.
export async function loader() {
  return { plans: await listPublicPlans() };
}

export const meta: Route.MetaFunction = () =>
  buildMeta({
    title: "Preços — Bizu SaaS",
    description:
      "Planos e preços do Bizu SaaS: comece com um período de teste e escolha o plano que cabe na sua equipe.",
    path: "/precos",
    image: `${siteConfig.url}${siteConfig.logo}`,
  });

export default function Pricing({ loaderData }: Route.ComponentProps) {
  return <PricingPage plans={loaderData.plans} />;
}
