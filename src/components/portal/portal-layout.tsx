import { LogOut, Repeat } from "lucide-react";
import { Link, Navigate, NavLink, Outlet } from "react-router";
import { AuthSpinner } from "@/components/auth/auth-shell";
import { SiteLogo } from "@/components/layout/site-logo";
import { PortalNoAccess } from "@/components/portal/portal-no-access";
import { Button } from "@/components/ui/button";
import { portalNav } from "@/lib/constants/portal-nav";
import { cn } from "@/lib/utils";
import { usePortalAuth } from "@/providers/portal-auth-provider";

/**
 * Casca de `/portal/**`, sem nada de `/app`. O gate é só o caminho da interface: quem barra
 * os dados é `requirePortalAuth`, em toda rota de `/api/portal/*`.
 */
export function PortalLayout() {
  const { user, tenants, active, loading, accountError, refresh, signOut } =
    usePortalAuth();

  if (loading) return <AuthSpinner />;

  if (accountError) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-2 bg-background text-sm">
        <p className="text-destructive">{accountError.message}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="font-medium text-primary hover:underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!user) return <Navigate to="/portal/login" replace />;

  const available = tenants.filter((tenant) => tenant.available);

  if (!active && available.length > 1) {
    return <Navigate to="/portal/escolher" replace />;
  }

  if (!active) return <PortalNoAccess />;

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <SiteLogo size="sm" asLink={false} />
            <span className="truncate text-sm font-medium text-foreground">
              {active.name}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {available.length > 1 ? (
              <Link to="/portal/escolher">
                <Button variant="ghost" size="sm">
                  <Repeat className="size-4" />
                  <span className="hidden sm:inline">Trocar</span>
                </Button>
              </Link>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 pb-2">
          {portalNav.map(({ href, label, icon: Icon, end }) => (
            <NavLink
              key={href}
              to={href}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}

export default PortalLayout;
