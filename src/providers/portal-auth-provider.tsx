import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { apiFetch } from "@/lib/api/client";
import { toAuthActionError } from "@/lib/auth/client";
import { portalClient } from "@/lib/auth/portal-client";
import { rememberPortalOrg } from "@/lib/portal/last-org";
import type { LoginInput } from "@/lib/schemas/auth";
import type { CustomerStatus } from "@/lib/tenant/customer-constants";

export type PortalUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  hasPassword: boolean;
};

export type PortalTenantSummary = {
  id: string;
  slug: string;
  name: string;
  status: CustomerStatus;
  /** Pode entrar agora: cliente ativo em tenant aberto. */
  available: boolean;
};

export type PortalMe = {
  user: PortalUser;
  tenants: PortalTenantSummary[];
  active: { id: string; slug: string; name: string } | null;
};

const NO_TENANTS: PortalTenantSummary[] = [];

type PortalAuthContextValue = {
  user: PortalUser | null;
  tenants: PortalTenantSummary[];
  active: PortalMe["active"];
  loading: boolean;
  accountError: Error | null;
  /** Lança `AuthActionError`. `org` só escolhe entre os tenants da pessoa. */
  signIn: (values: LoginInput, org?: string | null) => Promise<void>;
  signOut: () => Promise<void>;
  /** Relê a sessão depois de uma mudança feita fora do `portalClient`. */
  refresh: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
};

const PortalAuthContext = createContext<PortalAuthContextValue | undefined>(
  undefined,
);

/**
 * Sessão do cliente, separada da `AuthProvider`: em `/portal/**` as duas convivem, cada uma
 * com o seu cookie. Serve à interface. Quem protege os dados é `requirePortalAuth`.
 */
export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isPending, refetch } = portalClient.useSession();
  const userId = data?.user.id;

  const account = useQuery({
    queryKey: ["portal-me", userId],
    queryFn: () => apiFetch<PortalMe>("/api/portal/me"),
    enabled: Boolean(userId),
    retry: false,
  });
  const me = account.data;

  const switchTenant = useCallback(
    async (tenantId: string) => {
      await apiFetch("/api/portal/active-tenant", {
        method: "POST",
        body: JSON.stringify({ tenantId }),
      });
      // Limpa em vez de invalidar: a tela em andamento não guarda dados do tenant anterior.
      await queryClient.resetQueries();
    },
    [queryClient],
  );

  const signIn = useCallback(
    async ({ email, password }: LoginInput, org?: string | null) => {
      const { error } = await portalClient.signIn.email({
        email,
        password,
        callbackURL: org ? `/portal?org=${encodeURIComponent(org)}` : "/portal",
      });
      if (error) throw toAuthActionError(error);

      await refetch();

      const next = await apiFetch<PortalMe>("/api/portal/me");
      const chosen = next.tenants.find(
        (tenant) => tenant.available && tenant.slug === org,
      );
      if (chosen && chosen.id !== next.active?.id) await switchTenant(chosen.id);
    },
    [refetch, switchTenant],
  );

  const signOut = useCallback(async () => {
    if (me?.active) rememberPortalOrg(me.active.slug);
    await portalClient.signOut();
    queryClient.clear();
  }, [me, queryClient]);

  const refresh = useCallback(async () => {
    await refetch();
    await queryClient.invalidateQueries({ queryKey: ["portal-me"] });
  }, [refetch, queryClient]);

  const value = useMemo<PortalAuthContextValue>(
    () => ({
      user: me?.user ?? null,
      tenants: me?.tenants ?? NO_TENANTS,
      active: me?.active ?? null,
      loading: isPending || (Boolean(data) && account.isPending),
      accountError: me ? null : account.error,
      signIn,
      signOut,
      refresh,
      switchTenant,
    }),
    [
      me,
      data,
      isPending,
      account.isPending,
      account.error,
      signIn,
      signOut,
      refresh,
      switchTenant,
    ],
  );

  return (
    <PortalAuthContext.Provider value={value}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth() {
  const context = useContext(PortalAuthContext);

  if (!context) {
    throw new Error("usePortalAuth must be used within PortalAuthProvider");
  }

  return context;
}
