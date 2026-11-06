import { Outlet } from "react-router";
import { PortalAuthProvider } from "@/providers/portal-auth-provider";

/** Raiz de `/portal/**`: a sessão do cliente vale só aqui dentro. */
export default function PortalRoot() {
  return (
    <PortalAuthProvider>
      <Outlet />
    </PortalAuthProvider>
  );
}
