import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/next-path";

describe("safeNextPath", () => {
  it("mantém caminhos internos, com query", () => {
    expect(safeNextPath("/app/equipe?aba=convites")).toBe(
      "/app/equipe?aba=convites",
    );
  });

  it.each([
    null,
    undefined,
    "",
    "app",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/app\\..\\evil",
  ])("cai no padrão com %s", (next) => {
    expect(safeNextPath(next)).toBe("/app");
  });
});
