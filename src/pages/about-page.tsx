import { PageHero } from "@/components/layout/page-hero";

export function AboutPage() {
  return (
    <>
      <PageHero
        title="Sobre mim"
        description="Substitua este conteúdo pela sua bio, experiência e foco profissional."
      />
      <section className="px-6 py-12">
        <div className="prose prose-invert mx-auto max-w-3xl text-muted-foreground">
          <p>
            [A DEFINIR] Escreva aqui um parágrafo introdutório sobre quem você é,
            o que faz e para quem trabalha.
          </p>
          <p>
            [A DEFINIR] Adicione destaques de experiência, stack principal e o
            tipo de projetos que você busca.
          </p>
        </div>
      </section>
    </>
  );
}
