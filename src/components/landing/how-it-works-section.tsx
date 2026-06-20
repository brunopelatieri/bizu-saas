const steps = [
  {
    number: "01",
    verb: "Especifique",
    title: "Defina antes de implementar",
    body: "Escreva a especificação da feature primeiro. Objetivos claros e critérios de sucesso guiam tanto o time quanto os agentes de IA.",
  },
  {
    number: "02",
    verb: "Contexto vivo",
    title: "Mantenha o mapa técnico atualizado",
    body: "AI_CONTEXT e a spec técnica descrevem arquitetura, rotas e decisões. A IA lê o contexto e propõe mudanças dentro do padrão do projeto.",
  },
  {
    number: "03",
    verb: "Implemente",
    title: "Entregue com humanos e agentes",
    body: "Mudanças pequenas, verificáveis e documentadas na mesma sessão. Você revisa, a IA executa — e o projeto continua legível e rastreável.",
  },
];

export function HowItWorksSection() {
  return (
    <section
      id="metodologia"
      className="border-b border-border/50 bg-background py-24"
    >
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-14 text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">
            Metodologia
          </p>
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            AI Software Engineering, na prática
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Um fluxo onde especificação, contexto e execução andam juntos — para
            entregar rápido sem perder controle técnico.
          </p>
        </div>

        <div className="relative grid gap-8 md:grid-cols-3">
          <div
            aria-hidden="true"
            className="absolute left-0 right-0 top-10 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block"
          />

          {steps.map((step) => (
            <div
              key={step.number}
              className="relative flex flex-col items-center text-center"
            >
              <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-primary/30 bg-primary/10 shadow-sm">
                <span className="text-xl font-bold text-primary">
                  {step.number}
                </span>
              </div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary">
                {step.verb}
              </p>
              <h3 className="mb-3 text-lg font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
