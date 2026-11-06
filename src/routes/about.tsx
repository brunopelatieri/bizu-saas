import type { MetaFunction } from "react-router";
import { AboutPage } from "@/pages/about-page";
import { buildMeta } from "@/lib/seo";

export const meta: MetaFunction = () =>
  buildMeta({
    title: "Sobre — Bruno Pelatieri Goulart | Bizu SaaS",
    description:
      "Desenvolvedor Full Stack desde 2006: IA, automação com n8n e LangChain, agentes autônomos, Web3 e arquitetura escalável. Quem está por trás do Bizu SaaS.",
    path: "/sobre",
  });

export default function About() {
  return <AboutPage />;
}
