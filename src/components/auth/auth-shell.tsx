import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { SiteLogo } from "@/components/layout/site-logo";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export const authInputClassName =
  "h-10 w-full bg-black/25 px-3 text-sm placeholder:text-muted-foreground/80";

export const authLabelClassName = "text-white";

export const authSubmitClassName =
  "mt-2 h-10 w-full shadow-[0_0_24px_oklch(var(--primary)/0.25)]";

export const authLinkClassName =
  "text-primary underline-offset-4 transition hover:underline";

/** Moldura das páginas de autenticação: standalone, sem header nem footer. */
export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="dark relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-[#050508] px-4 py-10 text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,oklch(1_0_0/0.035)_1px,transparent_1px),linear-gradient(to_bottom,oklch(1_0_0/0.035)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_78%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,oklch(0.72_0.16_230/0.2),transparent_40%),radial-gradient(circle_at_85%_10%,oklch(0.68_0.18_300/0.14),transparent_35%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
      />

      <div className="relative z-10 flex w-full max-w-lg flex-col items-center">
        <header className="mb-8 w-full text-center">
          <div className="mb-5 flex justify-center">
            <SiteLogo size="lg" asLink={false} />
          </div>
          <h1 className="bg-gradient-to-b from-white to-white/70 bg-clip-text text-3xl font-semibold tracking-tight text-transparent">
            {title}
          </h1>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            {subtitle}
          </p>
        </header>

        <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_0_0_1px_oklch(1_0_0/0.04),0_8px_40px_oklch(0_0_0/0.45),0_0_80px_oklch(var(--primary)/0.08)] backdrop-blur-2xl sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/80 to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-b from-primary/15 via-transparent to-transparent"
          />

          <div className="relative w-full min-w-0">{children}</div>
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          <Link to="/" className={authLinkClassName}>
            ← Voltar para o site
          </Link>
        </p>
      </div>
    </div>
  );
}

export function AuthSpinner() {
  return (
    <div className="dark flex min-h-svh items-center justify-center bg-[#050508]">
      <div className="size-8 animate-spin rounded-full border-2 border-white/10 border-t-primary" />
    </div>
  );
}
