import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import {
  AuthShell,
  AuthSpinner,
  authInputClassName,
  authLabelClassName,
  authLinkClassName,
  authSubmitClassName,
} from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, toAuthActionError } from "@/lib/auth/client";
import { safeNextPath } from "@/lib/auth/next-path";
import { backupCodeSchema, totpCodeSchema } from "@/lib/schemas/security";
import { useAuth } from "@/providers/auth-provider";

type Method = "totp" | "backup";

/** Desafio depois da senha. O GET só renderiza: quem consome é o botão. */
export function TwoFactorPage() {
  const { user, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const [method, setMethod] = useState<Method>("totp");
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (loading) return <AuthSpinner />;
  if (user) return <Navigate to={nextPath} replace />;

  const schema = method === "totp" ? totpCodeSchema : backupCodeSchema;
  const parsed = schema.safeParse({ code, trustDevice });

  function switchMethod() {
    setMethod(method === "totp" ? "backup" : "totp");
    setCode("");
    setError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!parsed.success) return;

    setPending(true);
    setError(null);

    const { error: failure } =
      method === "totp"
        ? await authClient.twoFactor.verifyTotp(parsed.data)
        : await authClient.twoFactor.verifyBackupCode(parsed.data);

    if (failure) {
      setPending(false);
      setCode("");
      setError(toAuthActionError(failure).message);
      return;
    }

    await refresh();
    navigate(nextPath, { replace: true });
  }

  return (
    <AuthShell
      title="Verificação em duas etapas"
      subtitle={
        method === "totp"
          ? "Digite o código do aplicativo autenticador"
          : "Digite um dos códigos de backup"
      }
    >
      <form onSubmit={(event) => void onSubmit(event)} className="grid w-full gap-4">
        <div className="grid gap-2">
          <Label htmlFor="two-factor-code" className={authLabelClassName}>
            {method === "totp" ? "Código de 6 dígitos" : "Código de backup"}
          </Label>
          <Input
            id="two-factor-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode={method === "totp" ? "numeric" : "text"}
            autoComplete="one-time-code"
            maxLength={method === "totp" ? 6 : 32}
            className={authInputClassName}
            autoFocus
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(event) => setTrustDevice(event.target.checked)}
          />
          Confiar neste dispositivo por 30 dias
        </label>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          className={authSubmitClassName}
          disabled={pending || !parsed.success}
        >
          {pending ? <Loader2 className="animate-spin" /> : "Verificar"}
        </Button>
      </form>

      <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
        <button type="button" onClick={switchMethod} className={authLinkClassName}>
          {method === "totp" ? "Usar código de backup" : "Usar o aplicativo"}
        </button>
        <Link to="/login" className={authLinkClassName}>
          Voltar ao login
        </Link>
      </div>
    </AuthShell>
  );
}
