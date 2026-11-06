const features = [
  {
    icon: "🏢",
    title: "Multi-tenant de verdade",
    body: "Cada conta é um tenant isolado por tenant_id na aplicação e por Row Level Security no Postgres. Uma query esquecida vira resultado vazio, não vazamento.",
  },
  {
    icon: "🔐",
    title: "Quatro níveis de login",
    body: "Proprietário da plataforma, dono da conta, colaboradores com papéis configuráveis e clientes com portal próprio. Verificação de e-mail em todos.",
  },
  {
    icon: "💳",
    title: "Pagamentos em módulos",
    body: "Trial configurável, planos e assinaturas no seu banco. Stripe e Asaas prontos; Mercado Pago, Pagar.me e PagBank seguem a mesma interface.",
  },
  {
    icon: "⚡",
    title: "SSR nas páginas públicas",
    body: "React Router v7 em Framework Mode com SSR e meta/Open Graph por rota. Landing, preços e blog indexáveis desde o primeiro deploy.",
  },
  {
    icon: "📬",
    title: "E-mail e jobs sem serviço extra",
    body: "E-mails transacionais com provedor substituível e fila de jobs no próprio Postgres. Mailpit captura tudo no desenvolvimento.",
  },
  {
    icon: "🐳",
    title: "Portável, em qualquer VPS",
    body: "Um processo Node, um Postgres e Docker. Sem fornecedor obrigatório de auth, e-mail, arquivos ou pagamento.",
  },
];

export function FeaturesSection() {
  return (
    <section
      id="funcionalidades"
      className="border-b border-border/50 bg-muted/30 py-24"
    >
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-14 text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">
            O que vem pronto
          </p>
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Fundação de SaaS completa, sem o trabalho repetitivo
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            As peças que todo SaaS precisa, já integradas, testadas e com as
            fronteiras de segurança aplicadas no servidor.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-xl border border-border/60 bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <span className="mb-4 block text-3xl">{f.icon}</span>
              <h3 className="mb-2 font-semibold text-foreground">{f.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
