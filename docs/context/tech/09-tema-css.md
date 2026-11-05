# Tema, CSS e template visual

- **Escopo:** Tailwind v4, design tokens e dark/light mode.
- **Specs relacionadas:** nenhuma citada
- **Paths do código:** `src/components/theme-toggle.tsx`, `src/index.css`, `src/lib/theme.ts`, `src/providers/theme-provider.tsx`, `src/stores/theme-store.ts`, `src/styles/theme.css`

<!-- ORIGEM: PROJECT_TECHNICAL_SPEC.md L359-419 -->
## 9. Tema, CSS e Template Visual

### Base Visual

O tema CSS foi inspirado no projeto `satnaing/shadcn-admin`, usando apenas a
base visual/variaveis CSS, sem instalar template de admin como dependencia.

Arquivos:

- `src/index.css`
- `src/styles/theme.css`

### Tailwind v4

`src/index.css`:

- `@import 'tailwindcss'`.
- `@import 'tw-animate-css'`.
- `@custom-variant dark (&:is(.dark *))`.
- Base styles para `body`, scrollbar e focus ring.
- Utilities customizadas:
  - `container`
  - `no-scrollbar`
  - `faded-bottom`
- Keyframes para Radix Collapsible:
  - `slideDown`
  - `slideUp`

### Design Tokens

`src/styles/theme.css` define:

- Radius tokens.
- Cores shadcn (`background`, `foreground`, `card`, `popover`, `primary`,
  `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`).
- Chart tokens (`chart-1` a `chart-5`), preparados para bibliotecas de graficos.
- Sidebar tokens (`sidebar-*`), preparados para layouts admin.
- Font tokens:
  - Inter
  - Manrope

### Dark/Light Mode

Arquivos:

- `src/lib/theme.ts`
- `src/stores/theme-store.ts`
- `src/providers/theme-provider.tsx`
- `src/components/theme-toggle.tsx`

Comportamento:

- Padrao: `system`.
- Toggle alterna entre `light` e `dark`.
- Persistencia via Zustand em `localStorage`.
- Classe `.dark` aplicada no `<html>`.
- Script inline anti-flash no SSR antes de hidratar.
- Sonner usa `useResolvedTheme()` para acompanhar o tema.

---

