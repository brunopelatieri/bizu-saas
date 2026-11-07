import { createContext } from "react";
import { createContext as createRouterContext } from "react-router";

/** Nonce da requisição, só no SSR. No navegador é `undefined`: o script já rodou. */
export const CspNonceContext = createContext<string | undefined>(undefined);

/** Leva o nonce gerado por `securityHeaders` (`src/api/security.ts`) ao `entry.server.tsx`. */
export const cspNonceRouterContext = createRouterContext<string | undefined>();
