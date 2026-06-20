const audiences = [
  {
    icon: "🏢",
    title: "Empresas",
    body: "Reduza o tempo de descoberta ao MVP. Uma base padronizada acelera squads, facilita onboarding e diminui dívida técnica desde o dia um.",
  },
  {
    icon: "📈",
    title: "Investidores",
    body: "Execução comprovada em tecnologias emergentes — IA, automação e arquitetura escalável — com visão de produto e capacidade de entrega.",
  },
  {
    icon: "🚀",
    title: "Empreendedores",
    body: "Transforme a ideia em produto sem travar na fundação. Comece pelo que diferencia o negócio e valide mais rápido.",
  },
  {
    icon: "🧠",
    title: "Devs AI Software Engineer",
    body: "Contexto vivo, TypeScript estrito e convenções claras. Os agentes de IA entendem o projeto e entregam dentro do padrão.",
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
            Feito para quem precisa entregar com velocidade e robustez
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Da validação de uma ideia ao produto em produção, com um fluxo que
            une engenharia consolidada e inteligência artificial.
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
