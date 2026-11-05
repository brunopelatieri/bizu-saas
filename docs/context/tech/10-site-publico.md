# Landing page e site público

- **Escopo:** Seções da home e layout público responsivo.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** `src/components/landing/`, `src/components/layout/root-layout.tsx`, `src/components/layout/site-header.tsx`, `src/components/layout/site-nav-links.tsx`, `src/pages/home-page.tsx`

<!-- ORIGEM: PROJECT_TECHNICAL_SPEC.md L420-458 -->
## 10. Landing Page e Site Publico

Home atual (`src/pages/home-page.tsx`) compoe secoes em
`src/components/landing/`:

- `HeroSection`
- `AboutSection`
- `FeaturesSection`
- `HowItWorksSection` (metodologia AI Software Engineering)
- `StackSection`
- `AudienceSection`
- `BlogSection`
- `FaqSection`
- `CtaSection`

Objetivo:

- Posicionar o Bizu Starter como ponto de partida para projetos pequenos e medios com login e dashboard.
- Destacar tecnologias, metodologia e publico-alvo (empresas, agencias e freelancers, empreendedores e devs).
- Servir como base para landing pages de projetos derivados.

Observacao:

- A `BlogSection` da landing e uma vitrine/preview estatica.
- O blog real com SSR esta em `/blog` e `/blog/:slug`.

Layout publico:

- `src/components/layout/root-layout.tsx` — shell com header, main e footer.
- `src/components/layout/site-header.tsx` — header sticky responsivo.
- `src/components/layout/site-nav-links.tsx` — links de `navItems` com `NavLink` ativo;
  reutilizado no desktop (inline) e no Sheet mobile.
- Mobile (`<md`): hamburger + Sheet lateral com navegacao e acoes de auth
  (Entrar ou Dashboard/Sair).
- Desktop (`≥md`): logo, nav inline, theme toggle e auth como antes.
- Anti-overflow: `min-w-0`, `overflow-hidden`, `shrink-0`, padding responsivo.

---

