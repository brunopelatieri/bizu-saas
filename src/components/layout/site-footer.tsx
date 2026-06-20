import { Link } from "react-router";
import { navItems, siteConfig, socialLinks } from "@/lib/constants/navigation";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border bg-background">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid gap-8 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <p className="text-base font-semibold text-foreground">
              {siteConfig.name}
            </p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
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
                    className="text-sm text-muted-foreground transition hover:text-primary"
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
            <ul className="grid grid-cols-2 gap-2">
              {socialLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-muted-foreground transition hover:text-primary"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            © {year} {siteConfig.author.name}. Todos os direitos reservados.
          </p>
          <p className="text-xs text-muted-foreground">
            {siteConfig.author.role}
          </p>
        </div>
      </div>
    </footer>
  );
}
