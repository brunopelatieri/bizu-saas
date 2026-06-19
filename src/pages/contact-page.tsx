import { ContactForm } from "@/components/contact/contact-form";
import { PageHero } from "@/components/layout/page-hero";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { siteConfig } from "@/lib/constants/navigation";

export function ContactPage() {
  return (
    <>
      <PageHero
        title="Contato"
        description="Formulário salvo via API Hono + Drizzle no seu Postgres."
      />
      <section className="px-6 py-12">
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <ContactForm />
          <Card>
            <CardHeader>
              <CardTitle>Configuração</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                Configure <code className="text-primary">DATABASE_URL</code> e
                suba a API com <code className="text-primary">npm run dev</code>.
              </p>
              <p>
                GitHub:{" "}
                <a
                  href={siteConfig.links.github}
                  className="text-primary hover:opacity-80"
                  target="_blank"
                  rel="noreferrer"
                >
                  {siteConfig.links.github}
                </a>
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
