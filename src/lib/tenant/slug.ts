import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organization } from "@/db/schema";
import { slugify } from "@/lib/schemas/tenant";

export async function isSlugTaken(slug: string) {
  const [row] = await getDb()
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, slug))
    .limit(1);

  return Boolean(row);
}

/** Slug gerado a partir do nome, com sufixo aleatório se já existir. */
export async function generateSlug(name: string) {
  const base = slugify(name) || "organizacao";
  if (!(await isSlugTaken(base))) return base;
  return `${base.slice(0, 41)}-${randomBytes(3).toString("hex")}`;
}
