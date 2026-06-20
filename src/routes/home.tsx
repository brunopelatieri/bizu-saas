import type { MetaFunction } from "react-router";
import { HomePage } from "@/pages/home-page";
import { buildMeta } from "@/lib/seo";

export const meta: MetaFunction = () =>
  buildMeta({
    title: "Bizu SaaS — Boilerplate full-stack com AI Software Engineering",
    description:
      "Base robusta para criar SaaS, portais e sistemas web rápido: React Router v7, Hono, Drizzle, Supabase e Docker — com fluxo de desenvolvimento guiado por IA.",
    path: "/",
  });

export default function Home() {
  return <HomePage />;
}
