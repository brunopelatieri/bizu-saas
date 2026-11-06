import { Badge } from "@/components/ui/badge";
import {
  CUSTOMER_STATUS_LABELS,
  type CustomerStatus,
} from "@/lib/tenant/customer-constants";

const VARIANTS = {
  lead: "outline",
  active: "secondary",
  blocked: "destructive",
} as const;

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  return <Badge variant={VARIANTS[status]}>{CUSTOMER_STATUS_LABELS[status]}</Badge>;
}
