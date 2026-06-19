import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { navItems, siteConfig } from "@/lib/constants/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useAuth } from "@/providers/auth-provider";

export function SiteHeader() {
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <Link
          to="/"
          className="text-sm font-semibold tracking-wide text-primary transition hover:opacity-80"
        >
          {siteConfig.name}
        </Link>
        <div className="flex items-center gap-6">
          <nav aria-label="Principal" className="flex items-center gap-6">
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="text-sm text-muted-foreground transition hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          {isSupabaseConfigured() ? (
            user ? (
              <div className="flex items-center gap-3">
                <span className="hidden text-sm text-muted-foreground sm:inline">
                  {user.email}
                </span>
                <Button variant="ghost" size="sm" onClick={() => signOut()}>
                  Sair
                </Button>
              </div>
            ) : (
              <Link
                to="/login"
                className="text-sm font-medium text-primary transition hover:opacity-80"
              >
                Entrar
              </Link>
            )
          ) : null}
        </div>
      </div>
    </header>
  );
}
