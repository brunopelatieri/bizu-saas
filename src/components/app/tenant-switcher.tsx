import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

/** Seletor do tenant ativo. Na URL nada identifica o tenant: ele vive na sessão. */
export function TenantSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { tenant, tenants, switchTenant } = useAuth();

  async function select(tenantId: string) {
    if (tenantId === tenant?.id) return;

    try {
      await switchTenant(tenantId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível trocar.",
      );
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            aria-label="Trocar de organização"
            className={cn(
              "h-auto w-full justify-between gap-2 px-2 py-2",
              collapsed && "size-10 justify-center px-0",
            )}
          >
            <Building2 className="size-4 shrink-0 text-muted-foreground" />
            {collapsed ? null : (
              <>
                <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
                  {tenant?.name ?? "Sem organização"}
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
              </>
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Organizações</DropdownMenuLabel>
          {tenants.map(({ id, name }) => (
            <DropdownMenuItem key={id} onClick={() => void select(id)}>
              <span className="min-w-0 flex-1 truncate">{name}</span>
              {id === tenant?.id ? <Check className="size-4 shrink-0" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/app/onboarding" />}>
          <Plus />
          Nova organização
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
