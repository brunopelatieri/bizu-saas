import { describe, expect, it } from "vitest";
import { createS3Provider } from "@/lib/storage/providers/s3";

describe("provedor s3", () => {
  it("monta os comandos com bucket e chave validada", async () => {
    const sent: Array<{ name: string; input: Record<string, unknown> }> = [];
    const s3 = createS3Provider(
      { bucket: "b", region: "r", accessKeyId: "k", secretAccessKey: "s" },
      {
        async send(command) {
          const { input } = command as { input: Record<string, unknown> };
          const name = (command as object).constructor.name;
          sent.push({ name, input });
          if (name === "GetObjectCommand") {
            throw Object.assign(new Error("x"), { name: "NoSuchKey" });
          }
          return {};
        },
      },
    );

    await s3.put("t/obj", Buffer.from("x"), { contentType: "image/png" });
    expect(await s3.get("t/obj")).toBeNull();
    await s3.delete("t/obj");
    await expect(s3.put("../x", Buffer.from("x"))).rejects.toThrow();

    expect(sent.map(({ name }) => name)).toEqual([
      "PutObjectCommand",
      "GetObjectCommand",
      "DeleteObjectCommand",
    ]);
    expect(sent[0]?.input).toMatchObject({ Bucket: "b", Key: "t/obj", ContentType: "image/png" });
  });
});
