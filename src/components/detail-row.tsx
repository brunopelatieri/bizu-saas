/** Linha de rótulo e valor dentro de um `<dl>`, nas telas de cliente e do portal. */
export function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all font-medium text-foreground">{value || "–"}</dd>
    </div>
  );
}
