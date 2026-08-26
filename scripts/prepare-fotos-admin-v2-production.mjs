import fs from 'node:fs';
import path from 'node:path';

const PRODUCTION_SCRIPT_ID = '1LeJ91m62gdfm8i1XX9EvtxFMvvhhQhMCN_13iUWgvOHaq7q9LUo-nciV';
const root = process.cwd();
const productionDir = path.join(root, 'apps-script-production');
const claspPath = path.join(productionDir, '.clasp.json');
const fotosSource = path.join(root, 'apps-script', 'fotos-administracion-v2.gs');
const huerfanasSource = path.join(root, 'apps-script', 'fotos-huerfanas-v2.gs');
const permisosSource = path.join(root, 'apps-script', 'permisos-portal.gs');

function fail(message) {
  throw new Error(`[FOTOS PRODUCTION V2] ${message}`);
}

if (!fs.existsSync(productionDir)) {
  fail('Non existe apps-script-production. Executa primeiro clasp pull contra SCPP Script de Produción.');
}
if (!fs.existsSync(claspPath)) fail('Falta apps-script-production/.clasp.json.');
if (!fs.existsSync(fotosSource)) fail('Falta apps-script/fotos-administracion-v2.gs.');
if (!fs.existsSync(huerfanasSource)) fail('Falta apps-script/fotos-huerfanas-v2.gs.');
if (!fs.existsSync(permisosSource)) fail('Falta apps-script/permisos-portal.gs.');

let clasp;
try {
  clasp = JSON.parse(fs.readFileSync(claspPath, 'utf8'));
} catch {
  fail('.clasp.json non é JSON válido.');
}
if (String(clasp.scriptId || '').trim() !== PRODUCTION_SCRIPT_ID) {
  fail(`Abortado: o scriptId non é o de Producción (${PRODUCTION_SCRIPT_ID}).`);
}

const jsFiles = fs.readdirSync(productionDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join(productionDir, name));
const anchor = "    if (accion === 'gardarAsistenciaEnsaioPortal') {";
const dispatchers = jsFiles.filter((file) => fs.readFileSync(file, 'utf8').includes(anchor));
if (dispatchers.length !== 1) {
  fail(`Esperábase exactamente un dispatcher co marcador ${anchor.trim()}, atopáronse ${dispatchers.length}.`);
}

const dispatcherPath = dispatchers[0];
let dispatcher = fs.readFileSync(dispatcherPath, 'utf8');
const actionBlocks = [
  {
    marker: "accion === 'comprobarFotosAdministracionPortal'",
    block: "    if (accion === 'comprobarFotosAdministracionPortal') {\n      return respostaJSON(comprobarFotosAdministracionPortal_(datos));\n    }\n\n"
  },
  {
    marker: "accion === 'gardarFotoAdministracionPortal'",
    block: "    if (accion === 'gardarFotoAdministracionPortal') {\n      bloqueo.waitLock(10000);\n      return respostaJSON(gardarFotoAdministracionPortal_(datos));\n    }\n\n"
  },
  {
    marker: "accion === 'eliminarFotoAdministracionPortal'",
    block: "    if (accion === 'eliminarFotoAdministracionPortal') {\n      bloqueo.waitLock(10000);\n      return respostaJSON(eliminarFotoAdministracionPortal_(datos));\n    }\n\n"
  },
  {
    marker: "accion === 'eliminarFotoHuerfanaAdministracionPortal'",
    block: "    if (accion === 'eliminarFotoHuerfanaAdministracionPortal') {\n      bloqueo.waitLock(10000);\n      return respostaJSON(eliminarFotoHuerfanaAdministracionPortal_(datos));\n    }\n\n"
  }
];

for (const action of actionBlocks) {
  if (!dispatcher.includes(action.marker)) dispatcher = dispatcher.replace(anchor, action.block + anchor);
}
for (const action of actionBlocks) {
  if (!dispatcher.includes(action.marker)) fail(`Non se puido inserir a acción ${action.marker} no dispatcher.`);
}

fs.writeFileSync(dispatcherPath, dispatcher, 'utf8');
fs.copyFileSync(fotosSource, path.join(productionDir, 'fotos-administracion-v2.js'));
fs.copyFileSync(huerfanasSource, path.join(productionDir, 'fotos-huerfanas-v2.js'));
fs.copyFileSync(permisosSource, path.join(productionDir, 'permisos-portal.js'));

console.log('Fotografías v2 preparadas para SCPP Script de Producción.');
console.log(`- Script ID de Producción verificado: ${PRODUCTION_SCRIPT_ID}`);
console.log(`- Dispatcher: ${path.basename(dispatcherPath)}`);
console.log('- Acción comprobarFotosAdministracionPortal conectada.');
console.log('- Acción gardarFotoAdministracionPortal conectada cun único lock.');
console.log('- Acción eliminarFotoAdministracionPortal conectada cun único lock e garda física de Producción.');
console.log('- Acción eliminarFotoHuerfanaAdministracionPortal conectada cun único lock e comprobación de ausencia de ficheiros.');
console.log('- fotos-administracion-v2.js copiado.');
console.log('- fotos-huerfanas-v2.js copiado.');
console.log('- permisos-portal.js actualizado co resolvedor central.');
console.log('- NON se executou clasp push nin se crea unha nova versión. Revisa antes de publicar.');
