import { DrizzleQueryError } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { logError } from "@/api/log";
import { createLogger, setLoggerForTests, withRequestId } from "@/lib/logger";
import {
  type MonitoringModule,
  scrubMessage,
  setMonitoringForTests,
  toSafeError,
} from "@/lib/observability";

function capture(level = "debug") {
  const lines: Array<Record<string, unknown>> = [];
  const logger = createLogger({
    level,
    stream: { write: (line: string) => void lines.push(JSON.parse(line)) },
  });
  setLoggerForTests(logger);
  return { lines, logger };
}

afterEach(() => {
  setLoggerForTests(undefined);
  setMonitoringForTests(undefined);
});

describe("redact do logger", () => {
  it("mascara cookie, authorization e campos pessoais", () => {
    const { lines, logger } = capture();

    logger.info(
      {
        req: {
          headers: { cookie: "bizu.session=abc", authorization: "Bearer xyz", host: "x" },
        },
        email: "ana@exemplo.com",
        user: { email: "bia@exemplo.com", document: "123.456.789-09", name: "Bia" },
        password: "senha-secreta",
        token: "tok-secreto",
      },
      "teste",
    );

    const text = JSON.stringify(lines);
    for (const leaked of [
      "bizu.session=abc",
      "Bearer xyz",
      "ana@exemplo.com",
      "bia@exemplo.com",
      "123.456.789-09",
      "senha-secreta",
      "tok-secreto",
    ]) {
      expect(text).not.toContain(leaked);
    }
    expect(lines[0]).toMatchObject({ level: "info", msg: "teste" });
  });

  it("respeita o nível e inclui o request_id da requisição", () => {
    const { lines, logger } = capture("warn");

    withRequestId("req-abc-123", () => {
      logger.info("abaixo do nível");
      logger.warn("no nível");
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ msg: "no nível", request_id: "req-abc-123" });
  });
});

describe("logError", () => {
  it("não deixa e-mail da query do Drizzle chegar ao log", () => {
    const { lines } = capture();
    const cause = Object.assign(new Error("duplicate key for ana@exemplo.com"), {
      code: "23505",
    });
    const error = new DrizzleQueryError(
      'insert into "user" ("email") values ($1)',
      ["ana@exemplo.com"],
      cause,
    );

    logError("Falha ao salvar", error);

    const text = JSON.stringify(lines);
    expect(text).not.toContain("ana@exemplo.com");
    expect(text).not.toContain("insert into");
    expect(lines[0]).toMatchObject({ msg: "Falha ao salvar", error: { code: "23505" } });
  });

  it("mantém a mensagem de erros comuns, sem e-mail nem credencial de URL", () => {
    const { lines } = capture();

    logError(
      "Falha",
      new Error("convite para bia@exemplo.com em postgres://user:pass@host/db"),
    );

    const text = JSON.stringify(lines);
    expect(text).not.toContain("bia@exemplo.com");
    expect(text).not.toContain("user:pass");
    expect(text).toContain("convite para ***@***");
  });

  it("envia ao módulo de monitoramento só o erro sanitizado", () => {
    capture();
    const sent: Array<{ error: Error; context: string }> = [];
    const module: MonitoringModule = {
      id: "fake",
      init: () => {},
      capture: (error, context) => sent.push({ error, context }),
      flush: async () => {},
    };
    setMonitoringForTests(module);

    logError(
      "Contexto",
      new DrizzleQueryError(
        "select * from x where email = $1",
        ["ana@exemplo.com"],
        new Error("x"),
      ),
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]?.context).toBe("Contexto");
    expect(sent[0]?.error.message).not.toContain("ana@exemplo.com");
    expect(sent[0]?.error.stack).not.toContain("select * from");
  });
});

describe("scrubMessage e toSafeError", () => {
  it("mascara e-mails em qualquer ponto do texto", () => {
    expect(scrubMessage("a ana@x.com.br e b+c@y.io")).toBe("a ***@*** e ***@***");
  });

  it("não deixa texto livre de erro desconhecido passar", () => {
    expect(toSafeError("texto com ana@x.com").message).toBe("UnknownError");
  });
});
