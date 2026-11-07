import { crc32, deflateRawSync } from "node:zlib";

/**
 * Zip mínimo (um disco, sem criptografia, deflate), o bastante para a exportação LGPD sem
 * dependência nova. Nomes em UTF-8. Cada arquivo cabe em memória: a exportação é JSON de uma
 * pessoa, não de um tenant inteiro.
 */

export type ZipEntry = { name: string; data: Buffer };

const UTF8_FLAG = 0x0800;
const DEFLATE = 8;

/** Data e hora no formato MS-DOS que o zip espera. */
function dosDateTime(date: Date) {
  const time =
    (date.getUTCHours() << 11) |
    (date.getUTCMinutes() << 5) |
    Math.floor(date.getUTCSeconds() / 2);
  const day =
    ((Math.max(date.getUTCFullYear(), 1980) - 1980) << 9) |
    ((date.getUTCMonth() + 1) << 5) |
    date.getUTCDate();

  return { time, day };
}

export function createZip(entries: ZipEntry[], now = new Date()): Buffer {
  const { time, day } = dosDateTime(now);
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const fileName = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data);
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(DEFLATE, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, fileName, compressed);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(UTF8_FLAG, 8);
    header.writeUInt16LE(DEFLATE, 10);
    header.writeUInt16LE(time, 12);
    header.writeUInt16LE(day, 14);
    header.writeUInt32LE(checksum, 16);
    header.writeUInt32LE(compressed.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(fileName.length, 28);
    header.writeUInt32LE(offset, 42);

    central.push(header, fileName);
    offset += local.length + fileName.length + compressed.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, directory, end]);
}
