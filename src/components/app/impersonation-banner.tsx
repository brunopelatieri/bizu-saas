import { UserRoundCog } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getUserDisplayName } from "@/lib/auth/user-display";
import { useAuth } from "@/providers/auth-provider";

/** Fixo enquanto a sessão é de suporte. Quem decide o que é bloqueado é a API. */
export function ImpersonationBanner() {
  const { user, signOut } = useAuth();
  const [pending, setPending] = useState(false);

  if (!user?.impersonatedBy) return null;

  async function stop() {
    setPending(true);

    try {
      await signOut();
    } catch (error) {
      setPending(false);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível sair.",
      );
    }
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm text-amber-700 dark:text-amber-300"
    >
      <p className="flex items-center gap-2 font-medium">
        <UserRoundCog className="size-4" aria-hidden="true" />
        Você está vendo como {getUserDisplayName(user)} (suporte)
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => void stop()}
      >
        Sair da personificação
      </Button>
    </div>
  );
}
