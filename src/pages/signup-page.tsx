import { Navigate } from "react-router";
import { SignupForm } from "@/components/auth/auth-form";
import { AuthShell, AuthSpinner } from "@/components/auth/auth-shell";
import { useAuth } from "@/providers/auth-provider";

export function SignupPage() {
  const { user, loading } = useAuth();

  if (loading) return <AuthSpinner />;
  if (user) return <Navigate to="/app" replace />;

  return (
    <AuthShell title="Criar conta" subtitle="Comece em poucos minutos">
      <SignupForm />
    </AuthShell>
  );
}
