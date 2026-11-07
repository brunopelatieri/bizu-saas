import { data } from "react-router";
import { LegalPage } from "@/pages/legal-page";
import { siteConfig } from "@/lib/constants/navigation";
import {
  isLegalSlug,
  loadLegalDocument,
} from "@/lib/legal/documents.server";
import { buildMeta } from "@/lib/seo";
import type { Route } from "./+types/legal";

// Texto público e indexável: markdown lido e renderizado no servidor, sem dado de usuário.
export async function loader({ params }: Route.LoaderArgs) {
  if (!isLegalSlug(params.slug)) throw data("Não encontrado", { status: 404 });

  return { slug: params.slug, document: await loadLegalDocument(params.slug) };
}

export const meta: Route.MetaFunction = ({ loaderData }) =>
  loaderData
    ? buildMeta({
        title: `${loaderData.document.title} — ${siteConfig.name}`,
        description: loaderData.document.description,
        path: `/legal/${loaderData.slug}`,
      })
    : buildMeta({ title: "Não encontrado", description: "", robots: "noindex" });

export default function Legal({ loaderData }: Route.ComponentProps) {
  return <LegalPage document={loaderData.document} />;
}
