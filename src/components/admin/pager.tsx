import { Button } from "@/components/ui/button";

type PagerProps = {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
};

export function Pager({ page, total, pageSize, onPage }: PagerProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex items-center justify-between pt-3 text-sm text-muted-foreground">
      <span>
        {total} {total === 1 ? "resultado" : "resultados"}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Anterior
        </Button>
        <span>
          {page} / {pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
