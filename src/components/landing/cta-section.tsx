import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/constants/navigation";

export function CtaSection() {
  return (
    <section className="bg-background py-24">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 px-8 py-16 shadow-sm">
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Comece seu próximo projeto com vantagem.
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-lg text-muted-foreground">
            Clone a base, leia o contexto e coloque sua ideia para rodar em
            minutos — com humanos e IA no mesmo fluxo de engenharia.
          </p>

          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href={siteConfig.links.repo} target="_blank" rel="noreferrer">
              <Button size="lg" className="min-w-48 text-base font-semibold">
                Clonar no GitHub
              </Button>
            </a>
            <Link to="/contato">
              <Button variant="outline" size="lg" className="min-w-48 text-base">
                Falar com a equipe
              </Button>
            </Link>
          </div>

          <p className="mt-5 text-sm text-muted-foreground">
            Open source · Stack moderna · Pronto para VPS com Docker
          </p>
        </div>
      </div>
    </section>
  );
}
