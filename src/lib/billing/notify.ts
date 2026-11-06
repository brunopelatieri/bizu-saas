import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { member, organization, plan, user } from "@/db/schema";
import { appLink } from "@/lib/auth/links";
import { sendEmail } from "@/lib/email/send";
import { subscriptionCanceledTemplate } from "@/lib/email/templates/subscription-canceled";
import type { RenderedEmail } from "@/lib/email/types";

export type TenantOwner = { id: string; email: string; name: string };

/** Quem recebe os avisos de cobrança do tenant: seus proprietários, sem banidos. */
export function listTenantOwners(tenantId: string): Promise<TenantOwner[]> {
  return getDb()
    .select({ id: user.id, email: user.email, name: user.name })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(
      sql`${member.organizationId} = ${tenantId}
        and ${user.banned} = false
        and 'owner' = any(string_to_array(${member.role}, ','))`,
    );
}

export type OwnerNotice = {
  name: string;
  tenantName: string;
  /** A tela da assinatura, destino de todos os e-mails de cobrança. */
  url: string;
};

/** Avisa todos os proprietários do tenant. `template` só identifica o envio. */
export async function notifyOwners(
  tenantId: string,
  template: string,
  render: (notice: OwnerNotice) => RenderedEmail,
) {
  const [tenant] = await getDb()
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, tenantId));
  if (!tenant) return;

  const url = appLink("/app/assinatura");

  for (const owner of await listTenantOwners(tenantId)) {
    await sendEmail({
      to: owner.email,
      ...render({ name: owner.name, tenantName: tenant.name, url }),
      tags: { template },
    });
  }
}

/** Assinatura cancelada: `endsAt` é o último dia com acesso ao plano. */
export async function notifyCanceled(tenantId: string, planId: string, endsAt: Date) {
  const [row] = await getDb()
    .select({ name: plan.name })
    .from(plan)
    .where(eq(plan.id, planId));

  await notifyOwners(tenantId, "subscription-canceled", (owner) =>
    subscriptionCanceledTemplate({
      ...owner,
      planName: row?.name ?? "atual",
      endsAt,
    }),
  );
}
