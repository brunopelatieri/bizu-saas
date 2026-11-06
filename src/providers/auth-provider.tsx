import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { apiFetch } from "@/lib/api/client";
import { authClient, toAuthActionError } from "@/lib/auth/client";
import {
  type AuthUser,
  type MeResponse,
  type TenantSummary,
  toAuthUser,
} from "@/lib/auth/types";
import type { LoginInput, SignupInput } from "@/lib/schemas/auth";

const NO_TENANTS: TenantSummary[] = [];
const NO_PERMISSIONS: string[] = [];

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  /** Tenant ativo da sessão; `null` antes do onboarding. */
  tenant: TenantSummary | null;
  tenants: TenantSummary[];
  /** Lista `recurso:ação`. Esconde botões; quem decide é o servidor. */
  permissions: string[];
  /** `GET /api/me` ainda não respondeu. */
  accountLoading: boolean;
  accountError: Error | null;
  /** Lança `AuthActionError`; `code` traz `EMAIL_NOT_VERIFIED` e afins. */
  signIn: (values: LoginInput) => Promise<void>;
  /** Não abre sessão: a conta só entra depois de confirmar o e-mail. */
  signUp: (values: SignupInput) => Promise<void>;
  signOut: () => Promise<void>;
  /** Relê a sessão depois de uma mudança feita fora do `authClient`. */
  refresh: () => Promise<void>;
  /** Relê tenants e permissões. */
  reloadAccount: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Ponto único da autenticação no cliente. A sessão vem de `authClient`; tenants e
 * permissões, de `GET /api/me`. A interface só conhece `AuthUser`. Serve para esconder
 * botões, não para proteger dados: quem protege é a API.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const { data, isPending, refetch } = session;
  const userId = data?.user.id;

  const account = useQuery({
    queryKey: ["me", userId],
    queryFn: () => apiFetch<MeResponse>("/api/me"),
    enabled: Boolean(userId),
    retry: false,
  });
  const me = account.data;

  const signIn = useCallback(async ({ email, password }: LoginInput) => {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) throw toAuthActionError(error);
  }, []);

  const signUp = useCallback(async (values: SignupInput) => {
    const { error } = await authClient.$fetch("/sign-up/email", {
      method: "POST",
      body: values,
    });
    if (error) throw toAuthActionError(error);
  }, []);

  const signOut = useCallback(async () => {
    await authClient.signOut();
    queryClient.clear();
  }, [queryClient]);

  const reloadAccount = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["me"] });
  }, [queryClient]);

  const refresh = useCallback(async () => {
    await refetch();
    await reloadAccount();
  }, [refetch, reloadAccount]);

  const switchTenant = useCallback(
    async (tenantId: string) => {
      await apiFetch("/api/tenant/active", {
        method: "POST",
        body: JSON.stringify({ tenantId }),
      });
      // Limpa em vez de invalidar: refeita agora, a busca da tela ainda usaria a chave do
      // tenant anterior e guardaria nela os dados do novo.
      await queryClient.resetQueries();
    },
    [queryClient],
  );

  const value = useMemo<AuthContextValue>(() => {
    const activeId = me?.user.activeTenant?.id;

    return {
      user: data ? (me?.user ?? toAuthUser(data)) : null,
      loading: isPending,
      tenant: me?.tenants.find(({ id }) => id === activeId) ?? null,
      tenants: me?.tenants ?? NO_TENANTS,
      permissions: me?.permissions ?? NO_PERMISSIONS,
      accountLoading: Boolean(data) && account.isPending,
      // Com dados em mãos, uma releitura que falha não derruba a tela.
      accountError: me ? null : account.error,
      signIn,
      signUp,
      signOut,
      refresh,
      reloadAccount,
      switchTenant,
    };
  }, [
    data,
    me,
    isPending,
    account.isPending,
    account.error,
    signIn,
    signUp,
    signOut,
    refresh,
    reloadAccount,
    switchTenant,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
