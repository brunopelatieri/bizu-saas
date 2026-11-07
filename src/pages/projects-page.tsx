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
  "SaaS B2B",
  "SaaS B2C com portal do cliente",
  "Produto white label para agências",
  "Serviço interno que vira produto",
  "Marketplace de serviços",
  "Área de membros com assinatura",
];

const readyModules = [
  {
    title: "Multi-tenant com RLS",
    body: "Cada conta é um tenant isolado por tenant_id na aplicação e por Row Level Security no Postgres, com testes que provam o isolamento.",
  },
  {
    title: "Quatro níveis de login",
    body: "Proprietário, dono da conta, colaboradores com papéis configuráveis e clientes com portal próprio. Verificação de e-mail, 2FA e sessões em banco.",
  },
  {
    title: "Planos, trial e pagamentos",
    body: "Planos e assinaturas no seu Postgres; trial configurável pelo proprietário; Stripe e Asaas como módulos, com Pix, boleto e cartão.",
  },
  {
    title: "E-mail, jobs e auditoria",
    body: "E-mails transacionais com provedor substituível, fila de jobs no Postgres, log de auditoria e base de LGPD.",
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
];

export function ProjectsPage() {
  return (
    <>
      <PageHero
        eyebrow="Projeto em destaque"
        title="Bizu SaaS"
        description="Ponto de partida open source para SaaS: multi-tenant, quatro níveis de login, trial e pagamentos em módulos, sobre Postgres."
        actions={
          <a href={siteConfig.links.repo} target="_blank" rel="noreferrer noopener">
            <Button className="gap-2">
              <SocialIcon platform="github" />
              Ver no GitHub
            </Button>
          </a>
        }
      />

      <section className="px-6 py-16">
        <div className="mx-auto max-w-3xl space-y-5 text-muted-foreground">
          <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            O propósito
          </h2>
          <p>
            O <strong className="text-foreground">Bizu SaaS</strong> é uma base
            moderna e reutilizável para quem vai lançar um SaaS. Em vez de gastar
            meses montando a fundação, você começa com multi-tenant, níveis de
            login, verificação de e-mail, trial, cobrança, e-mail, jobs e deploy
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
            Qualquer produto que cobre por assinatura e atenda várias contas.
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
  |-- /api/*              Hono API -> Drizzle -> Postgres (RLS por tenant)
  |-- /, /precos, /blog   rotas públicas com SSR e SEO
  |-- /login, /cadastro   autenticação com verificação de e-mail
  |-- /app/**             owner e equipe do tenant (client-side)
  |-- /admin/**           proprietário da plataforma
  \`-- /portal/**          clientes e leads do tenant`}
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
            Repositório
          </h2>
          <p className="mb-8 max-w-2xl text-muted-foreground">
            Este repositório roda em <strong className="text-foreground">VPS + Docker + Node único</strong>{" "}
            (react-router-hono-server + Hono + SSR), sem fornecedor obrigatório.
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
