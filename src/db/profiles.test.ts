import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  selected: [] as unknown[],
  onConflictDoUpdate: vi.fn(),
  values: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: async () => db.selected }) }),
    insert: () => ({
      values: (values: unknown) => {
        db.values(values);
        return {
          onConflictDoUpdate: (config: unknown) => {
            db.onConflictDoUpdate(config);
            return { returning: async () => [values] };
          },
        };
      },
    }),
  }),
}));

const { syncProfile } = await import("@/db/profiles");

const user = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "ana@example.com",
  user_metadata: { full_name: "Ana", phone: "11999999999" },
} as unknown as User;

const mirrored = {
  id: user.id,
  email: "ana@example.com",
  fullName: "Ana",
  phone: "11999999999",
};

describe("syncProfile", () => {
  beforeEach(() => {
    db.selected = [];
    db.values.mockClear();
    db.onConflictDoUpdate.mockClear();
  });

  it("cria o perfil com os dados do Auth", async () => {
    await expect(syncProfile(user)).resolves.toEqual(mirrored);
    expect(db.values).toHaveBeenCalledWith(mirrored);
  });

  it("não grava quando nada mudou", async () => {
    db.selected = [mirrored];

    await expect(syncProfile(user)).resolves.toBe(mirrored);
    expect(db.values).not.toHaveBeenCalled();
  });

  it.each([
    ["email", "antigo@example.com"],
    ["fullName", "Nome antigo"],
    ["phone", null],
  ])("atualiza quando %s mudou no Auth", async (field, value) => {
    db.selected = [{ ...mirrored, [field]: value }];

    await syncProfile(user);

    expect(db.onConflictDoUpdate).toHaveBeenCalledOnce();
  });

  it("ignora metadados que não são texto", async () => {
    const profile = await syncProfile({
      ...user,
      user_metadata: { full_name: 123 },
    } as unknown as User);

    expect(profile).toMatchObject({ fullName: null, phone: null });
  });
});
