import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { PageHero } from "@/components/layout/page-hero";
import { getAllPosts } from "@/lib/content/posts";
import type { Route } from "./+types/blog";

export function loader() {
  // O loader roda no mesmo processo Node do SSR. Hoje lê de um módulo estático;
  // quando o blog migrar para o banco, troque por uma query Drizzle aqui
  // (ex.: getDb().select().from(posts)) — sem volta de rede via HTTP.
  return { posts: getAllPosts() };
}

export const meta: Route.MetaFunction = () => [
  { title: "Blog — Bizu SaaS" },
  {
    name: "description",
    content:
      "Insights para profissionais digitais: produtividade, negócios e ferramentas.",
  },
  { property: "og:title", content: "Blog — Bizu SaaS" },
  { property: "og:type", content: "website" },
];

export default function Blog({ loaderData }: Route.ComponentProps) {
  const { posts } = loaderData;

  return (
    <>
      <PageHero
        eyebrow="Blog"
        title="Insights para profissionais digitais"
        description="Conteúdo sobre produtividade, gestão de clientes e a stack por trás de produtos modernos."
      />
      <section className="px-6 py-12">
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
          {posts.map((post) => (
            <Link
              key={post.slug}
              to={`/blog/${post.slug}`}
              className="group flex flex-col rounded-xl border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md"
            >
              {post.cover ? (
                <img
                  src={post.cover}
                  alt=""
                  className="h-44 w-full rounded-t-xl object-cover"
                />
              ) : (
                <div className="h-44 rounded-t-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
              )}
              <div className="flex flex-1 flex-col p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {post.tag}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {post.readTime} de leitura
                  </span>
                </div>
                <h2 className="mb-2 flex-1 text-base font-semibold leading-snug text-foreground transition group-hover:text-primary">
                  {post.title}
                </h2>
                <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                  {post.excerpt}
                </p>
                <time
                  dateTime={post.publishedAt}
                  className="text-xs text-muted-foreground"
                >
                  {post.date}
                </time>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
