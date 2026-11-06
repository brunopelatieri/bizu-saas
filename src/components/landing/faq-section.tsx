import { useState } from "react";
import { SocialIcon } from "@/components/icons/social-icons";
import { siteConfig } from "@/lib/constants/navigation";

const faqs = [
  {
    question: "O Bizu SaaS é open source?",
    answer:
      "Sim. O código está no GitHub sob licença MIT e pode ser clonado para iniciar o seu SaaS. A ideia é ser um ponto de partida sólido, não uma caixa-preta.",
  },
  {
    question: "Quais níveis de acesso vêm prontos?",
    answer:
      "Quatro: o proprietário da plataforma, o dono de cada conta (tenant), os colaboradores dele com papéis configuráveis e os clientes ou leads dele, com um portal próprio. Todos passam por verificação de e-mail.",
  },
  {
    question: "Como funciona a cobrança?",
    answer:
      "Planos, trial e assinaturas ficam no seu Postgres. Os provedores de pagamento são módulos: Stripe e Asaas vêm prontos, e Mercado Pago, Pagar.me e PagBank seguem a mesma interface. Pix, boleto e cartão conforme o provedor.",
  },
  {
    question: "Preciso de Redis, Supabase ou outro serviço?",
    answer:
      "Não. Autenticação, sessões, fila de jobs e rate limit rodam sobre o Postgres. E-mail, arquivos e pagamento são provedores substituíveis configurados por variáveis de ambiente.",
  },
  {
    question: "O que é a metodologia de AI Software Engineering aqui?",
    answer:
      "Especificar antes de implementar (PRD e SPEC), manter contexto técnico vivo e enxuto em docs/context e fazer mudanças pequenas e documentadas. Assim humanos e agentes de IA decidem com o mesmo mapa técnico.",
  },
  {
    question: "Onde faço o deploy?",
    answer:
      "Em qualquer VPS com Docker e um Postgres: um processo Node serve o site, a API e as áreas autenticadas. O README leva do clone ao sistema rodando, incluindo migrations, seed e e-mail local com Mailpit.",
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
