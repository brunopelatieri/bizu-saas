import { createAuthClient } from "better-auth/react";
import { PORTAL_AUTH_BASE_PATH } from "@/lib/auth/constants";

/** Cliente do Better Auth no portal. Mesma origem; cookies e sessão separados dos de `/app`. */
export const portalClient = createAuthClient({
  basePath: PORTAL_AUTH_BASE_PATH,
});
