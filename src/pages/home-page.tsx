import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHero } from "@/components/layout/page-hero";

export function HomePage() {
  return (
    <>
      <PageHero
        eyebrow="Portal pessoal"
        title="Construa sua presença online com clareza e propósito."
        description="Vite + React + shadcn/ui no frontend. Drizzle no seu Postgres. Supabase para Auth e Storage."
        actions={
          <>
            <Link to="/projetos">
              <Button>Ver projetos</Button>
            </Link>
            <Link to="/contato">
              <Button variant="outline">Entrar em contato</Button>
            </Link>
          </>
        }
      />
      <section className="px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold">O que já vem pronto</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Estrutura mínima para evoluir com SpecifyX, Drizzle e Supabase
              auxiliar.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Vite + shadcn/ui",
                body: "Frontend rápido com componentes acessíveis e tema dark.",
              },
              {
                title: "Postgres + Drizzle",
                body: "Seu banco com schema tipado e API Hono.",
              },
              {
                title: "Supabase auxiliar",
                body: "Auth, Storage, Edge Functions e Realtime broadcast.",
              },
              {
                title: "Templates de página",
                body: "Landing, sobre, projetos, contato e login.",
              },
            ].map((item) => (
              <Card key={item.title}>
                <CardHeader>
                  <CardTitle>{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{item.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
