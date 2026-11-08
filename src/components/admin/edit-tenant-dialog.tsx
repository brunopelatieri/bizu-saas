import { useState } from "react";
import { toast } from "sonner";
import { useAdminMutation } from "@/components/admin/admin-api";
import { Field } from "@/components/admin/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { updateTenantSchema } from "@/lib/schemas/admin";

/**
 * Nome e slug da organização. Só os campos alterados vão à API. Trocar o slug quebra os links
 * `/portal/login?org=` e os magic links já enviados: o aviso aparece antes de salvar.
 * admin-crud A.
 */
export function EditTenantDialog({
  open,
  tenant,
  onClose,
}: {
  open: boolean;
  tenant: { id: string; name: string; slug: string };
  onClose: () => void;
}) {
  const [name, setName] = useState(tenant.name);
  const [slug, setSlug] = useState(tenant.slug);
  const save = useAdminMutation("Organização atualizada.");
  const slugChanged = slug.trim() !== tenant.slug;

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const patch = {
      ...(name.trim() !== tenant.name ? { name } : {}),
      ...(slugChanged ? { slug } : {}),
    };
    const parsed = updateTenantSchema.safeParse(patch);

    if (!parsed.success) {
      toast.error(
        Object.keys(patch).length === 0
          ? "Nada para alterar."
          : (parsed.error.issues[0]?.message ?? "Dados inválidos."),
      );
      return;
    }

    save.mutate(
      {
        path: `/api/admin/tenants/${tenant.id}`,
        method: "PATCH",
        body: parsed.data,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Editar organização</DialogTitle>
            <DialogDescription>
              Nome e identificador (slug). O plano se troca na assinatura.
            </DialogDescription>
          </DialogHeader>
          <Field label="Nome">
            {(id) => (
              <Input
                id={id}
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          <Field label="Identificador (slug)">
            {(id) => (
              <Input
                id={id}
                value={slug}
                maxLength={48}
                onChange={(event) => setSlug(event.target.value)}
              />
            )}
          </Field>
          {slugChanged ? (
            <p
              role="alert"
              className="rounded-md border border-border bg-muted p-3 text-sm"
            >
              Trocar o identificador quebra os links do portal já enviados
              (<code>/portal/login?org={tenant.slug}</code> e magic links): quem
              entrar por eles não cai na organização e precisa escolhê-la depois.
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
