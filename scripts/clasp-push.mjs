import fs from 'node:fs';
import { execSync } from 'node:child_process';

const TARGETS = {
  preview: '1icbtEkhRPg0r4wcypJZ4UxQb1NVaky7UKvkrpSQxfx44hAS6rZzq5aeF',
  prod: '1LeJ91m62gdfm8i1XX9EvtxFMvvhhQhMCN_13iUWgvOHaq7q9LUo-nciV',
  production: '1LeJ91m62gdfm8i1XX9EvtxFMvvhhQhMCN_13iUWgvOHaq7q9LUo-nciV'
};

const target = (process.argv[2] || 'preview').toLowerCase();
const scriptId = TARGETS[target];

if (!scriptId) {
  console.error(`Entorno descoñecido: "${target}". Usa "preview" ou "prod".`);
  process.exit(1);
}

const claspConfig = {
  scriptId,
  rootDir: './apps-script'
};

fs.writeFileSync('.clasp.json', JSON.stringify(claspConfig, null, 2) + '\n');
console.log(`\n========================================`);
console.log(`[clasp] Entorno: ${target.toUpperCase()}`);
console.log(`[clasp] Script ID: ${scriptId}`);
console.log(`[clasp] Subindo ficheiros de apps-script/...`);
console.log(`========================================\n`);

try {
  execSync('npx @google/clasp push --force', { stdio: 'inherit' });
  console.log(`\n[clasp] ✓ Subida a ${target.toUpperCase()} completada correctamente.\n`);
} catch {
  console.error(`\n[clasp] ✗ Erro ao executar clasp push.\n`);
  process.exit(1);
}
