/** Texto das ações de `audit_log`. Ação sem rótulo aparece com o nome técnico. */
const AUDIT_LABELS: Record<string, string> = {
  "auth.signed_up": "Conta criada",
  "auth.email_verified": "E-mail confirmado",
  "auth.email_changed": "E-mail trocado",
  "auth.password_reset": "Senha redefinida",
  "auth.2fa_enabled": "2FA ativado",
  "auth.2fa_disabled": "2FA desativado",
  "auth.session_revoked": "Sessão encerrada",
  "tenant.created": "Organização criada",
  "tenant.updated": "Organização alterada",
  "tenant.security_updated": "Regra de 2FA alterada",
  "support.grant_created": "Acesso do suporte liberado",
  "support.grant_revoked": "Acesso do suporte revogado",
  "member.invited": "Convite enviado",
  "member.invitation_canceled": "Convite cancelado",
  "member.joined": "Membro entrou",
  "member.role_changed": "Papel alterado",
  "member.removed": "Membro removido",
  "role.created": "Papel criado",
  "role.updated": "Papel alterado",
  "role.deleted": "Papel excluído",
  "customer.created": "Cliente criado",
  "customer.updated": "Cliente alterado",
  "customer.deleted": "Cliente excluído",
  "customer.invited": "Cliente convidado ao portal",
  "billing.checkout_started": "Pagamento iniciado",
  "billing.subscription_changed": "Assinatura alterada",
  "billing.profile_updated": "Dados de cobrança alterados",
  "platform.impersonation_requested": "Suporte pediu acesso",
  "platform.impersonation_started": "Suporte entrou",
  "platform.impersonation_stopped": "Suporte saiu",
  "platform.impersonation_blocked_action": "Ação do suporte bloqueada",
};

export function auditActionLabel(action: string) {
  return AUDIT_LABELS[action] ?? action;
}

/** Grupos do filtro: a API busca pelo prefixo de `action`. */
export const AUDIT_ACTION_GROUPS = [
  { value: "auth.", label: "Conta" },
  { value: "tenant.", label: "Organização" },
  { value: "member.", label: "Equipe" },
  { value: "role.", label: "Papéis" },
  { value: "customer.", label: "Clientes" },
  { value: "billing.", label: "Cobrança" },
  { value: "support.", label: "Consentimento" },
  { value: "platform.", label: "Suporte" },
  { value: "admin.", label: "Administração" },
];
