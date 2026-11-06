import { Link } from "react-router";
import { SiteLogo } from "@/components/layout/site-logo";
import { SocialLink } from "@/components/layout/social-link";
import { navItems, siteConfig, socialLinks } from "@/lib/constants/navigation";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border bg-background">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <SiteLogo size="md" asLink={false} />
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              {siteConfig.description}
            </p>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold text-foreground">
              Navegação
            </p>
            <ul className="space-y-2">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    className="text-sm text-muted-foreground transition-colors duration-200 hover:text-primary"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold text-foreground">
              Redes & contato
            </p>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {socialLinks.map((link) => (
                <li key={link.label}>
                  <SocialLink
                    href={link.href}
                    label={link.label}
                    platform={link.platform}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            © {year} {siteConfig.author.name}. Todos os direitos reservados.
          </p>
          <nav aria-label="Legal" className="flex gap-4 text-xs">
            <Link
              to="/legal/termos"
              className="text-muted-foreground transition-colors hover:text-primary"
            >
              Termos de uso
            </Link>
            <Link
              to="/legal/privacidade"
              className="text-muted-foreground transition-colors hover:text-primary"
            >
              Privacidade
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
