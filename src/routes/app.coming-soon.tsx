import type { MetaFunction } from "react-router";
import { useLocation } from "react-router";
import { dashboardTitleFromPath } from "@/lib/constants/dashboard-nav";

export const meta: MetaFunction = () => [
  { title: "Em breve — Bizu SaaS" },
  { name: "robots", content: "noindex" },
];

export default function ComingSoon() {
  const { pathname } = useLocation();
  const title = dashboardTitleFromPath(pathname);

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <span className="text-2xl">🚧</span>
      </div>
      <h2 className="mb-2 text-xl font-semibold text-foreground">{title}</h2>
      <p className="max-w-xs text-sm text-muted-foreground">
        Esta seção está sendo construída. Em breve estará disponível.
      </p>
    </div>
  );
}
