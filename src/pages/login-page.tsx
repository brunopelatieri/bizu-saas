import { Navigate, useSearchParams } from "react-router";
import { LoginForm } from "@/components/auth/auth-form";
import { AuthShell, AuthSpinner } from "@/components/auth/auth-shell";
import { safeNextPath } from "@/lib/auth/next-path";
import { useAuth } from "@/providers/auth-provider";

export function LoginPage() {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));

  if (loading) return <AuthSpinner />;
  if (user) return <Navigate to={nextPath} replace />;

  return (
    <AuthShell title="Bizu" subtitle="Entre para acessar sua conta">
      <LoginForm nextPath={nextPath} />
    </AuthShell>
  );
}
