import { Navigate } from "react-router-dom";
import { AuthForm } from "@/components/auth/auth-form";
import { PageHero } from "@/components/layout/page-hero";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { useAuth } from "@/providers/auth-provider";

export function LoginPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">Carregando...</div>;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <PageHero
        title="Entrar"
        description="Autenticação via Supabase Auth. Dados da app ficam no seu Postgres via Drizzle."
      />
      <section className="flex justify-center px-6 py-12">
        {!isSupabaseConfigured() ? (
          <Card className="max-w-md border-amber-500/30">
            <CardHeader>
              <CardTitle>Supabase não configurado</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Defina <code className="text-primary">VITE_SUPABASE_URL</code> e{" "}
              <code className="text-primary">VITE_SUPABASE_PUBLISHABLE_KEY</code>{" "}
              no <code className="text-primary">.env.local</code>.
            </CardContent>
          </Card>
        ) : (
          <AuthForm />
        )}
      </section>
    </>
  );
}
