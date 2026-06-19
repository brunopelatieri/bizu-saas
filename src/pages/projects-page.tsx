import { ProjectCard } from "@/components/projects/project-card";
import { PageHero } from "@/components/layout/page-hero";
import { sampleProjects } from "@/lib/constants/projects";

export function ProjectsPage() {
  return (
    <>
      <PageHero
        title="Projetos"
        description="Troque os placeholders abaixo por cases reais ou integre com Drizzle depois."
      />
      <section className="px-6 py-12">
        <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2">
          {sampleProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </section>
    </>
  );
}
