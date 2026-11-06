import { randomBytes, randomUUID } from "node:crypto";
import type postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { SecretDecryptError } from "@/lib/crypto/secrets";
import { resetEnvForTests } from "@/lib/env";
import {
  listCredentials,
  maskSecret,
  readCredentialSecret,
  rotateCredentials,
  saveCredential,
} from "@/lib/tenant/credentials";
import { connectOwner } from "./tenant-helpers";

const SECRET = "sk_test_51abcdefghijklmnopWXYZ";

describe("credenciais por tenant", () => {
  let owner: postgres.Sql;
  const tenantA = randomUUID();
  const tenantB = randomUUID();

  beforeAll(async () => {
    owner = connectOwner();

    await owner`
      insert into organization (id, name, slug) values
        (${tenantA}, 'A', ${`cred-a-${tenantA}`}),
        (${tenantB}, 'B', ${`cred-b-${tenantB}`})
    `;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvForTests();
  });

  afterAll(async () => {
    await owner`delete from organization where id in (${tenantA}, ${tenantB})`;
    await owner.end();
  });

  const save = (tenantId: string) =>
    saveCredential(tenantId, {
      provider: "stripe",
      label: "Conta principal",
      secret: SECRET,
    });

  async function rawRow(id: string) {
    return owner.begin(async (tx) => {
      await tx`select set_config('app.bypass_tenant', 'on', true)`;
      const [row] = await tx<{ encrypted_secret: Buffer; key_version: number }[]>`
        select encrypted_secret, key_version from tenant_payment_credential
        where id = ${id}
      `;
      return row;
    });
  }

  it("grava cifrado, no formato v1", async () => {
    const { id } = await save(tenantA);

    const row = await rawRow(id);
    const stored = row?.encrypted_secret.toString("utf8") ?? "";

    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain("sk_test");
    expect(row?.key_version).toBe(1);
  });

  it("lê para uso interno", async () => {
    const { id } = await save(tenantA);

    await expect(readCredentialSecret(tenantA, id)).resolves.toBe(SECRET);
  });

  it("a lista mostra só os 4 últimos caracteres", async () => {
    await save(tenantB);

    const [item] = await listCredentials(tenantB);

    expect(item).toMatchObject({
      provider: "stripe",
      label: "Conta principal",
      sandbox: false,
      keyVersion: 1,
      hint: "••••WXYZ",
    });
    expect(JSON.stringify(item)).not.toContain("sk_test");
  });

  it("segredo curto não mostra nada", () => {
    expect(maskSecret("abc123")).toBe("••••");
  });

  it("não atravessa tenants", async () => {
    const { id } = await save(tenantA);

    await expect(readCredentialSecret(tenantB, id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await listCredentials(tenantB)).map((item) => item.id)).not.toContain(id);
  });

  it("cifra copiada para outra linha não decifra", async () => {
    const { id } = await save(tenantA);
    const other = await save(tenantB);
    const source = await rawRow(id);

    await owner.begin(async (tx) => {
      await tx`select set_config('app.bypass_tenant', 'on', true)`;
      await tx`
        update tenant_payment_credential
        set encrypted_secret = ${source?.encrypted_secret as Buffer}
        where id = ${other.id}
      `;
    });

    await expect(readCredentialSecret(tenantB, other.id)).rejects.toBeInstanceOf(
      SecretDecryptError,
    );

    await owner.begin(async (tx) => {
      await tx`select set_config('app.bypass_tenant', 'on', true)`;
      await tx`delete from tenant_payment_credential where id = ${other.id}`;
    });
  });

  it("falha com a chave errada", async () => {
    const { id } = await save(tenantA);

    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    resetEnvForTests();

    await expect(readCredentialSecret(tenantA, id)).rejects.toBeInstanceOf(
      SecretDecryptError,
    );
  });

  it("rotação recifra para a versão nova e é idempotente", async () => {
    const { id } = await save(tenantA);
    const current = process.env.CREDENTIALS_ENCRYPTION_KEY as string;

    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY_PREVIOUS", current);
    vi.stubEnv("CREDENTIALS_KEY_VERSION", "2");
    resetEnvForTests();

    const { rotated } = await rotateCredentials();

    expect(rotated).toBeGreaterThan(0);
    expect((await rotateCredentials()).rotated).toBe(0);

    const row = await rawRow(id);
    expect(row?.key_version).toBe(2);
    expect(row?.encrypted_secret.toString("utf8")).toMatch(/^v2:/);
    await expect(readCredentialSecret(tenantA, id)).resolves.toBe(SECRET);

    // A chave antiga já pode sair.
    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY_PREVIOUS", "");
    resetEnvForTests();

    await expect(readCredentialSecret(tenantA, id)).resolves.toBe(SECRET);

    // As linhas ficam na chave do teste: as demais suítes voltam à do ambiente.
    await owner.begin(async (tx) => {
      await tx`select set_config('app.bypass_tenant', 'on', true)`;
      await tx`
        delete from tenant_payment_credential
        where tenant_id in (${tenantA}, ${tenantB})
      `;
    });
  });
});
