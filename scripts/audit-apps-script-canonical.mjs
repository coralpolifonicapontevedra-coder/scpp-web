import fs from 'node:fs';
import path from 'node:path';

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
    // Apps Script V8 é JavaScript; isto detecta erros sintácticos básicos sen executar o código.
    new Function(text);
  } catch (error) {
    syntaxErrors.push({ file: file.rel, error: String(error.message || error) });
  }

  const fnRe = /(?:^|\n)\s*function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let match;
  while ((match = fnRe.exec(text)) !== null) {
    const name = match[1];
    const arr = functions.get(name) || [];
    arr.push(file.rel);
    functions.set(name, arr);
    if (name === 'doPost') doPostCount += 1;
    if (name === 'doGet') doGetCount += 1;
  }

  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const looksLikeGoogleId = /['"][A-Za-z0-9_-]{25,}['"]/.test(line);
    const context = /(openById|getFolderById|SpreadsheetId|SPREADSHEET_ID|FOLDER_ID|sheetId|SHEET_ID|folderId|FolderId|usuariosSpreadsheetId|persoasSpreadsheetId|documentosSpreadsheetId)/i.test(line);
    if (looksLikeGoogleId && context) {
      hardcoded.push({ file: file.rel, line: index + 1, text: line.trim().slice(0, 220) });
    }
  });
}

const duplicates = [...functions.entries()]
  .filter(([, locations]) => locations.length > 1)
  .map(([name, locations]) => ({ name, locations }))
  .sort((a, b) => a.name.localeCompare(b.name));

const archiveDirsInsideRoot = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && EXCLUDED_DIR_PREFIXES.some(prefix => entry.name.startsWith(prefix)))
  .map(entry => entry.name);

const result = {
  files: files.length,
  doPostCount,
  doGetCount,
  duplicates,
  hardcoded,
  syntaxErrors,
  archiveDirsInsideRoot,
};

console.log(JSON.stringify(result, null, 2));

// A auditoría é informativa de momento. A validación estrita activarase cando quede limpa.
process.exitCode = syntaxErrors.length || doPostCount !== 1 ? 2 : 0;
