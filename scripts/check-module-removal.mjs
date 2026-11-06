#!/usr/bin/env node
// Prova que um módulo de pagamento sai apagando a pasta: tira `providers/<id>/` do lugar,
// roda typecheck e testes sem ele e devolve a pasta, mesmo se algo falhar.
//
//   npm run check:module-removal -- stripe

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

const id = process.argv[2] ?? "stripe";

if (!/^[a-z]+$/.test(id)) {
  console.error(`Id de módulo inválido: ${id}`);
  process.exit(1);
}

const moduleDir = path.join("src", "lib", "payments", "providers", id);
const parkingDir = ".tmp-module-removal";
const parked = path.join(parkingDir, id);

if (!existsSync(moduleDir)) {
  console.error(`Módulo não encontrado: ${moduleDir}`);
  process.exit(1);
}

function restore() {
  if (existsSync(parked)) renameSync(parked, moduleDir);
  rmSync(parkingDir, { recursive: true, force: true });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    restore();
    process.exit(1);
  });
}

function run(script) {
  console.log(`\n> npm run ${script}, sem ${moduleDir}`);

  const { status } = spawnSync(`npm run ${script}`, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, PAYMENT_PROVIDERS: "" },
  });

  return status === 0;
}

mkdirSync(parkingDir, { recursive: true });
renameSync(moduleDir, parked);

let ok = false;
try {
  ok = run("typecheck") && run("test");
} finally {
  restore();
}

console.log(
  ok
    ? `\nOK: o sistema compila e passa nos testes sem o módulo ${id}.`
    : `\nFALHOU: algo fora de ${moduleDir} ainda depende do módulo.`,
);
process.exit(ok ? 0 : 1);
