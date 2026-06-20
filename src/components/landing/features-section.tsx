const features = [
  {
    icon: "⚡",
    title: "SSR nas páginas públicas",
    body: "React Router v7 em Framework Mode com SSR e meta/Open Graph por rota. Landing, blog e páginas indexáveis prontas para SEO.",
  },
  {
    icon: "🔌",
    title: "API no mesmo processo",
    body: "Hono montado junto do SSR em um único processo Node. Sem proxy, sem segundo servidor — frontend e API compartilham origem.",
  },
  {
    icon: "🗄️",
    title: "Postgres próprio via Drizzle",
    body: "Seus dados no seu Postgres, com migrations versionadas e tipagem ponta a ponta. Schema como fonte de verdade.",
  },
  {
    icon: "🔐",
    title: "Auth + dashboard prontos",
    body: "Login com Supabase Auth e área autenticada client-side, sem expor dados sensíveis no HTML inicial.",
  },
  {
    icon: "🎨",
    title: "UI moderna out-of-the-box",
    body: "shadcn/ui + Tailwind v4, tema claro/escuro com anti-flash e componentes acessíveis prontos para compor telas.",
  },
  {
    icon: "🐳",
    title: "Deploy simples em VPS",
    body: "Dockerfile multi-stage para Ubuntu + Docker + Portainer. Um processo, healthcheck e build de produção enxuto.",
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
            Fundação completa, sem o trabalho repetitivo
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Os módulos que todo produto web precisa, já integrados e com boas
            práticas — para você começar pela regra de negócio.
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
