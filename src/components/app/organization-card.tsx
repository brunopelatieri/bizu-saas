import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useCan } from "@/components/auth/can";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  type UpdateTenantInput,
  updateTenantSchema,
} from "@/lib/schemas/tenant";
import { useAuth } from "@/providers/auth-provider";

export function OrganizationCard() {
  const { tenant, reloadAccount } = useAuth();
  const can = useCan();
  const editable = can("organization", "update");
  const form = useForm<UpdateTenantInput>({
    resolver: zodResolver(updateTenantSchema),
    values: { name: tenant?.name ?? "" },
    mode: "onChange",
  });

  async function onSubmit(values: UpdateTenantInput) {
    try {
      await apiFetch("/api/tenant", {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      await reloadAccount();
      toast.success("Organização atualizada.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar.",
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Organização</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid max-w-sm gap-3"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input {...field} readOnly={!editable} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {editable ? (
              <Button
                type="submit"
                className="justify-self-start"
                disabled={
                  form.formState.isSubmitting ||
                  !form.formState.isValid ||
                  !form.formState.isDirty
                }
              >
                Salvar
              </Button>
            ) : null}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
