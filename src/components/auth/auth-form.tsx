import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  authInputClassName,
  authLabelClassName,
  authLinkClassName,
  authSubmitClassName,
} from "@/components/auth/auth-shell";
import { ResendVerification } from "@/components/auth/resend-verification";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { AuthActionError } from "@/lib/auth/client";
import { TERMS_VERSION } from "@/lib/legal/versions";
import {
  type LoginInput,
  loginSchema,
  MIN_PASSWORD_LENGTH,
  type SignupInput,
  signupSchema,
} from "@/lib/schemas/auth";
import { useAuth } from "@/providers/auth-provider";

/** Tela depois do cadastro. A mesma para e-mail novo e existente. */
function CheckEmailNotice({
  email,
  loginPath,
}: {
  email: string;
  loginPath: string;
}) {
  return (
    <div className="grid gap-4 text-sm">
      <div className="flex items-start gap-3">
        <MailCheck className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <p className="font-medium text-white">Confirme seu e-mail</p>
          <p className="mt-1 text-muted-foreground">
            Enviamos um link para <span className="break-all">{email}</span>. Ele
            vale por 1 hora.
          </p>
        </div>
      </div>
      <ResendVerification email={email} />
      <p className="text-center text-muted-foreground">
        <Link to={loginPath} className={authLinkClassName}>
          Já confirmei, entrar
        </Link>
      </p>
    </div>
  );
}

export function LoginForm({ nextPath }: { nextPath: string }) {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onChange",
  });

  async function onSubmit(values: LoginInput) {
    setUnverifiedEmail(null);

    try {
      const { twoFactor } = await signIn(values);

      navigate(
        twoFactor ? `/2fa?next=${encodeURIComponent(nextPath)}` : nextPath,
      );
    } catch (error) {
      if (error instanceof AuthActionError && error.code === "EMAIL_NOT_VERIFIED") {
        setUnverifiedEmail(values.email);
        return;
      }

      toast.error(
        error instanceof Error ? error.message : "Falha ao entrar. Tente novamente.",
      );
    }
  }

  return (
    <div className="grid w-full gap-4">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid w-full grid-cols-1 gap-4"
        >
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel className={authLabelClassName}>E-mail</FormLabel>
                <FormControl className="w-full">
                  <Input
                    {...field}
                    type="email"
                    autoComplete="email"
                    placeholder="voce@empresa.com"
                    className={authInputClassName}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel className={authLabelClassName}>Senha</FormLabel>
                <FormControl className="w-full">
                  <Input
                    {...field}
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••••"
                    className={authInputClassName}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            size="lg"
            className={authSubmitClassName}
            disabled={form.formState.isSubmitting || !form.formState.isValid}
          >
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="animate-spin" />
                Entrando...
              </>
            ) : (
              "Entrar"
            )}
          </Button>
        </form>
      </Form>

      {unverifiedEmail ? (
        <div className="grid gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <p className="font-medium text-amber-400">
            Confirme seu e-mail para entrar
          </p>
          <p className="text-muted-foreground">
            Enviamos um novo link para o seu e-mail.
          </p>
          <ResendVerification email={unverifiedEmail} />
        </div>
      ) : null}

      <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
        <Link to="/esqueci-senha" className={authLinkClassName}>
          Esqueci minha senha
        </Link>
        <Link to="/cadastro" className={authLinkClassName}>
          Criar conta
        </Link>
      </div>
    </div>
  );
}

type SignupFormProps = {
  /** Cadastro por convite: o e-mail é o do convite. */
  lockedEmail?: string;
  loginPath?: string;
};

export function SignupForm({
  lockedEmail,
  loginPath = "/login",
}: SignupFormProps) {
  const { signUp } = useAuth();
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      email: lockedEmail ?? "",
      password: "",
      termsVersion: TERMS_VERSION,
    },
    mode: "onChange",
  });

  async function onSubmit(values: SignupInput) {
    try {
      await signUp(values);
      setSubmittedEmail(values.email);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao criar conta. Tente novamente.",
      );
    }
  }

  if (submittedEmail) {
    return <CheckEmailNotice email={submittedEmail} loginPath={loginPath} />;
  }

  return (
    <div className="grid w-full gap-4">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid w-full grid-cols-1 gap-4"
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel className={authLabelClassName}>Nome</FormLabel>
                <FormControl className="w-full">
                  <Input
                    {...field}
                    autoComplete="name"
                    placeholder="Seu nome completo"
                    className={authInputClassName}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel className={authLabelClassName}>E-mail</FormLabel>
                <FormControl className="w-full">
                  <Input
                    {...field}
                    type="email"
                    autoComplete="email"
                    placeholder="voce@empresa.com"
                    readOnly={Boolean(lockedEmail)}
                    className={authInputClassName}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel className={authLabelClassName}>Senha</FormLabel>
                <FormControl className="w-full">
                  <Input
                    {...field}
                    type="password"
                    autoComplete="new-password"
                    placeholder={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres`}
                    className={authInputClassName}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="acceptTerms"
            render={({ field }) => (
              <FormItem className="w-full">
                <label className="flex items-start gap-2 text-sm text-muted-foreground">
                  <input
                    ref={field.ref}
                    name={field.name}
                    onBlur={field.onBlur}
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={field.value === true}
                    onChange={(event) => field.onChange(event.target.checked)}
                  />
                  <span>Li e aceito os termos de uso e a política de privacidade.</span>
                </label>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            size="lg"
            className={authSubmitClassName}
            disabled={form.formState.isSubmitting || !form.formState.isValid}
          >
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="animate-spin" />
                Criando conta...
              </>
            ) : (
              "Criar conta"
            )}
          </Button>
        </form>
      </Form>

      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link to={loginPath} className={authLinkClassName}>
          Entrar
        </Link>
      </p>
    </div>
  );
}
