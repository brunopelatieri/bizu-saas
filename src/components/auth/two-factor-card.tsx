import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, toAuthActionError } from "@/lib/auth/client";
import { useAuth } from "@/providers/auth-provider";

type Step =
  | { name: "idle" }
  | { name: "password"; action: PasswordAction }
  | { name: "scan"; totpURI: string; backupCodes: string[] }
  | { name: "codes"; backupCodes: string[] };

type PasswordAction = "enable" | "disable" | "regenerate";

const ACTION_LABELS: Record<PasswordAction, string> = {
  enable: "Continuar",
  disable: "Desativar",
  regenerate: "Gerar novos códigos",
};

/** O segredo do QR, para quem configura o aplicativo no próprio celular. */
function secretOf(totpURI: string) {
  return new URL(totpURI).searchParams.get("secret") ?? "";
}

function BackupCodes({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  async function copy() {
    await navigator.clipboard.writeText(codes.join("\n"));
    toast.success("Códigos copiados.");
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">
        Guarde estes códigos em um lugar seguro. Cada um vale uma vez e eles não
        serão mostrados de novo.
      </p>
      <ul className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void copy()}>
          Copiar
        </Button>
        <Button size="sm" onClick={onDone}>
          Já guardei
        </Button>
      </div>
    </div>
  );
}

/** Ativa, desativa e renova os códigos do 2FA. Usado em `/app` e `/admin`. */
export function TwoFactorCard() {
  const { user, refresh } = useAuth();
  const [step, setStep] = useState<Step>({ name: "idle" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const enabled = Boolean(user?.twoFactorEnabled);

  function reset() {
    setStep({ name: "idle" });
    setPassword("");
    setCode("");
  }

  async function run(action: () => Promise<void>) {
    setPending(true);

    try {
      await action();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível concluir.",
      );
    } finally {
      setPending(false);
    }
  }

  async function submitPassword(action: PasswordAction) {
    if (action === "enable") {
      const { data, error } = await authClient.twoFactor.enable({ password });
      if (error) throw toAuthActionError(error);
      // O envio de código por e-mail ou SMS fica fechado (`disabledPaths`).
      if (data.method !== "totp") throw new Error("Método indisponível.");

      setPassword("");
      setStep({
        name: "scan",
        totpURI: data.totpURI,
        backupCodes: data.backupCodes,
      });
      return;
    }

    if (action === "regenerate") {
      const { data, error } = await authClient.twoFactor.generateBackupCodes({
        password,
      });
      if (error) throw toAuthActionError(error);

      setPassword("");
      setStep({ name: "codes", backupCodes: data.backupCodes });
      return;
    }

    const { error } = await authClient.twoFactor.disable({ password });
    if (error) throw toAuthActionError(error);

    reset();
    await refresh();
    toast.success("Verificação em duas etapas desativada.");
  }

  async function confirmCode(backupCodes: string[]) {
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    if (error) throw toAuthActionError(error);

    setCode("");
    setStep({ name: "codes", backupCodes });
    await refresh();
    toast.success("Verificação em duas etapas ativada.");
  }

  function onPassword(event: FormEvent, action: PasswordAction) {
    event.preventDefault();
    void run(() => submitPassword(action));
  }

  function onCode(event: FormEvent, backupCodes: string[]) {
    event.preventDefault();
    void run(() => confirmCode(backupCodes));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {enabled ? (
            <ShieldCheck className="size-4 text-emerald-500" aria-hidden="true" />
          ) : (
            <ShieldAlert className="size-4 text-amber-500" aria-hidden="true" />
          )}
          Verificação em duas etapas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {step.name === "idle" ? (
          <>
            <p className="text-muted-foreground">
              {enabled
                ? "Ativa. Além da senha, o login pede um código do aplicativo autenticador."
                : "Proteja a conta com um código do aplicativo autenticador, além da senha."}
            </p>
            <div className="flex flex-wrap gap-2">
              {enabled ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setStep({ name: "password", action: "regenerate" })
                    }
                  >
                    Novos códigos de backup
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setStep({ name: "password", action: "disable" })}
                  >
                    Desativar
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setStep({ name: "password", action: "enable" })}
                >
                  Ativar
                </Button>
              )}
            </div>
          </>
        ) : null}

        {step.name === "password" ? (
          <form
            onSubmit={(event) => onPassword(event, step.action)}
            className="grid max-w-sm gap-3"
          >
            <div className="grid gap-1.5">
              <Label htmlFor="two-factor-password">Confirme sua senha</Label>
              <Input
                id="two-factor-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending || !password}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                {ACTION_LABELS[step.action]}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}

        {step.name === "scan" ? (
          <form
            onSubmit={(event) => onCode(event, step.backupCodes)}
            className="grid max-w-sm gap-3"
          >
            <p className="text-muted-foreground">
              Leia o QR com o aplicativo autenticador e digite o código gerado.
            </p>
            <div className="w-fit rounded-lg bg-white p-3">
              <QRCodeSVG value={step.totpURI} size={176} title="QR do autenticador" />
            </div>
            <p className="break-all text-xs text-muted-foreground">
              Sem câmera? Use a chave{" "}
              <code>{secretOf(step.totpURI)}</code>
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="two-factor-code">Código de 6 dígitos</Label>
              <Input
                id="two-factor-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending || code.length !== 6}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                Confirmar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}

        {step.name === "codes" ? (
          <BackupCodes codes={step.backupCodes} onDone={reset} />
        ) : null}
      </CardContent>
    </Card>
  );
}
