import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { RoleSelect } from "@/components/app/team/role-select";
import { type RoleOption, useTeamMutation } from "@/components/app/team/team-api";
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
import { type InviteInput, inviteSchema } from "@/lib/schemas/team";

export function InviteForm({ roles }: { roles: RoleOption[] }) {
  const invite = useTeamMutation("Convite enviado.");
  const form = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "member" },
    mode: "onChange",
  });

  async function onSubmit(values: InviteInput) {
    await invite
      .mutateAsync({
        path: "/api/team/invitations",
        method: "POST",
        body: values,
      })
      .then(() => form.reset())
      .catch(() => undefined);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Convidar para a equipe</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="email"
                      autoComplete="off"
                      placeholder="pessoa@empresa.com"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Papel</FormLabel>
                  <RoleSelect
                    roles={roles}
                    value={field.value}
                    onChange={field.onChange}
                    className="w-full"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              disabled={form.formState.isSubmitting || !form.formState.isValid}
            >
              Enviar convite
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
