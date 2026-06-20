import type { MetaFunction } from "react-router";
import { ProjectsPage } from "@/pages/projects-page";
import { buildMeta } from "@/lib/seo";

export const meta: MetaFunction = () =>
  buildMeta({
    title: "Projetos — Bizu SaaS",
    description:
      "O propósito do Bizu SaaS em detalhe: arquitetura, stack, metodologia de AI Software Engineering e links do repositório open source.",
    path: "/projetos",
  });

export default function Projects() {
  return <ProjectsPage />;
}
