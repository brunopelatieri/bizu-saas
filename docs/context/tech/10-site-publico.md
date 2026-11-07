# Landing page e site público

- **Escopo:** Seções da home e layout público responsivo.
- **Specs relacionadas:** `docs/specs/saas-foundation/spec-rotas-api.md`
- **Paths do código:** `src/components/landing/`, `src/components/layout/root-layout.tsx`, `src/components/layout/site-header.tsx`, `src/components/layout/site-nav-links.tsx`, `src/pages/home-page.tsx`, `src/pages/projects-page.tsx`, `src/pages/pricing-page.tsx`, `src/routes/pricing.tsx`, `src/lib/billing/public-plans.server.ts`, `src/lib/constants/navigation.ts`

## Home

`src/pages/home-page.tsx` compõe seções em `src/components/landing/`:

- `HeroSection`: "Comece seu SaaS com a fundação pronta", CTA para o GitHub.
- `AboutSection`: dores de quem monta um SaaS do zero e a solução.
- `FeaturesSection` (`#funcionalidades`): multi-tenant, quatro níveis de login,
  pagamentos em módulos, SSR, e-mail e jobs, portabilidade.
- `HowItWorksSection` (`#metodologia`): AI Software Engineering.
- `StackSection`, `AudienceSection`, `BlogSection` (vitrine estática), `FaqSection`,
  `CtaSection`.

Objetivo: posicionar o Bizu SaaS como ponto de partida para SaaS e servir de base para
a landing de projetos derivados. `/legal/termos` e `/legal/privacidade` (fase 10) são páginas SSR de texto: `src/routes/legal.tsx`, markdown em `src/lib/legal/` e `{{DPO_EMAIL}}` de `platform_setting.dpo_email` (`tech/27-lgpd-arquivos.md`). Links no rodapé e nos cadastros.

`siteConfig` em `src/lib/constants/navigation.ts` concentra nome, descrição, links e
autor; personalize ali primeiro (`docs/context/receitas.md`).

## Preços (`/precos`)

`src/routes/pricing.tsx` tem `loader` server-side que lê os planos ativos e seus preços ativos
pelo Drizzle (`listPublicPlans`, `public-plans.server.ts`), sem volta HTTP: são dados públicos,
sem RLS e sem dado pessoal. Devolve só o que a página mostra (nada de `provider_price_ref` nem
contagem de uso). Só entram preços compráveis (`isPriceUsable`, o mesmo filtro do checkout):
provedor fora de `PAYMENT_PROVIDERS` ou sem a referência exigida não aparece, e o plano fica
"Preço em breve". Mostra o menor preço por intervalo, alternância mensal/anual quando há
preço anual, limites e features; o CTA leva a `/cadastro`. `meta` via `buildMeta`; está em
`navItems` e em `public/sitemap.xml`. O que mudar em `/admin/planos` aparece na hora.

## Layout público

- `root-layout.tsx`: shell com header, main e footer.
- `site-header.tsx`: header sticky responsivo; mobile com hamburger e `Sheet`;
  desktop com nav inline, theme toggle e ações de auth (Entrar ou `/app`/Sair).
- `site-nav-links.tsx`: links de `navItems` com `NavLink` ativo.
- Anti-overflow: `min-w-0`, `overflow-hidden`, `shrink-0`, padding responsivo.
- `public/robots.txt` bloqueia `/app`, `/admin`, `/portal`, `/login` e `/auth`.
