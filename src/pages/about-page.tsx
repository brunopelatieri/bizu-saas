import { PageHero } from "@/components/layout/page-hero";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/constants/navigation";

const focusAreas = [
  {
    title: "Backend & APIs",
    body: "Node.js, Python e PHP (Laravel, Zend, CodeIgniter). APIs de alta performance e migração de sistemas legados para stacks modernas.",
  },
  {
    title: "Frontend",
    body: "React e Next.js para interfaces modernas, responsivas e de alto desempenho.",
  },
  {
    title: "IA, LLMs & Agentes",
    body: "Claude, GPT, Gemini, DeepSeek e Grok. Agentes autônomos com LangChain/LangGraph, pipelines RAG e servidores MCP.",
  },
  {
    title: "Automação Inteligente",
    body: "n8n, Kestra e ActivePieces conectando IA a fluxos de negócio reais, com deploy em Docker.",
  },
  {
    title: "Blockchain & Web3",
    body: "DApps e smart contracts em Solidity + React + Web3.js na Ethereum.",
  },
  {
    title: "DevOps & Infra",
    body: "Docker, VPS e automação de infraestrutura — do deploy instantâneo ao proxy reverso.",
  },
];

const audiences = [
  {
    title: "Para empreendedores & startups",
    body: "Transformo ideias em produtos digitais completos — do MVP ao sistema escalável, integrando IA para automatizar processos e acelerar o crescimento.",
  },
  {
    title: "Para investidores",
    body: "Experiência técnica sólida em tecnologias emergentes (IA, Web3, Automação) com visão de produto e execução comprovada em 18+ anos de mercado.",
  },
  {
    title: "Para recrutadores",
    body: "Full Stack com profundidade rara — backend, frontend, blockchain, IA e DevOps em um único perfil, com projetos open source verificáveis.",
  },
  {
    title: "Para pesquisadores & tech",
    body: "Contribuições em Engenharia de Prompt (XML estruturado, Agent Skills, CoT), servidores MCP, RAG e orquestração com LangGraph.",
  },
];

export function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="Sobre"
        title="Bruno Pelatieri Goulart"
        description="Desenvolvedor Full Stack desde 2006. Unindo a robustez de tecnologias consolidadas com a inteligência das ferramentas mais modernas de IA."
        actions={
          <>
            <a href={siteConfig.links.linkedin} target="_blank" rel="noreferrer">
              <Button>LinkedIn</Button>
            </a>
            <a href={siteConfig.links.github} target="_blank" rel="noreferrer">
              <Button variant="outline">GitHub</Button>
            </a>
            <a href={siteConfig.links.site} target="_blank" rel="noreferrer">
              <Button variant="outline">Site pessoal</Button>
            </a>
          </>
        }
      />

      <section className="px-6 py-16">
        <div className="mx-auto max-w-3xl space-y-5 text-muted-foreground">
          <p>
            Iniciei minha jornada com PHP e frameworks clássicos como
            CodeIgniter, Zend Framework e Laravel — construindo uma base sólida
            em desenvolvimento web e arquitetura de sistemas. Ao longo dos anos,
            expandi para tecnologias modernas de alto impacto: do backend ao
            frontend, automação inteligente, engenharia de IA e blockchain.
          </p>
          <p>
            Minha paixão está em criar soluções{" "}
            <strong className="text-foreground">
              escaláveis, seguras e inovadoras
            </strong>
            . Minha experiência permite migrar sistemas legados para tecnologias
            modernas, integrar LLMs em produtos existentes e construir do zero
            arquiteturas orientadas a agentes autônomos.
          </p>
          <p>
            <strong className="text-foreground">Atualmente</strong>, meu foco
            está em DApps, APIs de alta performance, automação inteligente com
            n8n e LangChain, construção de agentes de IA com LLMs (Claude, GPT,
            Gemini, DeepSeek, Grok) e desenvolvimento de servidores MCP para
            conectar IA a fluxos de negócio reais.
          </p>
        </div>
      </section>

      <section className="border-t border-border/50 bg-muted/30 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Áreas de atuação
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {focusAreas.map((area) => (
              <div
                key={area.title}
                className="rounded-xl border border-border/60 bg-card p-6 shadow-sm"
              >
                <h3 className="mb-2 font-semibold text-foreground">
                  {area.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {area.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            O que posso oferecer
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {audiences.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-border/60 bg-card p-6 shadow-sm"
              >
                <h3 className="mb-2 font-semibold text-primary">
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/50 bg-muted/30 px-6 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <blockquote className="text-lg italic text-foreground md:text-xl">
            &ldquo;Unindo 18 anos de engenharia com a inteligência do futuro —
            construindo hoje o que o mercado precisará amanhã.&rdquo;
          </blockquote>
          <p className="mt-4 text-sm text-muted-foreground">
            {siteConfig.author.role}
          </p>
        </div>
      </section>
    </>
  );
}
