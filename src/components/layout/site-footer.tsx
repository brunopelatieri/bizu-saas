import { siteConfig } from "@/lib/constants/navigation";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border bg-background">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          © {year} {siteConfig.name}. Todos os direitos reservados.
        </p>
        <div className="flex gap-4 text-sm">
          <a
            href={siteConfig.links.github}
            className="text-muted-foreground transition hover:text-primary"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <a
            href={siteConfig.links.linkedin}
            className="text-muted-foreground transition hover:text-primary"
            target="_blank"
            rel="noreferrer"
          >
            LinkedIn
          </a>
        </div>
      </div>
    </footer>
  );
}
