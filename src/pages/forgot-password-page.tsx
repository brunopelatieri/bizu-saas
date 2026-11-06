import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { toast } from "sonner";
import {
  AuthShell,
  authInputClassName,
  authLabelClassName,
  authLinkClassName,
  authSubmitClassName,
} from "@/components/auth/auth-shell";
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
import { apiFetch } from "@/lib/api/client";
import { type EmailOnlyInput, emailOnlySchema } from "@/lib/schemas/auth";

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const form = useForm<EmailOnlyInput>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: { email: "" },
    mode: "onChange",
  });

  async function onSubmit(values: EmailOnlyInput) {
    try {
      await apiFetch("/api/auth-ext/forgot-password", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setSent(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Tente novamente mais tarde.",
      );
    }
  }

  return (
    <AuthShell title="Esqueci a senha" subtitle="Enviamos um link para redefinir">
      <div className="grid w-full gap-4">
        {sent ? (
          <p className="text-sm text-muted-foreground">
            Se existir uma conta com este e-mail, enviamos um link.
          </p>
        ) : (
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
              <Button
                type="submit"
                size="lg"
                className={authSubmitClassName}
                disabled={form.formState.isSubmitting || !form.formState.isValid}
              >
                {form.formState.isSubmitting ? (
                  <Loader2 className="animate-spin" />
                ) : null}
                Enviar link
              </Button>
            </form>
          </Form>
        )}

        <p className="text-center text-sm">
          <Link to="/login" className={authLinkClassName}>
            Voltar para o login
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
