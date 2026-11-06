import { logError } from "@/api/log";

const pending = new Set<Promise<void>>();

/**
 * Roda sem segurar a resposta: o tempo de cadastro, reenvio e reset não pode variar
 * com a existência do e-mail (`spec-seguranca.md`). Falha vai para o log, nunca para
 * quem pediu. Também é o `advanced.backgroundTasks` do Better Auth.
 */
export function runInBackground(task: Promise<unknown>) {
  const tracked: Promise<void> = task
    .then(() => undefined)
    .catch((error: unknown) => logError("Falha em tarefa de autenticação", error))
    .finally(() => pending.delete(tracked));

  pending.add(tracked);
}

/** Espera o que está em andamento. Usada por testes. */
export async function waitForBackgroundTasks() {
  while (pending.size > 0) await Promise.all(pending);
}
