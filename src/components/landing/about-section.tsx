const painPoints = [
  {
    icon: "🧱",
    title: "Semanas montando a base",
    body: "Autenticação, SSR, API, banco, deploy, tema, formulários. Antes de escrever a primeira regra de negócio, já se foi um mês.",
  },
  {
    icon: "🧭",
    title: "Decisões de arquitetura sem padrão",
    body: "Cada projeto reinventa estrutura de pastas, camadas e convenções. O resultado é dívida técnica desde o início.",
  },
  {
    icon: "🤖",
    title: "IA sem contexto produz código fora do padrão",
    body: "Sem um mapa técnico claro, agentes de IA chutam decisões e geram retrabalho em vez de acelerar a entrega.",
  },
];

export function AboutSection() {
  return (
    <section className="border-b border-border/50 bg-background py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-20">
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">
            O problema
          </p>
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Todo projeto novo começa do zero — de novo.
          </h2>
          <p className="mb-12 max-w-2xl text-muted-foreground">
            A parte difícil raramente é a ideia. É a fundação técnica repetitiva
            que separa você de validar o produto e gerar valor.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {painPoints.map((p) => (
              <div
                key={p.title}
                className="rounded-xl border border-border/60 bg-card p-6 shadow-sm"
              >
                <span className="mb-4 block text-3xl">{p.icon}</span>
                <h3 className="mb-2 font-semibold text-foreground">
                  {p.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-10 text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">
            A solução
          </p>
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Uma base pronta, pensada para humanos e IA.
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            O <strong className="text-foreground">Bizu SaaS</strong> entrega
            arquitetura moderna, módulos essenciais e documentação viva. Você
            parte de uma fundação confiável e foca no que diferencia o seu
            produto — com agentes de IA que entendem o projeto antes de mexer.
          </p>
        </div>
      </div>
    </section>
  );
}
