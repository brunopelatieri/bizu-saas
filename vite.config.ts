import path from "node:path";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { reactRouterHonoServer } from "react-router-hono-server/dev";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    // Cria/serve o servidor Hono (dev + prod) que envolve o handler SSR do React Router.
    // Deve vir ANTES do reactRouter().
    reactRouterHonoServer(),
    reactRouter(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
