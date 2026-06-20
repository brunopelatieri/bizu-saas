import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";

const posts = [
  {
    tag: "Produtividade",
    title: "Como reduzir 80% das mensagens de status dos seus clientes",
    excerpt:
      "Comunicação proativa não é um diferencial — é uma necessidade. Veja como um portal centralizado muda a dinâmica dos seus projetos.",
    readTime: "5 min",
    date: "12 Jun 2026",
    slug: "/blog",
  },
  {
    tag: "Negócios",
    title: "Precificação para freelancers: o guia definitivo de 2026",
    excerpt:
      "Saber cobrar pelo valor real do seu trabalho começa por entender sua proposta de valor. Veja como estruturar seus planos.",
    readTime: "8 min",
    date: "3 Jun 2026",
    slug: "/blog",
  },
  {
    tag: "Ferramentas",
    title: "Stack ideal para portais de clientes em 2026",
    excerpt:
      "React, shadcn/ui, Supabase e Drizzle — como essa combinação entrega uma experiência de usuário premium sem complexidade desnecessária.",
    readTime: "6 min",
    date: "28 Mai 2026",
    slug: "/blog",
  },
];

export function BlogSection() {
  return (
    <section className="border-b border-border/50 bg-muted/30 py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-14 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary">
              Blog
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Insights para profissionais digitais
            </h2>
          </div>
          <Link
            to="/blog"
            className="shrink-0 text-sm font-medium text-primary transition hover:opacity-80"
          >
            Ver todos os posts →
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {posts.map((post) => (
            <Link
              key={post.title}
              to={post.slug}
              className="group flex flex-col rounded-xl border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md"
            >
              {/* Placeholder image */}
              <div className="h-44 rounded-t-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
              <div className="flex flex-1 flex-col p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {post.tag}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {post.readTime} de leitura
                  </span>
                </div>
                <h3 className="mb-2 flex-1 text-base font-semibold leading-snug text-foreground transition group-hover:text-primary">
                  {post.title}
                </h3>
                <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                  {post.excerpt}
                </p>
                <span className="text-xs text-muted-foreground">{post.date}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
