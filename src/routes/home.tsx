import type { MetaFunction } from "react-router";
import { HomePage } from "@/pages/home-page";
import { siteConfig } from "@/lib/constants/navigation";
import { buildMeta } from "@/lib/seo";
export const meta: MetaFunction = () =>
  buildMeta({
    title: "Bizu SaaS — Comece seu SaaS com a fundação pronta",
    description:
      "Starter open source para SaaS: multi-tenant, quatro níveis de login com verificação de e-mail, trial configurável e cobrança por Pix, boleto e cartão sobre Postgres.",
    path: "/",
    image: `${siteConfig.url}${siteConfig.logo}`,
  });

export default function Home() {
  return <HomePage />;
}
