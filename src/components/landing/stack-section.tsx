const groups = [
  {
    label: "Frontend",
    items: ["React 19", "React Router v7", "TypeScript", "Vite 7"],
  },
  {
    label: "UI & Estilo",
    items: ["shadcn/ui", "Tailwind v4", "Tema dark/light", "Sonner"],
  },
  {
    label: "Backend & API",
    items: ["Hono", "Zod", "react-router-hono-server", "Nodemailer"],
  },
  {
    label: "Dados",
    items: ["Drizzle ORM", "Postgres", "Supabase Auth/Storage"],
  },
  {
    label: "Estado & Dados no cliente",
    items: ["Zustand", "TanStack Query", "React Hook Form", "TanStack Table"],
  },
  {
    label: "Pagamentos & Deploy",
    items: ["Stripe", "Docker", "VPS + Portainer"],
  },
];

export function StackSection() {
  return (
    <section id="stack" className="border-b border-border/50 bg-background py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-14 text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">
            Stack
          </p>
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Tecnologias modernas, escolhidas com critério
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Cada peça resolve um problema real e conversa bem com as outras —
            sem excesso de dependências nem mágica escondida.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <div
              key={group.label}
              className="rounded-xl border border-border/60 bg-card p-6 shadow-sm"
            >
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-primary">
                {group.label}
              </h3>
              <ul className="flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <li
                    key={item}
                    className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs text-muted-foreground"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
