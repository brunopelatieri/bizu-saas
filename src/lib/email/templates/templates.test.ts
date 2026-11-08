import { describe, expect, it } from "vitest";
import { loadTemplates } from "@/lib/email/template-catalog";
import { assertAbsoluteUrl } from "@/lib/email/templates/format";
import { inviteMemberTemplate } from "@/lib/email/templates/invite-member";

const { templates, missingPreview } = await loadTemplates();

const EXPECTED_GENERAL = [
  "invite-member",
  "portal-invite",
  "portal-magic-link",
  "trial-ending",
  "trial-expired",
  "invoice-created",
  "payment-failed",
  "payment-received",
  "subscription-canceled",
  "impersonation-requested",
  "impersonation-started",
  "data-export-ready",
  "deletion-scheduled",
  "tenant-suspended",
  "deletion-executed",
  "email-changed",
];

describe("catálogo de templates", () => {
  it("tem todos os templates gerais da fase 3", () => {
    const ids = templates.map((t) => t.id);
    for (const id of EXPECTED_GENERAL) expect(ids).toContain(id);
  });

  it("todo template tem previewInput", () => {
    expect(missingPreview).toEqual([]);
  });
});

describe.each(templates.map((t) => [t.id, t] as const))("template %s", (_id, template) => {
  it("tem assunto, versão em texto e HTML completo", () => {
    const rendered = template.render(template.previewInput as never);

    expect(rendered.subject.trim().length).toBeGreaterThan(0);
    expect(rendered.subject).not.toMatch(/[\r\n]/);
    expect(rendered.text.trim().length).toBeGreaterThan(0);
    expect(rendered.html).toContain("<!doctype html>");
  });

  it("só tem links absolutos", () => {
    const { html, text } = template.render(template.previewInput as never);

    for (const [, href] of html.matchAll(/href="([^"]*)"/g)) {
      expect(href).toMatch(/^https?:\/\//);
    }
    // Botão de ação: o mesmo link vai na versão texto.
    if (html.includes("<a ")) expect(text).toMatch(/https?:\/\//);
  });

  it("escapa HTML vindo dos dados", () => {
    const hostile = Object.fromEntries(
      Object.entries(template.previewInput as Record<string, unknown>).map(
        ([key, value]) => [
          key,
          typeof value === "string" && !value.startsWith("http")
            ? '<img src=x onerror="alert(1)">'
            : value,
        ],
      ),
    );

    const { html } = template.render(hostile as never);

    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
  });
});

describe("links dos templates", () => {
  it("recusa link relativo", () => {
    expect(() => assertAbsoluteUrl("/convite/abc")).toThrow(/absoluto/);
    expect(() =>
      inviteMemberTemplate({
        inviterName: "Ana",
        tenantName: "Acme",
        roleLabel: "Colaborador",
        url: "/convite/abc",
        expiresInDays: 7,
      }),
    ).toThrow(/absoluto/);
  });

  it("usa o nome do tenant no assunto e mantém o link do convite", () => {
    const rendered = inviteMemberTemplate({
      inviterName: "Ana",
      tenantName: "Acme Ltda",
      roleLabel: "Colaborador",
      url: "https://app.exemplo.com.br/convite/abc?x=1&y=2",
      expiresInDays: 7,
    });

    expect(rendered.subject).toContain("Acme Ltda");
    expect(rendered.html).toContain('href="https://app.exemplo.com.br/convite/abc?x=1&amp;y=2"');
    expect(rendered.text).toContain("https://app.exemplo.com.br/convite/abc?x=1&y=2");
  });
});
