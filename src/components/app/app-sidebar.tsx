import { Link } from "react-router";
import { SiteLogo } from "@/components/layout/site-logo";
import { AppNav } from "@/components/app/app-nav";
import { AppUserMenu } from "@/components/app/app-user-menu";
import { TenantSwitcher } from "@/components/app/tenant-switcher";
import { siteConfig } from "@/lib/constants/navigation";
import { useAuth } from "@/providers/auth-provider";
import { cn } from "@/lib/utils";

type SidebarProps = {
  collapsed?: boolean;
  className?: string;
};

export function AppSidebar({ collapsed = false, className }: SidebarProps) {
  const { user, signOut } = useAuth();

  return (
    <aside
      className={cn(
        "hidden h-full flex-col border-r border-border bg-card/50 backdrop-blur-sm transition-[width] duration-200 lg:flex",
        collapsed ? "w-[4.5rem]" : "w-60",
        className,
      )}
    >
      <div className="flex h-16 items-center border-b border-border px-4">
        {collapsed ? (
          <img
            src={siteConfig.logo}
            alt={siteConfig.name}
            className="mx-auto h-7 w-auto object-contain"
          />
        ) : (
          <SiteLogo size="sm" asLink={false} />
        )}
      </div>

      <div className="border-b border-border p-3">
        <TenantSwitcher collapsed={collapsed} />
      </div>

      <AppNav collapsed={collapsed} />

      <div className="border-t border-border p-3">
        <AppUserMenu
          user={user}
          collapsed={collapsed}
          onSignOut={() => void signOut()}
        />
      </div>
    </aside>
  );
}

export function AppMobileNavHeader() {
  return (
    <div className="border-b border-border px-4 py-4">
      <SiteLogo size="sm" asLink={false} />
    </div>
  );
}

export function AppMobileNavFooter({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const { user, signOut } = useAuth();

  return (
    <div className="border-t border-border p-4">
      <AppUserMenu
        user={user}
        collapsed={false}
        onSignOut={() => {
          onNavigate?.();
          void signOut();
        }}
      />
      <Link
        to="/"
        onClick={onNavigate}
        className="mt-3 block text-center text-xs text-muted-foreground transition hover:text-foreground"
      >
        ← Site público
      </Link>
    </div>
  );
}
