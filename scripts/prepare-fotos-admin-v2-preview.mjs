import fs from 'node:fs';
import path from 'node:path';

const PREVIEW_SCRIPT_ID = '1icbtEkhRPg0r4wcypJZ4UxQb1NVaky7UKvkrpSQxfx44hAS6rZzq5aeF';
const root = process.cwd();
const previewDir = path.join(root, 'apps-script-preview');
const claspPath = path.join(previewDir, '.clasp.json');
const fotosSource = path.join(root, 'apps-script', 'fotos-administracion-v2.gs');
const huerfanasSource = path.join(root, 'apps-script', 'fotos-huerfanas-v2.gs');
const operacionsSource = path.join(root, 'apps-script', 'fotos-operacions-rapidas-v3.gs');
const permisosSource = path.join(root, 'apps-script', 'permisos-portal.gs');

function fail(message) {
  throw new Error(`[FOTOS PREVIEW V3] ${message}`);
}

if (!fs.existsSync(previewDir)) {
  fail('Non existe apps-script-preview. Executa primeiro clasp pull contra SCPP Script - Pruebas.');
}
if (!fs.existsSync(claspPath)) fail('Falta apps-script-preview/.clasp.json.');
for (const [file, label] of [
  [fotosSource, 'fotos-administracion-v2.gs'],
  [huerfanasSource, 'fotos-huerfanas-v2.gs'],
  [operacionsSource, 'fotos-operacions-rapidas-v3.gs'],
  [permisosSource, 'permisos-portal.gs']
]) {
  if (!fs.existsSync(file)) fail(`Falta ${label}.`);
}

let clasp;
try {
  clasp = JSON.parse(fs.readFileSync(claspPath, 'utf8'));
} catch {
  fail('.clasp.json non é JSON válido.');
}
if (String(clasp.scriptId || '').trim() !== PREVIEW_SCRIPT_ID) {
  fail(`Abortado: o scriptId non é o de Preview (${PREVIEW_SCRIPT_ID}).`);
}

const jsFiles = fs.readdirSync(previewDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join(previewDir, name));
const anchor = "    if (accion === 'gardarAsistenciaEnsaioPortal') {";
const dispatchers = jsFiles.filter((file) => fs.readFileSync(file, 'utf8').includes(anchor));
if (dispatchers.length !== 1) {
  fail(`Esperábase exactamente un dispatcher co marcador ${anchor.trim()}, atopáronse ${dispatchers.length}.`);
}

const dispatcherPath = dispatchers[0];
let dispatcher = fs.readFileSync(dispatcherPath, 'utf8');

const actions = [
  {
    marker: "accion === 'comprobarFotosAdministracionPortal'",
    oldBlock: null,
    newBlock: "    if (accion === 'comprobarFotosAdministracionPortal') {\n      return respostaJSON(comprobarFotosAdministracionPortal_(datos));\n    }\n\n",
    expectedCall: 'comprobarFotosAdministracionPortal_(datos)'
  },
  {
    marker: "accion === 'gardarFotoAdministracionPortal'",
    oldBlock: "    if (accion === 'gardarFotoAdministracionPortal') {\n      bloqueo.waitLock(10000);\n      return respostaJSON(gardarFotoAdministracionPortal_(datos));\n    }\n\n",
    newBlock: "    if (accion === 'gardarFotoAdministracionPortal') {\n      return respostaJSON(gardarFotoAdministracionPortalV3_(datos));\n    }\n\n",
    expectedCall: 'gardarFotoAdministracionPortalV3_(datos)'
  },
  {
    marker: "accion === 'eliminarFotoAdministracionPortal'",
    oldBlock: "    if (accion === 'eliminarFotoAdministracionPortal') {\n      bloqueo.waitLock(10000);\n      return respostaJSON(eliminarFotoAdministracionPortal_(datos));\n    }\n\n",
    newBlock: "    if (accion === 'eliminarFotoAdministracionPortal') {\n      return respostaJSON(eliminarFotoAdministracionPortalV3_(datos));\n    }\n\n",
    expectedCall: 'eliminarFotoAdministracionPortalV3_(datos)'
  },
  {
    marker: "accion === 'eliminarFotoHuerfanaAdministracionPortal'",
    oldBlock: "    if (accion === 'eliminarFotoHuerfanaAdministracionPortal') {\n      bloqueo.waitLock(10000);\n      return respostaJSON(eliminarFotoHuerfanaAdministracionPortal_(datos));\n    }\n\n",
    newBlock: "    if (accion === 'eliminarFotoHuerfanaAdministracionPortal') {\n      return respostaJSON(eliminarFotoHuerfanaAdministracionPortalV3_(datos));\n    }\n\n",
    expectedCall: 'eliminarFotoHuerfanaAdministracionPortalV3_(datos)'
  }
];

for (const action of actions) {
  if (action.oldBlock && dispatcher.includes(action.oldBlock)) {
    dispatcher = dispatcher.replace(action.oldBlock, action.newBlock);
  } else if (!dispatcher.includes(action.marker)) {
    dispatcher = dispatcher.replace(anchor, action.newBlock + anchor);
  }
}

for (const action of actions) {
  if (!dispatcher.includes(action.marker) || !dispatcher.includes(action.expectedCall)) {
    fail(`A acción ${action.marker} non quedou normalizada á implementación v3.`);
  }
}
if (dispatcher.includes("accion === 'gardarFotoAdministracionPortal') {\n      bloqueo.waitLock(10000);")) {
  fail('Gardar Fotografías aínda conserva o bloqueo global antigo.');
}
if (dispatcher.includes("accion === 'eliminarFotoAdministracionPortal') {\n      bloqueo.waitLock(10000);")) {
  fail('Eliminar Fotografías aínda conserva o bloqueo global antigo.');
}

fs.writeFileSync(dispatcherPath, dispatcher, 'utf8');
fs.copyFileSync(fotosSource, path.join(previewDir, 'fotos-administracion-v2.js'));
fs.copyFileSync(huerfanasSource, path.join(previewDir, 'fotos-huerfanas-v2.js'));
fs.copyFileSync(operacionsSource, path.join(previewDir, 'fotos-operacions-rapidas-v3.js'));
fs.copyFileSync(permisosSource, path.join(previewDir, 'permisos-portal.js'));

console.log('Fotografías v3 preparadas para SCPP Script - Pruebas.');
console.log(`- Script ID verificado: ${PREVIEW_SCRIPT_ID}`);
console.log(`- Dispatcher: ${path.basename(dispatcherPath)}`);
console.log('- Gardar/eliminar xa non esperan 10 s polo bloqueo global do dispatcher.');
console.log('- O ScriptLock úsase só na sección crítica da Sheet e libérase antes de Drive.');
console.log('- fotos-operacions-rapidas-v3.js copiado.');
console.log('- NON se executou clasp push. Revisa e executa clasp push dentro de apps-script-preview.');
