import { useState } from "react";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import {
  type TeamInvitation,
  useTeamMutation,
} from "@/components/app/team/team-api";
import { Can } from "@/components/auth/can";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { roleLabel } from "@/lib/auth/permissions";

const expiresFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export function InvitationsTable({
  invitations,
}: {
  invitations: TeamInvitation[];
}) {
  const [revoking, setRevoking] = useState<TeamInvitation | null>(null);
  const resend = useTeamMutation("Convite reenviado.");
  const revoke = useTeamMutation("Convite revogado.");

  function confirmRevoke() {
    if (!revoking) return;

    revoke.mutate(
      { path: `/api/team/invitations/${revoking.id}`, method: "DELETE" },
      { onSettled: () => setRevoking(null) },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Convites pendentes</CardTitle>
      </CardHeader>
      <CardContent>
        {invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum convite aguardando resposta.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>E-mail</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Vale até</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell className="break-all">{invitation.email}</TableCell>
                  <TableCell>{roleLabel(invitation.role)}</TableCell>
                  <TableCell>
                    {expiresFormat.format(new Date(invitation.expiresAt))}
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={resend.isPending}
                      onClick={() =>
                        resend.mutate({
                          path: `/api/team/invitations/${invitation.id}/resend`,
                          method: "POST",
                        })
                      }
                    >
                      Reenviar
                    </Button>
                    <Can resource="invitation" action="cancel">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRevoking(invitation)}
                      >
                        Revogar
                      </Button>
                    </Can>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <ConfirmDialog
        open={Boolean(revoking)}
        title="Revogar convite"
        description={`O link enviado a ${revoking?.email} deixa de funcionar.`}
        confirmLabel="Revogar"
        pending={revoke.isPending}
        onConfirm={confirmRevoke}
        onCancel={() => setRevoking(null)}
      />
    </Card>
  );
}
