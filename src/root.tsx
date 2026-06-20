import type { ReactNode } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { LinksFunction, MetaFunction } from "react-router";
import { AuthProvider } from "@/providers/auth-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { themeInitScript } from "@/lib/theme";
import { siteConfig } from "@/lib/constants/navigation";
import stylesheet from "@/index.css?url";

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Manrope:wght@200..800&display=swap",
  },
  { rel: "stylesheet", href: stylesheet },
];

export const meta: MetaFunction = () => [
  { title: `${siteConfig.name} — Boilerplate full-stack com AI Software Engineering` },
  { name: "description", content: siteConfig.description },
  { name: "theme-color", content: "#0b0b0c" },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Outlet />
        <Toaster richColors closeButton position="top-right" />
      </AuthProvider>
    </ThemeProvider>
  );
}

export function ErrorBoundary({ error }: { error: unknown }) {
  let title = "Erro inesperado";
  let message = "Algo deu errado. Tente novamente mais tarde.";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    message =
      error.status === 404
        ? "A página que você procura não existe."
        : error.data || message;
  } else if (import.meta.env.DEV && error instanceof Error) {
    message = error.message;
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-3xl font-bold text-foreground">{title}</h1>
      <p className="max-w-md text-muted-foreground">{message}</p>
      <a
        href="/"
        className="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        ← Voltar para o início
      </a>
    </main>
  );
}
