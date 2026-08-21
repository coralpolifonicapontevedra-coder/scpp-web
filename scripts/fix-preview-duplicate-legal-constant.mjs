import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'apps-script-preview', 'Código.js');
if (!fs.existsSync(file)) {
  throw new Error('Non se atopou apps-script-preview/Código.js.');
}

let source = fs.readFileSync(file, 'utf8');

const textosSheetMatches = [
  ...source.matchAll(/const\s+TEXTOS_LEGAIS_SHEET_ID_\s*=\s*2025412208\s*;/g)
];
if (textosSheetMatches.length !== 1) {
  throw new Error(
    `Esperábase unha única declaración de TEXTOS_LEGAIS_SHEET_ID_ e atopáronse ${textosSheetMatches.length}. Non se modificou o ficheiro.`
  );
}

// Elimina todas as declaracións duplicadas deste identificador e volve inserir
// exactamente unha xunto ás constantes de aceptación que funcionan en Produción.
source = source.replace(
  /^\s*const\s+TEXTO_LEGAL_PORTAL_ID_\s*=\s*['"]PRIVACIDADE_WEB['"]\s*;[ \t]*(?:\r?\n)?/gm,
  ''
);

source = source.replace(
  /(const\s+TEXTOS_LEGAIS_SHEET_ID_\s*=\s*2025412208\s*;)/,
  "$1\nconst TEXTO_LEGAL_PORTAL_ID_ = 'PRIVACIDADE_WEB';"
);

const count = (re) => [...source.matchAll(re)].length;
const checks = [
  ['ACEPTACION_SPREADSHEET_ID_', /const\s+ACEPTACION_SPREADSHEET_ID_\s*=/g],
  ['TEXTOS_LEGAIS_SHEET_ID_', /const\s+TEXTOS_LEGAIS_SHEET_ID_\s*=/g],
  ['TEXTO_LEGAL_PORTAL_ID_', /const\s+TEXTO_LEGAL_PORTAL_ID_\s*=/g]
];

for (const [name, re] of checks) {
  const found = count(re);
  if (found !== 1) {
    throw new Error(
      `A validación final de ${name} deu ${found} declaracións. Non se gardou o ficheiro.`
    );
  }
}

const forbidden = /obterPropiedadeObrigatoria_\(\s*['"](?:ACEPTACION_SPREADSHEET_ID|ACEPTACION_SHEET_ID|TEXTOS_LEGAIS_SHEET_ID)['"]\s*\)/;
if (forbidden.test(source)) {
  throw new Error(
    'Aínda quedan dependencias de propiedades de aceptación/textos legais. Non se gardou o ficheiro.'
  );
}

fs.writeFileSync(file, source, 'utf8');
console.log('Constantes legais de Preview corrixidas.');
console.log('Queda unha única declaración de TEXTO_LEGAL_PORTAL_ID_.');
console.log('Mantense unha única declaración de ACEPTACION_SPREADSHEET_ID_ e TEXTOS_LEGAIS_SHEET_ID_.');
console.log('Non se modificou ningún outro ficheiro.');
