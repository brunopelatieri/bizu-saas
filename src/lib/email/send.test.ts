import { afterEach, describe, expect, it } from "vitest";
import { createMemoryProvider } from "@/lib/email/providers/memory";
import { sendEmail, setEmailProviderForTests } from "@/lib/email/send";
import { renderLayout } from "@/lib/email/templates/layout";

afterEach(() => setEmailProviderForTests(undefined));

describe("sendEmail", () => {
  it("entrega pelo provedor em memória sem tocar na rede", async () => {
    const memory = createMemoryProvider();
    setEmailProviderForTests(memory);

    const rendered = renderLayout({
      subject: "Confirme seu e-mail",
      heading: "Olá, Ana",
      paragraphs: ["Clique no botão para confirmar."],
      action: { label: "Confirmar", url: "http://localhost:5173/verificar-email?token=abc" },
    });

    const result = await sendEmail({ to: "ana@example.com", ...rendered });

    expect(result.providerMessageId).toBe("memory-1");
    expect(memory.sent).toHaveLength(1);
    expect(memory.sent[0]?.to).toBe("ana@example.com");
    expect(memory.sent[0]?.text).toContain("/verificar-email?token=abc");
  });
});

describe("renderLayout", () => {
  it("escapa HTML vindo de dados e mantém o link na versão texto", () => {
    const rendered = renderLayout({
      subject: "Teste",
      heading: "<b>Olá</b>",
      paragraphs: ['Mensagem com "aspas" & <script>'],
      action: { label: "Abrir", url: "http://localhost:5173/x?a=1&b=2" },
    });

    expect(rendered.html).toContain("&lt;b&gt;Olá&lt;/b&gt;");
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.html).toContain('href="http://localhost:5173/x?a=1&amp;b=2"');
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.text).toContain("Abrir: http://localhost:5173/x?a=1&b=2");
  });
});
