import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Mail } from "lucide-react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
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
import { createTenantSchema, slugify } from "@/lib/schemas/tenant";
import { useAuth } from "@/providers/auth-provider";

// O formulário sempre envia o slug; o servidor só gera um quando vem sem ele.
const formSchema = createTenantSchema.required({ slug: true });
type FormValues = { name: string; slug: string };

type PendingInvitation = { id: string; tenantName: string; roleLabel: string };

/** Convite aberto para o e-mail da conta: quem chega por um não precisa criar tenant. */
function PendingInvitations() {
  const { data } = useQuery({
    queryKey: ["my-invitations"],
    queryFn: () =>
      apiFetch<{ invitations: PendingInvitation[] }>("/api/me/invitations"),
    retry: false,
  });

  if (!data?.invitations.length) return null;

  return (
    <div className="mb-5 grid gap-2">
      {data.invitations.map(({ id, tenantName, roleLabel }) => (
        <Link
          key={id}
          to={`/convite/${id}`}
          className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm transition hover:bg-primary/10"
        >
          <Mail className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            <span className="font-medium text-white">
              Convite para {tenantName}
            </span>
            <span className="block text-muted-foreground">
              Como {roleLabel}. Abrir convite.
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const { tenants, reloadAccount, signOut } = useAuth();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", slug: "" },
    mode: "onChange",
  });

  async function onSubmit(values: FormValues) {
    try {
      await apiFetch("/api/tenant", {
        method: "POST",
        body: JSON.stringify(values),
      });
      await reloadAccount();
      navigate("/app", { replace: true });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível criar.",
      );
    }
  }

  return (
    <AuthShell
      title="Sua organização"
      subtitle="Crie o espaço da sua empresa para começar"
    >
      <PendingInvitations />

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
                <FormLabel className={authLabelClassName}>
                  Nome da organização
                </FormLabel>
                <FormControl className="w-full">
                  <Input
                    {...field}
                    autoComplete="organization"
                    placeholder="Clínica Acme"
                    className={authInputClassName}
                    onChange={(event) => {
                      field.onChange(event);
                      if (!form.getFieldState("slug").isDirty) {
                        form.setValue("slug", slugify(event.target.value), {
                          shouldValidate: true,
                        });
                      }
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel className={authLabelClassName}>
                  Identificador
                </FormLabel>
                <FormControl className="w-full">
                  <Input
                    {...field}
                    autoComplete="off"
                    placeholder="clinica-acme"
                    className={authInputClassName}
                    onChange={(event) =>
                      form.setValue("slug", event.target.value, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
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
                Criando...
              </>
            ) : (
              "Criar organização"
            )}
          </Button>
        </form>
      </Form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        {tenants.length > 0 ? (
          <Link to="/app" className={authLinkClassName}>
            Voltar para o painel
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => void signOut()}
            className={authLinkClassName}
          >
            Sair
          </button>
        )}
      </p>
    </AuthShell>
  );
}
