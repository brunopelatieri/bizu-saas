import { describe, expect, it, vi } from "vitest";
import { checkReady } from "@/api/ready";

vi.spyOn(console, "error").mockImplementation(() => {});

const up = async () => undefined;

describe("checkReady", () => {
  it("ok quando banco e fila respondem", async () => {
    expect(await checkReady({ db: up, jobs: up })).toEqual({ ok: true, db: true, jobs: true });
  });

  it("aponta qual dependência falhou", async () => {
    const down = async () => {
      throw new Error("fila fora");
    };

    expect(await checkReady({ db: up, jobs: down })).toEqual({ ok: false, db: true, jobs: false });
  });

  it("estoura o timeout em dependência que não responde", async () => {
    const hang = () => new Promise<never>(() => {});

    const result = await checkReady({ db: hang, jobs: up }, 50);

    expect(result).toEqual({ ok: false, db: false, jobs: true });
  });
});
