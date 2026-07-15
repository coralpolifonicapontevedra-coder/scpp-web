import sharp from "sharp";
import { readdir } from "node:fs/promises";
import { extname, basename } from "node:path";

const archivos = await readdir(".");

const imagenes = archivos.filter((archivo) =>
  [".jpg", ".jpeg"].includes(extname(archivo).toLowerCase())
);

if (imagenes.length === 0) {
  console.log("Non se atoparon imaxes JPG nesta carpeta.");
  process.exit(0);
}

for (const archivo of imagenes) {
  const destino = `${basename(archivo, extname(archivo))}.webp`;

  await sharp(archivo)
    .rotate()
    .webp({ quality: 80 })
    .toFile(destino);

  console.log(`Convertida: ${archivo} → ${destino}`);
}

console.log(`\nConversión rematada: ${imagenes.length} imaxe(s).`);