import { NavLink } from "react-router";
import {
  appBottomNav,
  appMainNav,
  type AppNavItem,
} from "@/lib/constants/app-nav";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

type AppNavProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
  className?: string;
};

function NavItem({
  item,
  collapsed,
  onNavigate,
}: {
  item: AppNavItem;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.href}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_oklch(var(--primary)/0.15)]"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </NavLink>
  );
}

export function AppNav({
  collapsed = false,
  onNavigate,
  className,
}: AppNavProps) {
  const { permissions } = useAuth();
  const allowed = (item: AppNavItem) =>
    !item.permission || permissions.includes(item.permission);

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {appMainNav.filter(allowed).map((item) => (
          <NavItem
            key={item.href}
            item={item}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="space-y-1 border-t border-border p-3">
        {appBottomNav.filter(allowed).map((item) => (
          <NavItem
            key={item.href}
            item={item}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}
