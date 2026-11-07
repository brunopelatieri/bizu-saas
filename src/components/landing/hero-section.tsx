import { Link } from "react-router";
import { SocialIcon } from "@/components/icons/social-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/constants/navigation";

const stackBadges = [
  "React Router v7",
  "Hono",
  "Drizzle",
  "Postgres",
  "Docker",
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b border-border/50 bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:56px_56px] opacity-40"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,oklch(0.74_0.14_230/15%),transparent)]"
      />

      <div className="relative mx-auto max-w-5xl px-6 py-28 text-center md:py-36">
        <Badge variant="outline" className="mb-6 gap-2 px-3 py-1.5 text-xs">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          Starter open source para SaaS · AI Software Engineering
        </Badge>

        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-foreground md:text-6xl">
          Comece seu SaaS{" "}
          <span className="text-primary">com a fundação pronta.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
          O <strong className="text-foreground">Bizu SaaS</strong> traz
          multi-tenant, quatro níveis de login com verificação de e-mail, trial
          configurável e cobrança por Pix, boleto e cartão em módulos. Tudo sobre
          Postgres, em qualquer VPS com Docker.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href={siteConfig.links.repo} target="_blank" rel="noreferrer noopener">
            <Button size="lg" className="min-w-44 gap-2 text-base font-semibold">
              <SocialIcon platform="github" />
              Ver no GitHub
            </Button>
          </a>
          <Link to="#funcionalidades">
            <Button variant="outline" size="lg" className="min-w-44 text-base">
              O que vem pronto
            </Button>
          </Link>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {stackBadges.map((tech) => (
            <span
              key={tech}
              className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs text-muted-foreground"
            >
              {tech}
            </span>
          ))}
        </div>

        {/* Project preview */}
        <div className="relative mx-auto mt-16 max-w-4xl overflow-hidden rounded-xl border border-border/60 bg-card shadow-2xl">
          <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-3">
            <span className="h-3 w-3 rounded-full bg-destructive/70" />
            <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
            <span className="h-3 w-3 rounded-full bg-green-500/70" />
            <span className="ml-3 text-xs text-muted-foreground">
              seu-saas.example.com
            </span>
          </div>
          <img
            src={siteConfig.screenshot}
            alt="Preview do Bizu SaaS"
            className="block w-full object-cover object-top"
          />
        </div>
      </div>
    </section>
  );
}
