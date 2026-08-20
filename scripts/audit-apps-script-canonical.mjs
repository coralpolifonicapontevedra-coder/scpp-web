import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.join(process.cwd(), 'apps-script');
const EXCLUDED_DIR_PREFIXES = ['canonical-', 'snapshot-'];
const EXCLUDED_FILES = new Set(['Código.producion-reference.gs']);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (EXCLUDED_DIR_PREFIXES.some(prefix => entry.name.startsWith(prefix))) continue;
      out.push(...walk(full));
    } else if (entry.isFile() && entry.name.endsWith('.gs') && !EXCLUDED_FILES.has(entry.name)) {
      out.push({ full, rel });
    }
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

function extractFunction(text, start) {
  const brace = text.indexOf('{', start);
  if (brace < 0) return '';
  let depth = 0;
  let quote = '';
  let lineComment = false;
  let blockComment = false;
  let escaped = false;
  for (let i = brace; i < text.length; i += 1) {
    const c = text[i], n = text[i + 1] || '';
    if (lineComment) {
      if (c === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (c === '*' && n === '/') { blockComment = false; i += 1; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === '/' && n === '/') { lineComment = true; i += 1; continue; }
    if (c === '/' && n === '*') { blockComment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    if (c === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1).trim();
    }
  }
  return '';
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

if (!fs.existsSync(ROOT)) throw new Error('Non existe apps-script/');

const files = walk(ROOT);
const functions = new Map();
const hardcoded = [];
const syntaxErrors = [];
let doPostCount = 0;
let doGetCount = 0;

for (const file of files) {
  const text = fs.readFileSync(file.full, 'utf8');
  try {
    new Function(text);
  } catch (error) {
    syntaxErrors.push({ file: file.rel, error: String(error.message || error) });
  }

  const fnRe = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  let match;
  while ((match = fnRe.exec(text)) !== null) {
    const name = match[1];
    const source = extractFunction(text, match.index);
    const item = {
      file: file.rel,
      sha256: crypto.createHash('sha256').update(source).digest('hex'),
      bytes: Buffer.byteLength(source, 'utf8'),
    };
    const arr = functions.get(name) || [];
    arr.push(item);
    functions.set(name, arr);
    if (name === 'doPost') doPostCount += 1;
    if (name === 'doGet') doGetCount += 1;
  }

  // Busca calquera literal con formato plausible de ID de Google, aínda que a
  // constante e o valor estean en liñas distintas. Exclúe nomes de propiedades.
  const googleIdRe = /['"]([A-Za-z0-9_-]{25,})['"]/g;
  while ((match = googleIdRe.exec(text)) !== null) {
    const literal = match[1];
    if (/^[A-Z0-9_]+$/.test(literal)) continue;
    const line = lineNumberAt(text, match.index);
    const context = text.slice(Math.max(0, match.index - 140), Math.min(text.length, googleIdRe.lastIndex + 80));
    hardcoded.push({ file: file.rel, line, kind: 'google-id', literal, context: context.replace(/\s+/g, ' ').trim().slice(0, 260) });
  }

  // Detecta tamén IDs numéricos de pestanas cando están asignados a constantes
  // ou propiedades *_SHEET_ID, que non teñen o formato longo dun ID de Drive.
  const sheetIdRe = /(?:SHEET_ID|SheetId|sheetId)[A-Za-z0-9_]*\s*[:=]\s*['"]?(\d{6,})['"]?/g;
  while ((match = sheetIdRe.exec(text)) !== null) {
    const line = lineNumberAt(text, match.index);
    hardcoded.push({ file: file.rel, line, kind: 'sheet-id', literal: match[1], context: match[0].slice(0, 220) });
  }
}

const uniqueHardcoded = [];
const seenHardcoded = new Set();
for (const item of hardcoded) {
  const key = `${item.file}:${item.line}:${item.kind}:${item.literal}`;
  if (seenHardcoded.has(key)) continue;
  seenHardcoded.add(key);
  uniqueHardcoded.push(item);
}

const duplicates = [...functions.entries()]
  .filter(([, locations]) => locations.length > 1)
  .map(([name, locations]) => ({
    name,
    identical: new Set(locations.map(item => item.sha256)).size === 1,
    locations,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const archiveDirsInsideRoot = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && EXCLUDED_DIR_PREFIXES.some(prefix => entry.name.startsWith(prefix)))
  .map(entry => entry.name);

const result = {
  files: files.length,
  doPostCount,
  doGetCount,
  duplicates,
  hardcoded: uniqueHardcoded,
  syntaxErrors,
  archiveDirsInsideRoot,
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = syntaxErrors.length || doPostCount !== 1 ? 2 : 0;
