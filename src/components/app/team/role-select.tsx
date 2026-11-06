import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isOwner } from "@/lib/auth/permissions";
import { useAuth } from "@/providers/auth-provider";
import type { RoleOption } from "@/components/app/team/team-api";

type RoleSelectProps = {
  roles: RoleOption[];
  value: string;
  onChange: (role: string) => void;
  disabled?: boolean;
  className?: string;
};

/** Só o owner vê "Proprietário": o servidor recusa o resto de qualquer forma. */
export function RoleSelect({
  roles,
  value,
  onChange,
  disabled,
  className,
}: RoleSelectProps) {
  const { tenant } = useAuth();
  const items = roles
    .filter(({ name }) => name !== "owner" || isOwner(tenant?.role ?? ""))
    .map(({ name, label }) => ({ value: name, label }));

  return (
    <Select
      items={items}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next) onChange(next);
      }}
    >
      <SelectTrigger aria-label="Papel" className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
