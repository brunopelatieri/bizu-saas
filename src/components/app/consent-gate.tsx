import { ConsentDialog } from "@/components/legal/consent-dialog";
import { useAuth } from "@/providers/auth-provider";

/** Modal de re-aceite da equipe e da plataforma: aparece quando `/api/me` traz `consentRequired`. */
export function ConsentGate() {
  const { consentRequired, reloadAccount, signOut } = useAuth();

  return (
    <ConsentDialog
      open={consentRequired.length > 0}
      endpoint="/api/me/consent"
      onAccepted={reloadAccount}
      onSignOut={signOut}
    />
  );
}
