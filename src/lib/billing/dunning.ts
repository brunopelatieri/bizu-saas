import { DAY_MS } from "@/lib/billing/trial";

/**
 * Avisos da carência de `past_due`: `t3` e `t0` são os dias que faltam; `unpaid` é a
 * passagem para `read_only`, ao fim de `grace_until`.
 */
export const dunningNotices = ["t3", "t0", "unpaid"] as const;
export type DunningNotice = (typeof dunningNotices)[number];

/** O aviso mais urgente devido agora. O job roda uma vez por dia. */
export function dueDunningNotice(input: {
  now: Date;
  graceUntil: Date;
}): DunningNotice | null {
  const left = input.graceUntil.getTime() - input.now.getTime();

  if (left <= 0) return "unpaid";
  if (left <= DAY_MS) return "t0";
  if (left <= 3 * DAY_MS) return "t3";

  return null;
}
