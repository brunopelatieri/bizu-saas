import { type ReactNode, useId } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldProps = {
  label: string;
  hint?: ReactNode;
  className?: string;
  /** Recebe o `id` que liga o rótulo ao campo. */
  children: (id: string) => ReactNode;
};

/** Rótulo + campo + dica, com `htmlFor` ligado. */
export function Field({ label, hint, className, children }: FieldProps) {
  const id = useId();

  return (
    <div className={cn("grid gap-1 text-sm", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
