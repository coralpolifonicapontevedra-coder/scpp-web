import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const sourceDirectory = path.resolve(
  process.argv[2] || 'apps-script/src'
);

const productionFingerprints = new Set([
  '08B61109', '164DA3BF', '5B89CC6A', '5DD08314',
  '419B0045', '33637D77', 'EA5386F5', 'AA7D2AC8',
  '1AA61D88', 'E3E65310', 'E7412450', '33F50273',
  'CAFDEBBC', '99B1638A', 'BBE4A674', 'F32C2529',
  '27780DBF', 'E91C4FFE', '1F436186', 'D5F267ED',
  '5D304305', '203B8E4C', '7098B871', 'D7497676',
  '011B4240', '2825A8C3'
]);

function fingerprint(value) {
  return createHash('sha256')
    .update(value, 'utf8')
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

const files = (await readdir(sourceDirectory))
  .filter((name) => name.endsWith('.js'))
  .sort();

const errors = [];
const definitions = new Map();

for (const name of files) {
  const source = await readFile(
    path.join(sourceDirectory, name),
    'utf8'
  );

  const prohibitedCalls = [
    ['getActiveSpreadsheet', /SpreadsheetApp\.getActiveSpreadsheet\s*\(/g],
    ['Drive search by name', /DriveApp\.getFilesByName\s*\(/g],
    ['numeric sheet lookup', /\.getSheetById\s*\(/g]
  ];

  for (const [label, pattern] of prohibitedCalls) {
    for (const match of source.matchAll(pattern)) {
      errors.push(
        `${name}:${lineNumber(source, match.index)} uses ${label}`
      );
    }
  }

  for (const match of source.matchAll(
    /(['"])([A-Za-z0-9_-]{30,60})\1/g
  )) {
    const value = match[2];
    const knownProductionValue = productionFingerprints.has(
      fingerprint(value)
    );
    const looksLikeGoogleResource =
      [33, 44].includes(value.length) &&
      /[a-z]/.test(value) &&
      /[A-Z]/.test(value) &&
      /[0-9_-]/.test(value);

    if (knownProductionValue || looksLikeGoogleResource) {
      errors.push(
        `${name}:${lineNumber(source, match.index)} contains a resource identifier literal`
      );
    }
  }

  for (const match of source.matchAll(
    /(['"])[^'"\s@]+@[^'"\s@]+\.[^'"\s@]+\1/g
  )) {
    errors.push(
      `${name}:${lineNumber(source, match.index)} contains a hard-coded email address`
    );
  }

  for (const match of source.matchAll(
    /^function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/gm
  )) {
    const functionName = match[1];
    const location = `${name}:${lineNumber(source, match.index)}`;
    const previous = definitions.get(functionName);

    if (previous) {
      errors.push(
        `duplicate global function ${functionName}: ${previous} and ${location}`
      );
    } else {
      definitions.set(functionName, location);
    }
  }
}

const codeFile = await readFile(
  path.join(sourceDirectory, 'Código.js'),
  'utf8'
);

if (!codeFile.includes('validarAccionPermitidaEntorno_(accion);')) {
  errors.push('Código.js does not enforce the environment write guard');
}

if (!codeFile.includes('Rexistro de acceso omitido: SCPP_ALLOW_WRITES=false')) {
  errors.push('Código.js does not disable access-log writes when writes are disabled');
}

if (!files.includes('configuracion-entorno.js')) {
  errors.push('missing configuracion-entorno.js');
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(
  `OK: ${files.length} Apps Script files have isolated configuration.`
);
