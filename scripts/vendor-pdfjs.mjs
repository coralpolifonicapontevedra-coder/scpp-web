import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const VERSION = '3.11.174';
const BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSION}/build`;
const ASSETS = [
  ['pdf.min.js', 'public/vendor/pdfjs/pdf.min.js'],
  ['pdf.worker.min.js', 'public/vendor/pdfjs/pdf.worker.min.js'],
];

for (const [name, destination] of ASSETS) {
  const response = await fetch(`${BASE}/${name}`);
  if (!response.ok) {
    throw new Error(`Non foi posible descargar ${name}: HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const target = resolve(destination);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  console.log(`PDF.js vendorizado: ${destination}`);
}
