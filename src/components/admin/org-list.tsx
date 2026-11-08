import { Link } from "react-router";

export type OrgRef = { id: string; name: string; role?: string; status?: string };

/**
 * Organizações citadas em uma linha: nome com link para o detalhe, rótulo opcional e, se
 * houver mais do que a API trouxe, "+N" (para `moreHref` quando existe). admin-crud A.
 */
export function OrgList({
  organizations,
  more,
  moreHref,
  label,
}: {
  organizations: OrgRef[];
  more: number;
  moreHref?: string;
  label?: (org: OrgRef) => string | null;
}) {
  if (organizations.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <ul className="flex flex-wrap gap-x-2 gap-y-1">
      {organizations.map((org) => {
        const suffix = label?.(org);

        return (
          <li key={org.id}>
            <Link
              to={`/admin/tenants/${org.id}`}
              className="text-primary hover:underline"
            >
              {org.name}
            </Link>
            {suffix ? (
              <span className="ml-1 text-xs text-muted-foreground">({suffix})</span>
            ) : null}
          </li>
        );
      })}
      {more > 0 ? (
        <li>
          {moreHref ? (
            <Link
              to={moreHref}
              className="text-sm text-muted-foreground hover:underline"
              aria-label={`Mais ${more} organizações`}
            >
              +{more}
            </Link>
          ) : (
            <span className="text-sm text-muted-foreground">+{more}</span>
          )}
        </li>
      ) : null}
    </ul>
  );
}
