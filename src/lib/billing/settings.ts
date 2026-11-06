import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { platformSetting } from "@/db/schema";

/** Configurações da plataforma, editadas em `/admin/configuracoes`. */
export type PlatformSettings = {
  /** Plano que o tenant recebe ao nascer. `null`: o primeiro plano gratuito ativo. */
  trialPlanId: string | null;
  /** 0 = sem trial; vale com plano gratuito (gratuito sem fim). */
  trialDays: number;
  /** Dias entre o fim do trial e o `read_only`. */
  graceDays: number;
};

export const SETTING_DEFAULTS: PlatformSettings = {
  trialPlanId: null,
  trialDays: 14,
  graceDays: 7,
};

/** Chave em `platform_setting` de cada campo (`spec-dados.md`). */
export const SETTING_KEYS = {
  trialPlanId: "trial_plan_id",
  trialDays: "trial_days",
  graceDays: "grace_days",
} as const satisfies Record<keyof PlatformSettings, string>;

const asCount = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : fallback;

/** Valor ausente ou malformado cai no padrão: a plataforma nunca fica sem configuração. */
export function parseSettings(
  rows: ReadonlyArray<{ key: string; value: unknown }>,
): PlatformSettings {
  const byKey = new Map(rows.map(({ key, value }) => [key, value]));
  const planId = byKey.get(SETTING_KEYS.trialPlanId);

  return {
    trialPlanId: typeof planId === "string" ? planId : null,
    trialDays: asCount(byKey.get(SETTING_KEYS.trialDays), SETTING_DEFAULTS.trialDays),
    graceDays: asCount(byKey.get(SETTING_KEYS.graceDays), SETTING_DEFAULTS.graceDays),
  };
}

export async function loadSettings(): Promise<PlatformSettings> {
  const rows = await getDb()
    .select({ key: platformSetting.key, value: platformSetting.value })
    .from(platformSetting)
    .where(inArray(platformSetting.key, Object.values(SETTING_KEYS)));

  return parseSettings(rows);
}

export async function saveSettings(
  patch: Partial<PlatformSettings>,
  updatedBy: string | null,
) {
  const entries = (
    Object.keys(SETTING_KEYS) as Array<keyof PlatformSettings>
  ).flatMap((field) =>
    patch[field] === undefined
      ? []
      : [{ key: SETTING_KEYS[field], value: patch[field], updatedBy }],
  );

  if (entries.length === 0) return;

  await getDb().transaction(async (tx) => {
    for (const entry of entries) {
      await tx
        .insert(platformSetting)
        .values(entry)
        .onConflictDoUpdate({
          target: platformSetting.key,
          set: { value: entry.value, updatedBy, updatedAt: new Date() },
        });
    }
  });
}
