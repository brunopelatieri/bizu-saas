import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AUDIT_ACTION_GROUPS } from "@/lib/constants/audit-labels";

const ALL = "all";

type Option = { value: string; label: string };

function FilterSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  const items = [{ value: ALL, label }, ...options];

  return (
    <Select
      items={items}
      value={value || ALL}
      onValueChange={(next) => onChange(!next || next === ALL ? "" : next)}
    >
      <SelectTrigger aria-label={label} className="w-52">
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

export function AuditActionFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <FilterSelect
      label="Todas as ações"
      options={AUDIT_ACTION_GROUPS}
      value={value}
      onChange={onChange}
    />
  );
}

export function AuditActorFilter({
  options,
  value,
  onChange,
}: {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <FilterSelect
      label="Todas as pessoas"
      options={options}
      value={value}
      onChange={onChange}
    />
  );
}
