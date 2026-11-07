import { createLogger, setLoggerForTests } from "@/lib/logger";

/**
 * Só para testes: troca o logger por um que guarda as linhas JSON em memória.
 * `restore()` devolve o logger padrão.
 */
export function captureLogs(level = "debug") {
  const lines: Array<Record<string, unknown>> = [];

  setLoggerForTests(
    createLogger({
      level,
      stream: { write: (line: string) => void lines.push(JSON.parse(line)) },
    }),
  );

  return {
    lines,
    /** Tudo o que foi logado, como um texto só (para `toContain`). */
    text: () => JSON.stringify(lines),
    clear: () => void lines.splice(0),
    restore: () => setLoggerForTests(undefined),
  };
}
