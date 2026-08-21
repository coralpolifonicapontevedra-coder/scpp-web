import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'apps-script-preview', 'Código.js');
if (!fs.existsSync(file)) {
  throw new Error('Non se atopou apps-script-preview/Código.js. Executa antes clasp pull de Pruebas.');
}

let source = fs.readFileSync(file, 'utf8');
const name = 'comprobarFollaAceptacion';
const marker = `function ${name}(`;
const start = source.indexOf(marker);
if (start === -1) {
  throw new Error(`Non se atopou function ${name}() en Código.js.`);
}
if (source.indexOf(marker, start + marker.length) !== -1) {
  throw new Error(`Hai máis dunha definición de ${name}() en Código.js.`);
}

const open = source.indexOf('{', start);
if (open === -1) throw new Error(`Non se puido localizar a apertura de ${name}().`);

let depth = 0;
let quote = null;
let escaped = false;
let lineComment = false;
let blockComment = false;
let end = -1;

for (let i = open; i < source.length; i += 1) {
  const ch = source[i];
  const next = source[i + 1];

  if (lineComment) {
    if (ch === '\n') lineComment = false;
    continue;
  }
  if (blockComment) {
    if (ch === '*' && next === '/') {
      blockComment = false;
      i += 1;
    }
    continue;
  }
  if (quote) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === quote) quote = null;
    continue;
  }
  if (ch === '/' && next === '/') {
    lineComment = true;
    i += 1;
    continue;
  }
  if (ch === '/' && next === '*') {
    blockComment = true;
    i += 1;
    continue;
  }
  if (ch === "'" || ch === '"' || ch === '`') {
    quote = ch;
    continue;
  }
  if (ch === '{') depth += 1;
  if (ch === '}') {
    depth -= 1;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
}

if (end === -1) throw new Error(`Non se puido localizar o peche de ${name}().`);

const replacement = `function comprobarFollaAceptacion() {
  const libroAceptacion = SpreadsheetApp.openById(
    '1gndQQ1AFQLtg2lUU8ANa5ksU3U6wZNxJI2Ye6z7Mu7k'
  );

  const follaAceptacion =
    libroAceptacion.getSheetById(974695665);

  if (!follaAceptacion) {
    throw new Error(
      'Non se atopou a pestana co identificador 974695665'
    );
  }

  const cabeceiras = follaAceptacion
    .getRange(
      1,
      1,
      1,
      follaAceptacion.getLastColumn()
    )
    .getValues()[0];

  console.log(
    'Pestana correcta: ' +
    follaAceptacion.getName()
  );

  console.log(
    'Cabeceiras: ' +
    cabeceiras.join(' | ')
  );
}`;

source = source.slice(0, start) + replacement + source.slice(end);

if (/obterPropiedadeObrigatoria_\(\s*['"](?:ACEPTACION_SPREADSHEET_ID|ACEPTACION_SHEET_ID|TEXTOS_LEGAIS_SHEET_ID)['"]\s*\)/.test(source)) {
  throw new Error('Aínda quedan dependencias de propiedades de aceptación en Código.js. Non se modificou o ficheiro.');
}

fs.writeFileSync(file, source, 'utf8');
console.log('Helper de diagnóstico de aceptación aliñado con Produción.');
console.log('Xa non quedan referencias a propiedades ACEPTACION/TEXTOS_LEGAIS en Código.js.');
console.log('Non se modificou ningún outro ficheiro.');
