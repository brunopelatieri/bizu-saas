import { Hono } from "hono";
import { getDb } from "../../src/db";
import { contactMessages } from "../../src/db/schema";

export const contactRoutes = new Hono();

contactRoutes.post("/", async (c) => {
  let body: { name?: string; email?: string; message?: string };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido." }, 400);
  }

  const name = body.name?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const message = body.message?.trim() ?? "";

  if (!name || !email || !message) {
    return c.json({ error: "Preencha todos os campos." }, 400);
  }

  try {
    await getDb().insert(contactMessages).values({ name, email, message });
  } catch {
    return c.json(
      { error: "Falha ao salvar. Verifique DATABASE_URL e migrations Drizzle." },
      500,
    );
  }

  return c.json({ ok: true });
});
