import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/constants/navigation";

const stackBadges = [
  "React Router v7",
  "Hono",
  "Drizzle",
  "Supabase",
  "Tailwind v4",
  "Docker",
];

const modules = [
  { name: "Landing + SSR", ready: 100 },
  { name: "Blog com Open Graph", ready: 100 },
  { name: "Auth + Dashboard", ready: 90 },
  { name: "API Hono + Postgres", ready: 95 },
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
          Boilerplate full-stack · AI Software Engineering
        </Badge>

        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-foreground md:text-6xl">
          Comece projetos robustos.{" "}
          <span className="text-primary">Com IA, do primeiro commit.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
          O <strong className="text-foreground">Bizu SaaS</strong> é uma base
          full-stack pronta para criar SaaS, portais, sites e dashboards — com
          arquitetura moderna e contexto vivo para humanos e agentes de IA
          trabalharem juntos.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href={siteConfig.links.repo} target="_blank" rel="noreferrer">
            <Button size="lg" className="min-w-44 text-base font-semibold">
              Ver no GitHub
            </Button>
          </a>
          <Link to="#metodologia">
            <Button variant="outline" size="lg" className="min-w-44 text-base">
              Ver a metodologia
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
              bizu.bru.ia.br
            </span>
          </div>
          <div className="grid grid-cols-4 gap-0 p-6">
            <div className="col-span-1 space-y-2 border-r border-border/40 pr-4">
              {["Landing", "Blog", "Login", "Dashboard", "API /health"].map(
                (item, i) => (
                  <div
                    key={item}
                    className={`rounded-md px-3 py-2 text-left text-xs ${i === 0 ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground"}`}
                  >
                    {item}
                  </div>
                )
              )}
            </div>
            <div className="col-span-3 space-y-4 pl-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">
                  Módulos prontos para usar
                </span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  SSR + API + Auth
                </span>
              </div>
              {modules.map((module) => (
                <div key={module.name} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-foreground">
                      {module.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {module.ready}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${module.ready}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
