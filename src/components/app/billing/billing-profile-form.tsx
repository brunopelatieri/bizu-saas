import { useState } from "react";
import { Field } from "@/components/admin/field";
import {
  type BillingProfile,
  useBillingMutation,
} from "@/components/app/billing/billing-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { billingProfileSchema } from "@/lib/schemas/billing";

const DOCUMENT_TYPES = [
  { value: "cnpj", label: "CNPJ" },
  { value: "cpf", label: "CPF" },
];

/** Dados de faturamento. O mesmo schema da API valida aqui, antes de enviar. */
export function BillingProfileForm({
  profile,
  readOnly,
}: {
  profile: BillingProfile | null;
  readOnly: boolean;
}) {
  const [legalName, setLegalName] = useState(profile?.legalName ?? "");
  const [documentType, setDocumentType] = useState<string>(
    profile?.documentType ?? "cnpj",
  );
  const [document, setDocument] = useState(profile?.document ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = useBillingMutation("Dados de faturamento salvos.");

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const parsed = billingProfileSchema.safeParse({
      legalName,
      documentType,
      document,
      email,
      address: profile?.address ?? {},
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setError(null);
    save.mutate({
      path: "/api/billing/profile",
      method: "PUT",
      body: parsed.data,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados de faturamento</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome ou razão social" className="sm:col-span-2">
            {(id) => (
              <Input
                id={id}
                value={legalName}
                maxLength={200}
                disabled={readOnly}
                autoComplete="organization"
                onChange={(event) => setLegalName(event.target.value)}
              />
            )}
          </Field>
          <Field label="Tipo de documento">
            {(id) => (
              <Select
                items={DOCUMENT_TYPES}
                value={documentType}
                disabled={readOnly}
                onValueChange={(next) => next && setDocumentType(next)}
              >
                <SelectTrigger id={id} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Número do documento">
            {(id) => (
              <Input
                id={id}
                value={document}
                maxLength={20}
                inputMode="numeric"
                disabled={readOnly}
                onChange={(event) => setDocument(event.target.value)}
              />
            )}
          </Field>
          <Field label="E-mail para faturas" className="sm:col-span-2">
            {(id) => (
              <Input
                id={id}
                type="email"
                value={email}
                maxLength={200}
                disabled={readOnly}
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </Field>

          {error ? (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {error}
            </p>
          ) : null}

          {readOnly ? null : (
            <div className="sm:col-span-2">
              <Button type="submit" disabled={save.isPending}>
                Salvar dados
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
