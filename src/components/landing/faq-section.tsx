import { useState } from "react";
import { siteConfig } from "@/lib/constants/navigation";

const faqs = [
  {
    question: "O Bizu SaaS é open source?",
    answer:
      "Sim. O código está no GitHub e pode ser clonado para iniciar seus projetos. A ideia é ser um ponto de partida sólido, não uma caixa-preta.",
  },
  {
    question: "Que tipo de projeto posso criar com ele?",
    answer:
      "SaaS, portal de clientes, site institucional, landing page, blog, dashboard/admin e sistemas web de aplicação. A base é genérica o suficiente para se adaptar ao seu produto.",
  },
  {
    question: "O que é a metodologia de AI Software Engineering aqui?",
    answer:
      "Especificar antes de implementar, manter contexto técnico vivo (AI_CONTEXT e spec) e fazer mudanças pequenas e documentadas. Assim humanos e agentes de IA decidem com o mesmo mapa técnico.",
  },
  {
    question: "Por que Supabase e Postgres juntos?",
    answer:
      "O Supabase é auxiliar — Auth, Storage, Functions e Realtime. Os dados da aplicação ficam no seu próprio Postgres via Drizzle, mantendo controle e portabilidade.",
  },
  {
    question: "Onde faço o deploy?",
    answer:
      "O caminho natural do template é VPS + Docker + Portainer, com um único processo Node. A demo pública roda na Vercel e exigiu adaptações de arquitetura — use-a como referência visual, não como espelho do repositório.",
  },
  {
    question: "Preciso saber IA para usar?",
    answer:
      "Não. O projeto funciona como um boilerplate tradicional. A metodologia de IA é um acelerador opcional, mas o contexto documentado ajuda qualquer pessoa a se situar rápido.",
  },
];

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border/60 last:border-0">
      <button
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
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
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
