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
  route("login", "routes/login.tsx"),
  route("auth/callback", "routes/auth-callback.tsx"),

  // ---------------------------------------------------------------------------
  // Área autenticada — client-only (SEM loader de servidor).
  // O ProtectedRoute faz o gate no cliente; nenhum dado sensível é
  // renderizado no HTML inicial (ver docs/context/tech/01-visao-geral.md).
  // ---------------------------------------------------------------------------
  layout("components/auth/protected-route.tsx", [
    route("dashboard", "components/layout/dashboard-layout.tsx", [
      index("routes/dashboard.tsx"),
      route("projetos", "routes/dashboard.coming-soon.tsx", {
        id: "dash-projetos",
      }),
      route("clientes", "routes/dashboard.coming-soon.tsx", {
        id: "dash-clientes",
      }),
      route("arquivos", "routes/dashboard.coming-soon.tsx", {
        id: "dash-arquivos",
      }),
      route("relatorios", "routes/dashboard.coming-soon.tsx", {
        id: "dash-relatorios",
      }),
      route("configuracoes", "routes/dashboard.coming-soon.tsx", {
        id: "dash-configuracoes",
      }),
    ]),
  ]),
] satisfies RouteConfig;
