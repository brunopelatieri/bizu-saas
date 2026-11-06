import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, LogIn, UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  loginSchema,
  signupSchema,
  type LoginInput,
  type SignupInput,
} from "@/lib/schemas/auth";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

const inputClassName =
  "h-10 w-full bg-black/25 px-3 text-sm placeholder:text-muted-foreground/80";

const labelClassName = "text-white";

const tabTriggerClassName = cn(
  "h-full flex-1 gap-2 rounded-lg border border-transparent py-2 text-sm font-medium",
  "text-muted-foreground transition-all duration-300 ease-out",
  "hover:text-foreground",
  "data-active:border-primary/20 data-active:bg-primary/15 data-active:text-primary",
  "data-active:shadow-[0_0_20px_oklch(var(--primary)/0.15)]",
);

function LoginForm({ nextPath }: { nextPath: string }) {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onChange",
  });

  async function onSubmit(values: LoginInput) {
    try {
      await signIn(values);
      toast.success("Login realizado com sucesso.");
      navigate(nextPath);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Falha ao entrar. Tente novamente.",
      );
    }
  }

  return (
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
              <FormLabel className={labelClassName}>E-mail</FormLabel>
              <FormControl className="w-full">
                <Input
                  {...field}
                  type="email"
                  autoComplete="email"
                  placeholder="voce@empresa.com"
                  className={inputClassName}
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
              <FormLabel className={labelClassName}>Senha</FormLabel>
              <FormControl className="w-full">
                <Input
                  {...field}
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={inputClassName}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          size="lg"
          className="mt-2 h-10 w-full shadow-[0_0_24px_oklch(var(--primary)/0.25)]"
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
  );
}

function SignupForm({ nextPath }: { nextPath: string }) {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", phone: "", password: "" },
    mode: "onChange",
  });

  async function onSubmit(values: SignupInput) {
    try {
      await signUp(values);
      toast.success("Conta criada com sucesso.");
      navigate(nextPath);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Falha ao criar conta. Tente novamente.",
      );
    }
  }

  return (
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
              <FormLabel className={labelClassName}>Nome</FormLabel>
              <FormControl className="w-full">
                <Input
                  {...field}
                  autoComplete="name"
                  placeholder="Seu nome completo"
                  className={inputClassName}
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
              <FormLabel className={labelClassName}>E-mail</FormLabel>
              <FormControl className="w-full">
                <Input
                  {...field}
                  type="email"
                  autoComplete="email"
                  placeholder="voce@empresa.com"
                  className={inputClassName}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem className="w-full">
              <FormLabel className={labelClassName}>Telefone celular</FormLabel>
              <FormControl className="w-full">
                <Input
                  {...field}
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="(11) 99999-9999"
                  className={inputClassName}
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
              <FormLabel className={labelClassName}>Senha</FormLabel>
              <FormControl className="w-full">
                <Input
                  {...field}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Mínimo de 6 caracteres"
                  className={inputClassName}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          size="lg"
          className="mt-2 h-10 w-full shadow-[0_0_24px_oklch(var(--primary)/0.25)]"
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
  );
}

export function AuthForm() {
  const [searchParams] = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/app";
  const [mode, setMode] = useState<"login" | "signup">("login");

  return (
    <Tabs
      value={mode}
      onValueChange={(value) => setMode(value as "login" | "signup")}
      className="flex w-full flex-col gap-0"
    >
      <TabsList
        variant="default"
        className="mb-6 flex h-11 w-full max-w-none rounded-xl border border-white/10 bg-black/30 p-1"
      >
        <TabsTrigger value="login" className={tabTriggerClassName}>
          <LogIn className="size-4 shrink-0" />
          Entrar
        </TabsTrigger>
        <TabsTrigger value="signup" className={tabTriggerClassName}>
          <UserPlus className="size-4 shrink-0" />
          Criar Conta
        </TabsTrigger>
      </TabsList>

      <TabsContent
        value="login"
        className="w-full outline-none transition-all duration-300 ease-out data-[state=inactive]:hidden"
      >
        <LoginForm nextPath={nextPath} />
      </TabsContent>

      <TabsContent
        value="signup"
        className="w-full outline-none transition-all duration-300 ease-out data-[state=inactive]:hidden"
      >
        <SignupForm nextPath={nextPath} />
      </TabsContent>
    </Tabs>
  );
}
