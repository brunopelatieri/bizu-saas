import { Hono } from "hono";
import { cors } from "hono/cors";
import { contactRoutes } from "./routes/contact";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  }),
);

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/contact", contactRoutes);

export default app;
