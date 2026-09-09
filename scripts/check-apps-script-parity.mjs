import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const base = path.join(root, 'apps-script', 'snapshot-2026-08-19');
const productionDir = path.join(base, 'production');
const previewDir = path.join(base, 'preview');

const ENV_ONLY_PREVIEW = new Set(['configuracion-entorno.js']);
const IGNORE_FUNCTIONS = new Set([
  'configurarConcertosPortal',
  'validarConfiguracionEntorno',
  'obterPropiedadeObrigatoria_',
  'obterAmbienteSCPP_',
  'validarAccionPermitidaEntorno_'
]);

function jsFiles(dir) {
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.js'))
    .sort();
}

function functionsOf(file) {
  const text = fs.readFileSync(file, 'utf8');
  const names = new Set();
  for (const match of text.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    names.add(match[1]);
  }
  return names;
}

function unionFunctions(dir, files) {
  const all = new Set();
  for (const file of files) {
    for (const name of functionsOf(path.join(dir, file))) {
      if (!IGNORE_FUNCTIONS.has(name)) all.add(name);
    }
  }
  return all;
}

if (!fs.existsSync(productionDir) || !fs.existsSync(previewDir)) {
  throw new Error('Faltan os snapshots production/preview de Apps Script.');
}

const productionFiles = jsFiles(productionDir);
const previewFiles = jsFiles(previewDir);

const missingFiles = productionFiles.filter((name) => !previewFiles.includes(name));
const unexpectedPreview = previewFiles.filter((name) => !productionFiles.includes(name) && !ENV_ONLY_PREVIEW.has(name));

const prodFunctions = unionFunctions(productionDir, productionFiles);
const previewFunctions = unionFunctions(previewDir, previewFiles);
const missingFunctions = [...prodFunctions].filter((name) => !previewFunctions.has(name)).sort();
const previewOnlyFunctions = [...previewFunctions].filter((name) => !prodFunctions.has(name)).sort();

const result = {
  ok: missingFiles.length === 0 && missingFunctions.length === 0,
  productionFiles: productionFiles.length,
  previewFiles: previewFiles.length,
  missingFiles,
  unexpectedPreview,
  missingFunctions,
  previewOnlyFunctions,
  note: 'Preview pode diferir na configuración do ambiente, pero non debe perder funcionalidade de produción.'
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
