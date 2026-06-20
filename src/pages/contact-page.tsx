import { ContactForm } from "@/components/contact/contact-form";
import { PageHero } from "@/components/layout/page-hero";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { siteConfig } from "@/lib/constants/navigation";

const channels = [
  { label: "WhatsApp", value: siteConfig.author.phone, href: siteConfig.links.whatsapp },
  { label: "E-mail", value: siteConfig.author.email, href: `mailto:${siteConfig.author.email}` },
  { label: "Site", value: "brunogoulart.com.br", href: siteConfig.links.site },
  { label: "LinkedIn", value: "in/bruno-pelatieri-goulart", href: siteConfig.links.linkedin },
  { label: "GitHub", value: "@brunopelatieri", href: siteConfig.links.github },
  { label: "Repositório", value: "brunopelatieri/bizu-saas", href: siteConfig.links.repo },
  { label: "YouTube", value: "@devgalactico", href: siteConfig.links.youtube },
  { label: "X", value: "@brunopelatieri", href: siteConfig.links.x },
  { label: "Instagram", value: "@brunopelatieri", href: siteConfig.links.instagram },
  { label: "TikTok", value: "@brunopelatieri", href: siteConfig.links.tiktok },
];

export function ContactPage() {
  return (
    <>
      <PageHero
        title="Contato"
        description="Vamos conversar sobre seu próximo projeto de SaaS, automação com IA ou arquitetura full-stack."
      />
      <section className="px-6 py-12">
        <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <ContactForm />
          <Card>
            <CardHeader>
              <CardTitle>Canais diretos</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm">
                {channels.map((channel) => (
                  <li
                    key={channel.label}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="text-muted-foreground">{channel.label}</span>
                    <a
                      href={channel.href}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate font-medium text-primary transition hover:opacity-80"
                    >
                      {channel.value}
                    </a>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
