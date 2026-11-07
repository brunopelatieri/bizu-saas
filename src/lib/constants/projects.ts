import type { Project } from "@/types/project";

export const sampleProjects: Project[] = [
  {
    id: "1",
    title: "Bizu SaaS",
    description:
      "Ponto de partida para SaaS: multi-tenant, quatro níveis de login, trial e pagamentos em módulos.",
    href: "https://github.com/brunopelatieri/bizu-saas",
    tags: ["React Router", "Hono", "Drizzle", "Postgres"],
  },
  {
    id: "2",
    title: "Projeto exemplo",
    description:
      "[A DEFINIR] Descreva um case real, resultado alcançado e tecnologias usadas.",
    href: "https://github.com/brunopelatieri",
    tags: ["React", "API"],
  },
];
