import { inflateRawSync } from "node:zlib";

/** Lê um zip de um disco (o que `createZip` gera) e devolve nome → conteúdo. */
export function unzip(zip: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();

  // O fim do diretório central ocupa os últimos 22 bytes (sem comentário).
  const end = zip.length - 22;
  if (zip.readUInt32LE(end) !== 0x06054b50) throw new Error("zip inválido");

  const count = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);

  for (let index = 0; index < count; index += 1) {
    if (zip.readUInt32LE(cursor) !== 0x02014b50) throw new Error("diretório inválido");

    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");

    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = zip.subarray(start, start + compressedSize);

    files.set(name, method === 8 ? inflateRawSync(raw) : raw);
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}
