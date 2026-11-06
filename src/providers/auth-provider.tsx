import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { authClient, toAuthActionError } from "@/lib/auth/client";
import { type AuthUser, toAuthUser } from "@/lib/auth/types";
import type { LoginInput, SignupInput } from "@/lib/schemas/auth";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  /** Lança `AuthActionError`; `code` traz `EMAIL_NOT_VERIFIED` e afins. */
  signIn: (values: LoginInput) => Promise<void>;
  /** Não abre sessão: a conta só entra depois de confirmar o e-mail. */
  signUp: (values: SignupInput) => Promise<void>;
  signOut: () => Promise<void>;
  /** Relê a sessão depois de uma mudança feita fora do `authClient`. */
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Ponto único da autenticação no cliente. O estado vem de `authClient`; a interface
 * só conhece `AuthUser`. Serve para esconder botões, não para proteger dados: quem
 * protege é `requireAuth`, no servidor.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const { data, isPending, refetch } = session;

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

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: data ? toAuthUser(data) : null,
      loading: isPending,
      signIn,
      signUp,
      signOut,
      refresh,
    }),
    [data, isPending, signIn, signUp, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
