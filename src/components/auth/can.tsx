import { type ReactNode, useCallback } from "react";
import type { Action, Resource } from "@/lib/auth/permissions";
import { useAuth } from "@/providers/auth-provider";

/** Pergunta se o papel atual tem a permissão. A API continua sendo quem decide. */
export function useCan() {
  const { permissions } = useAuth();

  return useCallback(
    <R extends Resource>(resource: R, action: Action<R>) =>
      permissions.includes(`${resource}:${action}`),
    [permissions],
  );
}

type CanProps<R extends Resource> = {
  resource: R;
  action: Action<R>;
  children: ReactNode;
  fallback?: ReactNode;
};

/** Esconde o que a pessoa não pode usar. Conveniência, não proteção. */
export function Can<R extends Resource>({
  resource,
  action,
  children,
  fallback = null,
}: CanProps<R>) {
  const can = useCan();

  return can(resource, action) ? children : fallback;
}
