# Landing page e site público

- **Escopo:** Seções da home e layout público responsivo.
- **Specs relacionadas:** `docs/specs/saas-foundation/spec-rotas-api.md`
- **Paths do código:** `src/components/landing/`, `src/components/layout/root-layout.tsx`, `src/components/layout/site-header.tsx`, `src/components/layout/site-nav-links.tsx`, `src/pages/home-page.tsx`, `src/pages/projects-page.tsx`, `src/lib/constants/navigation.ts`

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
a landing de projetos derivados. A página `/precos` com `loader` de planos entra na
fase 5; `/legal/termos` e `/legal/privacidade` na fase 10.

`siteConfig` em `src/lib/constants/navigation.ts` concentra nome, descrição, links e
autor; personalize ali primeiro (`docs/context/receitas.md`).

## Layout público

- `root-layout.tsx`: shell com header, main e footer.
- `site-header.tsx`: header sticky responsivo; mobile com hamburger e `Sheet`;
  desktop com nav inline, theme toggle e ações de auth (Entrar ou `/app`/Sair).
- `site-nav-links.tsx`: links de `navItems` com `NavLink` ativo.
- Anti-overflow: `min-w-0`, `overflow-hidden`, `shrink-0`, padding responsivo.
- `public/robots.txt` bloqueia `/app`, `/admin`, `/portal`, `/login` e `/auth`.
