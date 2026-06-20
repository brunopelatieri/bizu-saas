import { PageHero } from "@/components/layout/page-hero";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { siteConfig } from "@/lib/constants/navigation";

const targetProjects = [
  "SaaS",
  "Portal de clientes",
  "Site institucional",
  "Landing page",
  "Blog com SSR",
  "Dashboard / Admin",
  "Sistemas web de aplicação",
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
    body: "shadcn/ui + Tailwind v4, tema dark/light, formulários, estado com Zustand e ferramentas prontas para Stripe e e-mail.",
  },
];

const docs = [
  {
    label: "Repositório no GitHub",
    description: "Código-fonte completo, pronto para clonar.",
    href: siteConfig.links.repo,
  },
  {
    label: "Demo",
    description: "Referência visual em https://bizu.bru.ia.br.",
    href: siteConfig.links.demo,
  },
];

export function ProjectsPage() {
  return (
    <>
      <PageHero
        eyebrow="Projeto em destaque"
        title="Bizu SaaS"
        description="Boilerplate full-stack para iniciar projetos web rápido, com base robusta, documentação viva e metodologia de AI Software Engineering."
        actions={
          <>
            <a href={siteConfig.links.repo} target="_blank" rel="noreferrer">
              <Button>Ver no GitHub</Button>
            </a>
            <a href={siteConfig.links.demo} target="_blank" rel="noreferrer">
              <Button variant="outline">Abrir demo</Button>
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
            O <strong className="text-foreground">Bizu SaaS</strong> é uma base
            moderna, robusta e reutilizável para acelerar a criação de produtos
            web de diferentes portes. Em vez de gastar semanas montando a
            fundação, você começa com SSR, API, banco, autenticação, UI e deploy
            já integrados — e foca no que diferencia o seu produto.
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
            O caminho natural do template é VPS + Docker + Portainer. A demo
            pública roda na Vercel e exigiu adaptações de arquitetura — use-a
            como referência visual.
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
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
                    rel="noreferrer"
                    className="text-sm font-medium text-primary transition hover:opacity-80"
                  >
                    Acessar →
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
