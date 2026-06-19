import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase } from "@/lib/supabase/client";

export function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const supabase = getSupabase();

    supabase.auth.getSession().then(({ data: { session } }) => {
      navigate(session ? "/" : "/login", { replace: true });
    });
  }, [navigate]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
      Finalizando autenticação...
    </div>
  );
}
