const painPoints = [
  {
    icon: "🧱",
    title: "Meses montando a base do SaaS",
    body: "Login, verificação de e-mail, tenants, papéis, trial, cobrança e webhooks. Antes da primeira regra de negócio, já se foi um trimestre.",
  },
  {
    icon: "🔐",
    title: "Fronteiras de segurança frágeis",
    body: "Um filtro esquecido vaza dados entre clientes. Um link de verificação consumido por scanner trava o cadastro. Cada peça tem armadilha conhecida.",
  },
  {
    icon: "🇧🇷",
    title: "Starters feitos para cartão e Stripe",
    body: "Pix, boleto e os provedores brasileiros ficam de fora, ou prendem o projeto a um fornecedor de autenticação ou de banco.",
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
            Todo SaaS novo começa do zero — de novo.
          </h2>
          <p className="mb-12 max-w-2xl text-muted-foreground">
            A parte difícil raramente é a ideia. É a fundação repetitiva e
            sensível que separa você de validar o produto e cobrar por ele.
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
            Uma base de SaaS pronta, pensada para humanos e IA.
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            O <strong className="text-foreground">Bizu SaaS</strong> entrega as
            áreas do proprietário, do dono da conta e do cliente já integradas,
            com documentação viva. Você clona, configura e foca no que diferencia
            o seu produto — com agentes de IA que entendem o código antes de mexer.
          </p>
        </div>
      </div>
    </section>
  );
}
