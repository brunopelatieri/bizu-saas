import { createContext } from "react";

/** Nonce da requisição, só no SSR. No navegador é `undefined`: o script já rodou. */
export const CspNonceContext = createContext<string | undefined>(undefined);

declare module "react-router" {
  interface AppLoadContext {
    /** Gerado por `securityHeaders` (`src/api/security.ts`). */
    cspNonce?: string;
  }
}
