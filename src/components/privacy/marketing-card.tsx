import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { QueryState } from "@/components/admin/query-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api/client";

type ConsentState = {
  marketing: boolean;
  accepted: { terms: string | null; privacy: string | null };
  current: { terms: string; privacy: string };
};

/** Marketing é opcional e revogável a qualquer momento; cada mudança vira uma linha em `consent_log`. */
export function MarketingCard() {
  const queryClient = useQueryClient();
  const queryKey = ["privacy", "consent"];
  const query = useQuery({
    queryKey,
    queryFn: () => apiFetch<ConsentState>("/api/me/consent"),
    retry: false,
  });

  const save = useMutation({
    mutationFn: (accepted: boolean) =>
      apiFetch("/api/me/consent/marketing", {
        method: "POST",
        body: JSON.stringify({ accepted }),
      }),
    onSuccess: async () => {
      toast.success("Preferência salva.");
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(error.message),
  });

  const data = query.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Comunicações e termos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <QueryState {...query}>
          <label className="flex items-start gap-2 text-foreground">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={data?.marketing ?? false}
              disabled={save.isPending}
              onChange={(event) => save.mutate(event.target.checked)}
            />
            <span>Quero receber novidades por e-mail.</span>
          </label>
          <p className="text-muted-foreground">
            Você aceitou os{" "}
            <a href="/legal/termos" className="text-primary underline">
              termos de uso
            </a>{" "}
            (versão {data?.accepted.terms ?? "–"}) e a{" "}
            <a href="/legal/privacidade" className="text-primary underline">
              política de privacidade
            </a>{" "}
            (versão {data?.accepted.privacy ?? "–"}).
          </p>
        </QueryState>
      </CardContent>
    </Card>
  );
}
