# Conclusão

- **Escopo:** Síntese do posicionamento técnico do template.
- **Specs relacionadas:** `docs/specs/saas-foundation/`
- **Paths do código:** não declarado

O projeto é um starter para SaaS multi-tenant, com cobrança recorrente, quatro
níveis de login e portabilidade para qualquer VPS com Docker e Postgres.

A base técnica: React Router Framework Mode com SSR, Hono no mesmo processo, Drizzle
em qualquer Postgres com Row Level Security, Better Auth em duas instâncias,
pg-boss para jobs, provedores substituíveis de e-mail e pagamento, Tailwind/shadcn
como design system e Docker para VPS.

Fora do escopo: subdomínio por tenant, login social, API pública e nota fiscal, até
que uma spec própria os traga.
