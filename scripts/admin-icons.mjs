import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
const source = fileURLToPath(
  new URL("../public/admin-assets/duuk-icon-source.png", import.meta.url),
);
for (const size of [32, 64, 180, 192, 512])
  await sharp(source)
    .resize(size, size, { fit: "contain" })
    .png()
    .toFile(
      fileURLToPath(
        new URL(`../public/admin-assets/icon-${size}.png`, import.meta.url),
      ),
    );
const png = await sharp(source).resize(32, 32).png().toBuffer(),
  header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header[6] = 32;
header[7] = 32;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
await writeFile(
  new URL("../public/admin-assets/favicon.ico", import.meta.url),
  Buffer.concat([header, png]),
);
