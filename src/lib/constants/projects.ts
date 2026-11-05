import type { Project } from "@/types/project";

export const sampleProjects: Project[] = [
  {
    id: "1",
    title: "Bizu Starter",
    description:
      "Ponto de partida para projetos com login e dashboard: React Router, Hono, Supabase Auth e Drizzle.",
    href: "https://bizu.bru.ia.br",
    tags: ["React Router", "Hono", "Drizzle", "Supabase"],
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
