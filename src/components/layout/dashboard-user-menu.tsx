import { Link } from "react-router";
import { ExternalLink, LogOut, Settings } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AuthUser } from "@/lib/auth/types";
import {
  getUserDisplayName,
  getUserInitials,
} from "@/lib/auth/user-display";
import { cn } from "@/lib/utils";

type DashboardUserMenuProps = {
  user: AuthUser | null;
  collapsed?: boolean;
  onSignOut: () => void;
  className?: string;
};

export function DashboardUserMenu({
  user,
  collapsed = false,
  onSignOut,
  className,
}: DashboardUserMenuProps) {
  const displayName = getUserDisplayName(user);
  const initials = getUserInitials(user);
  const email = user?.email ?? "";

  const triggerButton = (
    <Button
      variant="ghost"
      className={cn(
        "h-auto w-full justify-start gap-3 px-2 py-2 hover:bg-muted",
        collapsed && "size-10 justify-center px-0",
        className,
      )}
    >
      <Avatar size={collapsed ? "sm" : "default"}>
        <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
          {initials}
        </AvatarFallback>
      </Avatar>
      {!collapsed ? (
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium text-foreground">
            {displayName}
          </p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
      ) : null}
    </Button>
  );

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger render={triggerButton} />
      <DropdownMenuContent align="end" side="top" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{displayName}</span>
            <span className="text-xs text-muted-foreground">{email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/app/configuracoes" />}>
          <Settings />
          Configurações
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link to="/" />}>
          <ExternalLink />
          Site público
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onSignOut}>
          <LogOut />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (!collapsed) {
    return menu;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={menu} />
      <TooltipContent side="right">{displayName}</TooltipContent>
    </Tooltip>
  );
}
