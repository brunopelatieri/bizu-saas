import type { MetaFunction } from "react-router";
import { HomePage } from "@/pages/home-page";
import { siteConfig } from "@/lib/constants/navigation";
import { buildMeta } from "@/lib/seo";
export const meta: MetaFunction = () =>
  buildMeta({
    title: "Bizu Starter — Site, login e dashboard prontos para o seu projeto",
    description:
      "Ponto de partida para projetos pequenos e médios com área de login e dashboard: React Router v7, Hono, Supabase Auth, Drizzle e Docker, com fluxo guiado por IA.",
    path: "/",
    image: `${siteConfig.url}${siteConfig.logo}`,
  });

export default function Home() {
  return <HomePage />;
}
