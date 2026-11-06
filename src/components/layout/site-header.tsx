import { useState } from "react";
import { Link } from "react-router";
import { Menu } from "lucide-react";
import { SiteLogo } from "@/components/layout/site-logo";
import { SiteNavLinks } from "@/components/layout/site-nav-links";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

type SiteHeaderAuthProps = {
  layout: "inline" | "stack";
  onNavigate?: () => void;
  className?: string;
};

function SiteHeaderAuth({
  layout,
  onNavigate,
  className,
}: SiteHeaderAuthProps) {
  const { user, available, signOut } = useAuth();

  function handleSignOut() {
    onNavigate?.();
    void signOut();
  }

  if (user) {
    return (
      <div
        className={cn(
          layout === "stack"
            ? "flex flex-col gap-2 border-t border-border p-4"
            : "flex shrink-0 items-center gap-3",
          className,
        )}
      >
        <Link to="/dashboard" onClick={onNavigate} className={layout === "stack" ? "w-full" : undefined}>
          <Button size="sm" className={layout === "stack" ? "w-full" : undefined}>
            Dashboard
          </Button>
        </Link>
        {available ? (
          <Button
            variant="ghost"
            size="sm"
            className={layout === "stack" ? "w-full" : undefined}
            onClick={handleSignOut}
          >
            Sair
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        layout === "stack" ? "border-t border-border p-4" : "shrink-0",
        className,
      )}
    >
      <Link to="/login" onClick={onNavigate} className={layout === "stack" ? "block w-full" : undefined}>
        <Button size="sm" className={layout === "stack" ? "w-full" : undefined}>
          Entrar
        </Button>
      </Link>
    </div>
  );
}

export function SiteHeader() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  function closeMobileNav() {
    setMobileNavOpen(false);
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 min-w-0 max-w-5xl items-center justify-between gap-3 overflow-hidden px-4 sm:px-6">
          <SiteLogo size="md" className="min-w-0 shrink-0" />

          <div className="hidden min-w-0 items-center gap-4 overflow-hidden md:flex md:gap-6">
            <SiteNavLinks className="min-w-0 overflow-hidden" />
            <ThemeToggle className="shrink-0" />
            <SiteHeaderAuth layout="inline" />
          </div>

          <div className="flex shrink-0 items-center gap-2 md:hidden">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Abrir menu"
              className="size-8 shrink-0"
            >
              <Menu className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="flex w-[min(100vw-2rem,18rem)] flex-col p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu do site</SheetTitle>
            <SheetDescription>Navegação principal</SheetDescription>
          </SheetHeader>

          <div className="shrink-0 border-b border-border px-4 py-4">
            <SiteLogo size="sm" asLink={false} />
          </div>

          <SiteNavLinks variant="menu" onNavigate={closeMobileNav} className="min-h-0 flex-1" />
          <SiteHeaderAuth layout="stack" onNavigate={closeMobileNav} className="mt-auto shrink-0" />
        </SheetContent>
      </Sheet>
    </>
  );
}
