import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  // ---------------------------------------------------------------------------
  // Site público (com header/footer) — SSR habilitado para SEO/Open Graph
  // ---------------------------------------------------------------------------
  layout("components/layout/root-layout.tsx", [
    index("routes/home.tsx"),
    route("sobre", "routes/about.tsx"),
    route("projetos", "routes/projects.tsx"),
    route("contato", "routes/contact.tsx"),
    route("blog", "routes/blog.tsx"),
    route("blog/:slug", "routes/blog-post.tsx"),
    route("precos", "routes/pricing.tsx"),
  ]),

  // ---------------------------------------------------------------------------
  // Páginas de autenticação (standalone, sem header/footer)
  // ---------------------------------------------------------------------------
  // Quem recebe token na URL só renderiza no GET; o botão faz a chamada.
  route("login", "routes/auth/login.tsx"),
  route("cadastro", "routes/auth/signup.tsx"),
  route("verificar-email", "routes/auth/verify-email.tsx"),
  route("esqueci-senha", "routes/auth/forgot-password.tsx"),
  route("redefinir-senha", "routes/auth/reset-password.tsx"),
  route("convite/:id", "routes/auth/invite.tsx"),

  // ---------------------------------------------------------------------------
  // Área do tenant (owner e equipe) — client-only (SEM loader de servidor).
  // O ProtectedRoute faz o gate no cliente; nenhum dado sensível é
  // renderizado no HTML inicial. A área /portal (cliente/lead) entra na fase 8
  // da spec saas-foundation; /admin segue o mesmo modelo.
  // ---------------------------------------------------------------------------
  layout("components/auth/protected-route.tsx", [
    route("app/onboarding", "routes/app.onboarding.tsx"),
    route("app", "components/app/app-layout.tsx", [
      index("routes/app.tsx"),
      route("clientes", "routes/app.coming-soon.tsx", { id: "app-clientes" }),
      route("equipe", "routes/app.team.tsx"),
      route("assinatura", "routes/app.coming-soon.tsx", {
        id: "app-assinatura",
      }),
      route("configuracoes", "routes/app.settings.tsx"),
    ]),

    // Plataforma (proprietário e suporte). O gate de papel é do `AdminLayout` e da
    // API (`requirePlatform`), nunca só do cliente.
    route("admin", "components/admin/admin-layout.tsx", [
      index("routes/admin/index.tsx"),
      route("tenants", "routes/admin/tenants.tsx"),
      route("tenants/:id", "routes/admin/tenant.tsx"),
      route("usuarios", "routes/admin/users.tsx"),
      route("planos", "routes/admin/plans.tsx"),
      route("planos/:id", "routes/admin/plan.tsx"),
      route("configuracoes", "routes/admin/settings.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
