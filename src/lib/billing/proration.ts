/**
 * Diferença a cobrar num upgrade, para provedor que não prorrateia: a parte do período
 * que falta, ao preço novo menos o antigo. Downgrade nunca gera valor: ele espera o fim
 * do período (`spec-billing.md`).
 */
export function prorationCents(input: {
  currentAmountCents: number;
  newAmountCents: number;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}) {
  const total = input.periodEnd.getTime() - input.periodStart.getTime();
  const left = input.periodEnd.getTime() - input.now.getTime();
  const difference = input.newAmountCents - input.currentAmountCents;

  if (total <= 0 || left <= 0 || difference <= 0) return 0;

  return Math.round((difference * Math.min(left, total)) / total);
}
