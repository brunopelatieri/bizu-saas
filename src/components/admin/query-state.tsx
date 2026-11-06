import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type QueryStateProps = {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  children: ReactNode;
};

/** Carregando, erro com nova tentativa, ou o conteúdo (`spec-rotas-api.md`, estados padrão). */
export function QueryState({
  isPending,
  isError,
  error,
  refetch,
  children,
}: QueryStateProps) {
  if (isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-start gap-2 text-sm">
        <p className="text-destructive">{error?.message}</p>
        <button
          type="button"
          onClick={refetch}
          className="font-medium text-primary hover:underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return children;
}

export function PageTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        {title}
      </h1>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
