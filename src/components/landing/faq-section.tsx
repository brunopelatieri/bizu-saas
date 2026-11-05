import { useState } from "react";
import { SocialIcon } from "@/components/icons/social-icons";
import { siteConfig } from "@/lib/constants/navigation";

const faqs = [
  {
    question: "O Bizu Starter é open source?",
    answer:
      "Sim. O código está no GitHub e pode ser clonado para iniciar seus projetos. A ideia é ser um ponto de partida sólido, não uma caixa-preta.",
  },
  {
    question: "Que tipo de projeto posso criar com ele?",
    answer:
      "Portal de clientes, área de membros, site institucional com painel, blog com área administrativa e sistemas internos: projetos pequenos e médios que precisam de login e dashboard.",
  },
  {
    question: "Serve para criar um SaaS?",
    answer:
      "Não é o foco. Ele não traz multi-tenant, planos nem cobrança recorrente. A proposta é ser simples para projetos com um único cliente ou organização; um SaaS exigiria essas camadas a mais.",
  },
  {
    question: "Preciso usar o Postgres do Supabase?",
    answer:
      "Não. O Supabase Auth cuida do login e o Drizzle acessa qualquer Postgres: local, na sua VPS ou o do próprio Supabase. Para trocar de banco, basta mudar a DATABASE_URL.",
  },
  {
    question: "O que é a metodologia de AI Software Engineering aqui?",
    answer:
      "Especificar antes de implementar (PRD e SPEC), manter contexto técnico vivo e enxuto em docs/context e fazer mudanças pequenas e documentadas. Assim humanos e agentes de IA decidem com o mesmo mapa técnico.",
  },
  {
    question: "Por que Supabase e Postgres juntos?",
    answer:
      "O Supabase é auxiliar — Auth, Storage, Functions e Realtime. Os dados da aplicação ficam no seu próprio Postgres via Drizzle, mantendo controle e portabilidade.",
  },
  {
    question: "Onde faço o deploy?",
    answer:
      "Este repositório é focado em VPS + Docker + Node único (react-router-hono-server + Hono + SSR). A demo em bizu.bru.ia.br roda na Vercel; a arquitetura otimizada para esse deploy está em github.com/brunopelatieri/bizu-saas-vercel. Use a demo como referência visual, não como espelho 1:1 deste código.",
  },
  {
    question: "Preciso saber IA para usar?",
    answer:
      "Não. O projeto funciona como um starter tradicional. A metodologia de IA é um acelerador opcional, mas o contexto documentado ajuda qualquer pessoa a se situar rápido.",
  },
];

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border/60 last:border-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
        aria-expanded={open}
      >
        <span className="font-medium text-foreground">{question}</span>
        <span
          aria-hidden="true"
          className={`shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-45" : ""}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5"
          >
            <title>Alternar resposta</title>
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="pb-5 text-sm leading-relaxed text-muted-foreground">
          {answer}
        </div>
      )}
    </div>
  );
}

export function FaqSection() {
  return (
    <section className="border-b border-border/50 bg-background py-24">
      <div className="mx-auto max-w-3xl px-6">
        <div className="mb-14 text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">
            FAQ
          </p>
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Perguntas frequentes
          </h2>
          <p className="text-muted-foreground">
            Não encontrou o que precisava?{" "}
            <a
              href={siteConfig.links.whatsapp}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-primary underline-offset-4 transition-colors duration-200 hover:text-primary/80 hover:underline"
            >
              <SocialIcon platform="whatsapp" className="size-3.5" />
              Fale com a gente
            </a>
            .
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-card px-6 shadow-sm">
          {faqs.map((faq) => (
            <FaqItem key={faq.question} {...faq} />
          ))}
        </div>
      </div>
    </section>
  );
}
