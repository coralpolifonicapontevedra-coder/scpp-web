import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const sourceDir = resolve('apps-script/src');
const files = readdirSync(sourceDir)
  .filter((name) => name.endsWith('.js'))
  .sort();

if (!files.length) {
  throw new Error('Non hai ficheiros JavaScript en apps-script/src.');
}

let doPostCount = 0;
for (const name of files) {
  const path = join(sourceDir, name);
  execFileSync(process.execPath, ['--check', path], { stdio: 'inherit' });
  const source = readFileSync(path, 'utf8');
  doPostCount += (source.match(/\bfunction\s+doPost\s*\(/g) || []).length;
}

if (doPostCount !== 1) {
  throw new Error(`Esperábase un único doPost; atopáronse ${doPostCount}.`);
}

const manifest = JSON.parse(
  readFileSync(join(sourceDir, 'appsscript.json'), 'utf8')
);
if (manifest.runtimeVersion !== 'V8') {
  throw new Error('O manifesto debe usar o runtime V8.');
}
if (manifest.webapp?.executeAs !== 'USER_DEPLOYING') {
  throw new Error('O web app debe executarse como USER_DEPLOYING.');
}

console.log(
  `Apps Script correcto: ${files.length} ficheiros, manifesto V8 e un doPost.`
);
