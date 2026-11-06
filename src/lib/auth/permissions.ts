import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

/**
 * Papéis de plataforma do plugin `admin`, gravados em `user.role`. Suporte não
 * exclui, não troca papel nem define senha. Ninguém personifica por aqui: o caminho
 * HTTP do plugin fica desligado até a política de consentimento (fase 9).
 */
export const platformAccessControl = createAccessControl(defaultStatements);

export const platformRoles = {
  user: platformAccessControl.newRole({ user: [], session: [] }),
  platform_owner: platformAccessControl.newRole({
    user: [
      "create",
      "list",
      "set-role",
      "ban",
      "impersonate",
      "delete",
      "set-password",
      "set-email",
      "set-phone",
      "get",
      "update",
    ],
    session: ["list", "revoke", "delete"],
  }),
  platform_support: platformAccessControl.newRole({
    user: ["list", "ban", "impersonate", "get"],
    session: ["list", "revoke"],
  }),
};
