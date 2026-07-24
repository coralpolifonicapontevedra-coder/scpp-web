import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const postersDir = path.resolve(process.cwd(), 'public', 'img', 'concertos');
const supportedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const thumbnailSuffix = '.thumb.webp';

const existsAndIsCurrent = async (inputPath, outputPath) => {
  try {
    const [input, output] = await Promise.all([stat(inputPath), stat(outputPath)]);
    return output.size > 0 && output.mtimeMs >= input.mtimeMs;
  } catch {
    return false;
  }
};

let entries;
try {
  entries = await readdir(postersDir, { withFileTypes: true });
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.log('[carteles] No existe public/img/concertos; no hay miniaturas que generar.');
    process.exit(0);
  }
  throw error;
}

let generated = 0;
let skipped = 0;
let failed = 0;

for (const entry of entries) {
  if (!entry.isFile()) continue;

  const lowerName = entry.name.toLowerCase();
  const extension = path.extname(lowerName);
  if (!supportedExtensions.has(extension) || lowerName.endsWith(thumbnailSuffix)) continue;

  const inputPath = path.join(postersDir, entry.name);
  const outputPath = path.join(postersDir, `${entry.name}${thumbnailSuffix}`);

  if (await existsAndIsCurrent(inputPath, outputPath)) {
    skipped += 1;
    continue;
  }

  try {
    await sharp(inputPath, { failOn: 'none' })
      .rotate()
      .resize({
        width: 300,
        height: 420,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 78, effort: 5, smartSubsample: true })
      .toFile(outputPath);
    generated += 1;
  } catch (error) {
    failed += 1;
    console.warn(`[carteles] No se pudo crear la miniatura de ${entry.name}: ${error.message}`);
  }
}

console.log(
  `[carteles] Miniaturas WebP: ${generated} creadas, ${skipped} sin cambios, ${failed} con error.`,
);
