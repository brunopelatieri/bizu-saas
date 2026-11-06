const audiences = [
  {
    icon: "🚀",
    title: "Fundadores",
    body: "Lance o SaaS com trial, planos e cobrança por Pix e boleto desde o primeiro dia. Valide a ideia sem gastar o caixa na fundação.",
  },
  {
    icon: "🤝",
    title: "Agências e estúdios",
    body: "Entregue produtos white label para vários clientes a partir da mesma base, com áreas separadas para você, o cliente e o cliente do cliente.",
  },
  {
    icon: "🏢",
    title: "Empresas",
    body: "Transforme um serviço interno em produto com isolamento por tenant, papéis configuráveis e auditoria desde o início.",
  },
  {
    icon: "🧠",
    title: "Devs AI Software Engineer",
    body: "Contexto vivo, TypeScript estrito e specs antes do código. Os agentes de IA entendem o projeto e entregam dentro do padrão.",
  },
];

export function AudienceSection() {
  return (
    <section className="border-b border-border/50 bg-muted/30 py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-14 text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">
            Para quem é
          </p>
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Feito para quem precisa lançar um SaaS com velocidade e segurança
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Do primeiro cliente pagante ao suporte com personificação auditada,
            com um fluxo que une engenharia consolidada e inteligência artificial.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {audiences.map((a) => (
            <div
              key={a.title}
              className="flex flex-col rounded-xl border border-border/60 bg-card p-6 shadow-sm"
            >
              <span className="mb-4 block text-3xl">{a.icon}</span>
              <h3 className="mb-2 font-semibold text-foreground">{a.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {a.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
