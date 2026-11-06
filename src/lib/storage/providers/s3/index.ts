import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { assertSafeKey } from "@/lib/storage/keys";
import type { StorageModule, StorageProvider } from "@/lib/storage/types";

export type S3Options = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** Mínimo de `S3Client` de que o provedor precisa: os testes injetam um falso. */
export type S3Sender = { send(command: unknown): Promise<unknown> };

/**
 * Provedor S3 (`STORAGE_PROVIDER=s3`), compatível com MinIO e outros por `S3_ENDPOINT`. Com
 * endpoint próprio, usa endereçamento por caminho (`/bucket/chave`), que o MinIO exige.
 */
export function createS3Provider(
  options: S3Options,
  client: S3Sender = new S3Client({
    region: options.region,
    endpoint: options.endpoint,
    forcePathStyle: Boolean(options.endpoint),
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
  }) as unknown as S3Sender,
): StorageProvider {
  const { bucket } = options;

  return {
    id: "s3",

    async put(key, body, { contentType } = {}) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: assertSafeKey(key),
          Body: body,
          ContentType: contentType,
        }),
      );
    },

    async get(key): Promise<Readable | null> {
      try {
        const output = (await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: assertSafeKey(key) }),
        )) as { Body?: unknown };

        return (output.Body as Readable | undefined) ?? null;
      } catch (error) {
        if ((error as { name?: string }).name === "NoSuchKey") return null;
        throw error;
      }
    },

    async delete(key) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: assertSafeKey(key) }),
      );
    },
  };
}

const s3Module: StorageModule = {
  id: "s3",
  createProvider: (env) =>
    createS3Provider({
      bucket: env.S3_BUCKET ?? "",
      region: env.S3_REGION ?? "",
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "",
    }),
};

export default s3Module;
