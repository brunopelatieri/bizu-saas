import { describe, expect, it } from "vitest";
import { dueDunningNotice } from "@/lib/billing/dunning";
import { prorationCents } from "@/lib/billing/proration";
import { DAY_MS } from "@/lib/billing/trial";

const periodStart = new Date("2026-11-01T00:00:00Z");
const periodEnd = new Date("2026-12-01T00:00:00Z");
const at = (day: number) => new Date(periodStart.getTime() + day * DAY_MS);

const base = {
  currentAmountCents: 9900,
  newAmountCents: 29900,
  periodStart,
  periodEnd,
};

describe("prorationCents", () => {
  it("no meio do período, cobra metade da diferença", () => {
    expect(prorationCents({ ...base, now: at(15) })).toBe(10000);
  });

  it("no início, a diferença inteira", () => {
    expect(prorationCents({ ...base, now: periodStart })).toBe(20000);
  });

  it("arredonda para o centavo", () => {
    expect(prorationCents({ ...base, now: at(10) })).toBe(13333);
  });

  it("no fim do período, nada", () => {
    expect(prorationCents({ ...base, now: periodEnd })).toBe(0);
  });

  it("downgrade nunca gera valor", () => {
    expect(
      prorationCents({
        ...base,
        currentAmountCents: 29900,
        newAmountCents: 9900,
        now: at(10),
      }),
    ).toBe(0);
  });

  it("período inválido não divide por zero", () => {
    expect(
      prorationCents({ ...base, periodEnd: periodStart, now: periodStart }),
    ).toBe(0);
  });

  it("antes do início, no máximo a diferença inteira", () => {
    expect(prorationCents({ ...base, now: at(-5) })).toBe(20000);
  });
});

describe("dueDunningNotice", () => {
  const graceUntil = at(10);

  it("longe do fim, nada", () => {
    expect(dueDunningNotice({ now: at(3), graceUntil })).toBeNull();
  });

  it("a três dias, t3", () => {
    expect(dueDunningNotice({ now: at(7), graceUntil })).toBe("t3");
  });

  it("no último dia, t0", () => {
    expect(dueDunningNotice({ now: at(9.5), graceUntil })).toBe("t0");
  });

  it("vencida, unpaid", () => {
    expect(dueDunningNotice({ now: at(10), graceUntil })).toBe("unpaid");
    expect(dueDunningNotice({ now: at(30), graceUntil })).toBe("unpaid");
  });
});
