import type { Config } from "@react-router/dev/config";

export default {
  // Pasta raiz da app (mantém tudo em src/ como já era no projeto)
  appDirectory: "src",
  // SSR em runtime habilitado globalmente.
  // O RR7 não possui flag de SSR por rota: o controle "SPA na área logada"
  // é feito mantendo as rotas /app, /admin e /portal SEM loader de servidor — elas
  // apenas entregam o shell e buscam dados no cliente (ver MIGRATION_NOTES.md).
  ssr: true,
} satisfies Config;
