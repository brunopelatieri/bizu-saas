import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api/client";
import type { AuthUser } from "@/lib/auth/types";
import { useAuth } from "@/providers/auth-provider";

/**
 * Exemplo do fluxo de dados privados: TanStack Query no cliente e endpoint
 * protegido por `requireAuth`.
 */
export function AccountCard() {
  const { user } = useAuth();

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["me", user?.id],
    queryFn: () => apiFetch<{ user: AuthUser }>("/api/me"),
    enabled: Boolean(user),
    retry: false,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sua conta</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-start gap-2 text-sm">
            <p className="text-destructive">{error.message}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="font-medium text-primary hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <dl className="grid gap-1 text-sm sm:grid-cols-[max-content_1fr] sm:gap-x-4">
            <dt className="text-muted-foreground">Nome</dt>
            <dd className="text-foreground">
              {data.user.fullName ?? "Não informado"}
            </dd>
            <dt className="text-muted-foreground">E-mail</dt>
            <dd className="break-all text-foreground">
              {data.user.email ?? "Não informado"}
            </dd>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
