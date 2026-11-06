---
paths:
  - "src/components/landing/**"
  - "src/components/contact/**"
  - "src/components/projects/**"
  - "src/components/layout/site-*.tsx"
  - "src/components/layout/root-layout.tsx"
  - "src/components/layout/page-hero.tsx"
  - "src/pages/home-page.tsx"
  - "src/pages/pricing-page.tsx"
  - "src/routes/pricing.tsx"
  - "src/pages/about-page.tsx"
  - "src/pages/contact-page.tsx"
  - "src/pages/projects-page.tsx"
---

# Landing, páginas públicas e layout compartilhado

- Mobile-first, sem overflow horizontal.
- Navbar e footer são compartilhados via layout.
- Idioma da interface: pt-BR.
- A `BlogSection` da landing é vitrine estática; o blog real está em `/blog`.
- `/precos` tem `loader` server-side com os planos ativos (`listPublicPlans`, Drizzle direto) e não expõe `provider_price_ref`.
- Marca, descrição e links ficam em `siteConfig` (`src/lib/constants/navigation.ts`).

Para entender este domínio, leia: docs/context/tech/10-site-publico.md
