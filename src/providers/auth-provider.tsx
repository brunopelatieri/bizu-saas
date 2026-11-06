import { createContext, useContext, type ReactNode } from "react";
import type { AuthUser } from "@/lib/auth/types";
import type { LoginInput, SignupInput } from "@/lib/schemas/auth";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  /** `false` enquanto não houver provedor de autenticação. */
  available: boolean;
  signIn: (values: LoginInput) => Promise<void>;
  signUp: (values: SignupInput) => Promise<void>;
  signOut: () => Promise<void>;
};

async function unavailable(): Promise<never> {
  throw new Error("Autenticação indisponível.");
}

/**
 * Ponto único da autenticação no cliente. Sem provedor, ninguém está logado e o
 * dashboard fica bloqueado. O novo provedor substitui este valor.
 */
const noProvider: AuthContextValue = {
  user: null,
  loading: false,
  available: false,
  signIn: unavailable,
  signUp: unavailable,
  signOut: async () => {},
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  return <AuthContext.Provider value={noProvider}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
