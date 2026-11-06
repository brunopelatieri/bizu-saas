import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api/client";
import {
  assignablePermissions,
  type Resource,
  statements,
} from "@/lib/auth/permissions";
import {
  PERMISSION_LABELS,
  RESOURCE_LABELS,
} from "@/lib/constants/permission-labels";
import { type RoleInput, roleSchema } from "@/lib/schemas/roles";
import { useAuth } from "@/providers/auth-provider";

type CustomRole = {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
};

/** O que o formulário oferece: nunca as reservadas ao owner. */
const permissionGroups = (Object.keys(statements) as Resource[])
  .map(
    (resource) =>
      [
        resource,
        assignablePermissions.filter((permission) =>
          permission.startsWith(`${resource}:`),
        ),
      ] as const,
  )
  .filter(([, permissions]) => permissions.length > 0);

function useRoleMutation(successMessage: string, onDone?: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      path,
      method,
      body,
    }: {
      path: string;
      method: "POST" | "PATCH" | "DELETE";
      body?: RoleInput;
    }) =>
      apiFetch(path, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    onSuccess: async () => {
      toast.success(successMessage);
      onDone?.();
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      await queryClient.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (error) => toast.error(error.message),
  });
}

function RoleDialog({
  role,
  onClose,
}: {
  /** `null` cria um papel novo. */
  role: CustomRole | null;
  onClose: () => void;
}) {
  const save = useRoleMutation(role ? "Papel salvo." : "Papel criado.", onClose);
  const form = useForm<RoleInput>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      name: role?.name ?? "",
      description: role?.description ?? "",
      permissions: role?.permissions ?? [],
    },
    mode: "onChange",
  });

  async function onSubmit(values: RoleInput) {
    await save
      .mutateAsync({
        path: role ? `/api/roles/${role.id}` : "/api/roles",
        method: role ? "PATCH" : "POST",
        body: values,
      })
      .catch(() => undefined);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{role ? "Editar papel" : "Novo papel"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="recepcao" autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="permissions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Permissões</FormLabel>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {permissionGroups.map(([resource, permissions]) => (
                      <fieldset key={resource} className="grid gap-1 text-sm">
                        <legend className="mb-1 font-medium">
                          {RESOURCE_LABELS[resource]}
                        </legend>
                        {permissions.map((permission) => (
                          <label
                            key={permission}
                            className="flex items-center gap-2 text-muted-foreground"
                          >
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              checked={field.value.includes(permission)}
                              onChange={(event) =>
                                field.onChange(
                                  event.target.checked
                                    ? [...field.value, permission]
                                    : field.value.filter(
                                        (value) => value !== permission,
                                      ),
                                )
                              }
                            />
                            {PERMISSION_LABELS[permission]}
                          </label>
                        ))}
                      </fieldset>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting || !form.formState.isValid}
              >
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/** Papéis personalizados do tenant. Só aparece para quem tem `role:*`, o owner. */
export function RolesCard() {
  const { tenant } = useAuth();
  const [editing, setEditing] = useState<CustomRole | "new" | null>(null);
  const [deleting, setDeleting] = useState<CustomRole | null>(null);
  const close = () => setDeleting(null);
  const remove = useRoleMutation("Papel excluído.");

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["roles", tenant?.id],
    queryFn: () => apiFetch<{ roles: CustomRole[] }>("/api/roles"),
    retry: false,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Papéis personalizados</CardTitle>
        <Button size="sm" onClick={() => setEditing("new")}>
          Novo papel
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : isError ? (
          <p className="text-destructive">{error.message}</p>
        ) : data.roles.length === 0 ? (
          <p className="text-muted-foreground">
            Além de proprietário, administrador e colaborador, crie papéis com as
            permissões de que sua equipe precisa.
          </p>
        ) : (
          data.roles.map((role) => (
            <div
              key={role.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">{role.name}</p>
                <p className="text-muted-foreground">
                  {role.description ||
                    (role.permissions.length === 1
                      ? "1 permissão"
                      : `${role.permissions.length} permissões`)}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(role)}
                >
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleting(role)}
                >
                  Excluir
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>

      {editing ? (
        <RoleDialog
          role={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir papel"
        description={`O papel ${deleting?.name} deixa de existir. Papel em uso não pode ser excluído.`}
        confirmLabel="Excluir"
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(
            { path: `/api/roles/${deleting?.id}`, method: "DELETE" },
            { onSettled: close },
          )
        }
        onCancel={close}
      />
    </Card>
  );
}
