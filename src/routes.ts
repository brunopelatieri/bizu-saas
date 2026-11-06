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

  // ---------------------------------------------------------------------------
  // Área do tenant (owner e equipe) — client-only (SEM loader de servidor).
  // O ProtectedRoute faz o gate no cliente; nenhum dado sensível é
  // renderizado no HTML inicial. As áreas /admin (proprietário) e /portal
  // (cliente/lead) entram nas fases seguintes da spec saas-foundation.
  // ---------------------------------------------------------------------------
  layout("components/auth/protected-route.tsx", [
    route("app", "components/layout/dashboard-layout.tsx", [
      index("routes/app.tsx"),
      route("clientes", "routes/app.coming-soon.tsx", { id: "app-clientes" }),
      route("equipe", "routes/app.coming-soon.tsx", { id: "app-equipe" }),
      route("assinatura", "routes/app.coming-soon.tsx", {
        id: "app-assinatura",
      }),
      route("configuracoes", "routes/app.settings.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
