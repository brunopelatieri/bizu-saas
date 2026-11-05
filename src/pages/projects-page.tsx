import { PageHero } from "@/components/layout/page-hero";
import { SocialIcon } from "@/components/icons/social-icons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { siteConfig } from "@/lib/constants/navigation";

const targetProjects = [
  "Portal de clientes",
  "Área de membros",
  "Site institucional",
  "Landing page",
  "Blog com SSR",
  "Dashboard / Admin",
  "Sistemas internos",
];

const readyModules = [
  {
    title: "Páginas públicas com SSR",
    body: "Landing, sobre, projetos, contato e blog renderizados no servidor, com meta tags e Open Graph dinâmico por rota.",
  },
  {
    title: "API Hono integrada",
    body: "Endpoints em /api/* no mesmo processo do SSR, validados com Zod e persistindo no Postgres via Drizzle.",
  },
  {
    title: "Auth + dashboard",
    body: "Login com Supabase Auth e área autenticada client-side, sem dados sensíveis no HTML inicial.",
  },
  {
    title: "Base de produto",
    body: "shadcn/ui + Tailwind v4, tema dark/light, formulários, estado com Zustand e dashboard com dados protegidos no servidor.",
  },
];

const docs = [
  {
    label: "Repositório principal (VPS/Docker)",
    description:
      "Código focado em Node único: react-router-hono-server + Hono + SSR + Docker.",
    href: siteConfig.links.repo,
    platform: "repo" as const,
  },
  {
    label: "Repositório Vercel",
    description:
      "Arquitetura otimizada para deploy na Vercel — base da demo em bizu.bru.ia.br.",
    href: siteConfig.links.repoVercel,
    platform: "repo-vercel" as const,
  },
  {
    label: "Demo ao vivo",
    description: "Referência visual em https://bizu.bru.ia.br (Vercel).",
    href: siteConfig.links.demo,
    platform: "site" as const,
  },
];

export function ProjectsPage() {
  return (
    <>
      <PageHero
        eyebrow="Projeto em destaque"
        title="Bizu Starter"
        description="Ponto de partida para projetos pequenos e médios com site público, login e dashboard, usando Supabase Auth e Drizzle."
        actions={
          <>
            <a href={siteConfig.links.repo} target="_blank" rel="noreferrer noopener">
              <Button className="gap-2">
                <SocialIcon platform="github" />
                Ver no GitHub
              </Button>
            </a>
            <a href={siteConfig.links.demo} target="_blank" rel="noreferrer noopener">
              <Button variant="outline" className="gap-2">
                <SocialIcon platform="site" />
                Abrir demo
              </Button>
            </a>
          </>
        }
      />

      <section className="px-6 py-16">
        <div className="mx-auto max-w-3xl space-y-5 text-muted-foreground">
          <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            O propósito
          </h2>
          <p>
            O <strong className="text-foreground">Bizu Starter</strong> é uma base
            moderna e reutilizável para projetos pequenos e médios que não são
            SaaS, mas precisam de login e dashboard. Em vez de gastar semanas montando a
            fundação, você começa com SSR, API, banco, autenticação, UI e deploy
            já integrados — e foca no que diferencia o seu projeto.
          </p>
          <p>
            O diferencial é a metodologia de{" "}
            <strong className="text-foreground">AI Software Engineering</strong>:
            especificação antes da implementação, contexto técnico vivo e
            mudanças pequenas e documentadas. Assim, humanos e agentes de IA
            tomam decisões com o mesmo mapa técnico, reduzindo retrabalho.
          </p>
        </div>
      </section>

      <section className="border-t border-border/50 bg-muted/30 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-4 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Para que tipo de projeto
          </h2>
          <p className="mb-8 max-w-2xl text-muted-foreground">
            Uma base genérica o suficiente para se adaptar ao seu produto.
          </p>
          <div className="flex flex-wrap gap-2">
            {targetProjects.map((item) => (
              <span
                key={item}
                className="rounded-full border border-border/60 bg-card px-4 py-1.5 text-sm text-muted-foreground"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Arquitetura e módulos
          </h2>

          <div className="mb-10 overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
            <div className="border-b border-border/60 bg-muted/40 px-5 py-3 text-xs text-muted-foreground">
              Node process único · react-router-hono-server
            </div>
            <pre className="overflow-x-auto px-5 py-5 text-xs leading-relaxed text-muted-foreground">
{`React Router v7 Framework Mode + SSR global
  |
  |-- /api/*              Hono API -> Drizzle -> Postgres
  |-- /, /sobre, /blog    rotas públicas com SSR e SEO
  |-- /login              Supabase Auth
  \`-- /dashboard/**       client-side, sem loader sensível no servidor`}
            </pre>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {readyModules.map((module) => (
              <div
                key={module.title}
                className="rounded-xl border border-border/60 bg-card p-6 shadow-sm"
              >
                <h3 className="mb-2 font-semibold text-foreground">
                  {module.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {module.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/50 bg-muted/30 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-4 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Repositório e demo
          </h2>
          <p className="mb-8 max-w-2xl text-muted-foreground">
            Este repositório é focado em <strong className="text-foreground">VPS + Docker + Node único</strong>{" "}
            (react-router-hono-server + Hono + SSR). A demo pública roda na{" "}
            <strong className="text-foreground">Vercel</strong> — a arquitetura
            otimizada para esse deploy está no repositório{" "}
            <a
              href={siteConfig.links.repoVercel}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-primary underline-offset-4 transition-colors duration-200 hover:text-primary/80 hover:underline"
            >
              <SocialIcon platform="repo-vercel" className="size-3.5" />
              bizu-saas-vercel
            </a>
            .
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((doc) => (
              <Card key={doc.label}>
                <CardHeader>
                  <CardTitle>{doc.label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {doc.description}
                  </p>
                  <a
                    href={doc.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors duration-200 hover:text-primary/80"
                  >
                    <SocialIcon platform={doc.platform} className="size-4" />
                    Acessar
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
