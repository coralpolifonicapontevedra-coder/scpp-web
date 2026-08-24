import fs from 'node:fs';
import path from 'node:path';

const PREVIEW_SCRIPT_ID = '1icbtEkhRPg0r4wcypJZ4UxQb1NVaky7UKvkrpSQxfx44hAS6rZzq5aeF';
const root = process.cwd();
const previewDir = path.join(root, 'apps-script-preview');
const claspPath = path.join(previewDir, '.clasp.json');
const concertosSource = path.join(root, 'apps-script', 'concertos-administracion.gs');
const ensaiosSource = path.join(root, 'apps-script', 'ensaios-administracion.gs');
const asistenciasConcertosSource = path.join(root, 'apps-script', 'canonical-2026-08-03', 'asistencias-concertos.gs');

function fail(message) {
  throw new Error(`[PREVIEW SAFETY] ${message}`);
}

if (!fs.existsSync(previewDir)) fail('Non existe apps-script-preview. Crea o cartafol e executa clasp pull contra o proxecto de probas.');
if (!fs.existsSync(claspPath)) fail('Falta apps-script-preview/.clasp.json. Non se fará ningún cambio.');

let clasp;
try {
  clasp = JSON.parse(fs.readFileSync(claspPath, 'utf8'));
} catch {
  fail('.clasp.json non é JSON válido. Non se fará ningún cambio.');
}
if (String(clasp.scriptId || '').trim() !== PREVIEW_SCRIPT_ID) {
  fail(`O scriptId non é o de Preview (${PREVIEW_SCRIPT_ID}). Abortado antes de modificar ficheiros.`);
}

for (const [file, message] of [
  [concertosSource, 'Non se atopou apps-script/concertos-administracion.gs.'],
  [ensaiosSource, 'Non se atopou apps-script/ensaios-administracion.gs.'],
  [asistenciasConcertosSource, 'Non se atopou a fonte canónica de asistencias de concertos.']
]) {
  if (!fs.existsSync(file)) fail(message);
}

const jsFiles = fs.readdirSync(previewDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join(previewDir, name));
const anchor = "    if (accion === 'gardarAsistenciaEnsaioPortal') {";
const candidates = jsFiles.filter((file) => fs.readFileSync(file, 'utf8').includes(anchor));
if (candidates.length !== 1) {
  fail(`Esperábase atopar exactamente un dispatcher con '${anchor.trim()}', pero atopáronse ${candidates.length}. Non se modificou o dispatcher.`);
}

const codigoPath = candidates[0];
let codigo = fs.readFileSync(codigoPath, 'utf8');

const ensaiosMarker = "    if (accion === 'listarEnsaiosAdministracionPortal') {";
const ensaiosBlock = `    if (accion === 'listarEnsaiosAdministracionPortal') {\n      try {\n        const resultado = listarEnsaiosAdministracionPortal_(datos);\n        return respostaJSON(resultado);\n      } catch (erroAdminLista) {\n        return respostaJSON({ ok:false, codigo:'ADMIN_ENSAIOS_LIST_EXCEPTION', erro:String(erroAdminLista && erroAdminLista.message ? erroAdminLista.message : erroAdminLista) });\n      }\n    }\n\n    if (accion === 'actualizarEnsaioAdministracionPortal') {\n      try {\n        bloqueo.waitLock(10000);\n        const resultado = actualizarEnsaioAdministracionPortal_(datos);\n        return respostaJSON(resultado);\n      } catch (erroAdminActualizacion) {\n        return respostaJSON({ ok:false, codigo:'ADMIN_ENSAIOS_UPDATE_EXCEPTION', erro:String(erroAdminActualizacion && erroAdminActualizacion.message ? erroAdminActualizacion.message : erroAdminActualizacion), detalle:String(erroAdminActualizacion && erroAdminActualizacion.stack ? erroAdminActualizacion.stack : '') });\n      }\n    }\n\n`;
if (!codigo.includes(ensaiosMarker)) codigo = codigo.replace(anchor, ensaiosBlock + anchor);

const concertosMarker = "    if (accion === 'listarConcertosAdministracionPortal') {";
const concertosBlock = `    if (accion === 'listarConcertosAdministracionPortal') {\n      try {\n        const resultado = listarConcertosAdministracionPortal_(datos);\n        return respostaJSON(resultado);\n      } catch (erroConcertosLista) {\n        return respostaJSON({ ok:false, codigo:'ADMIN_CONCERTOS_LIST_EXCEPTION', erro:String(erroConcertosLista && erroConcertosLista.message ? erroConcertosLista.message : erroConcertosLista) });\n      }\n    }\n\n    if (accion === 'actualizarConcertoAdministracionPortal') {\n      try {\n        bloqueo.waitLock(10000);\n        const resultado = actualizarConcertoAdministracionPortal_(datos);\n        return respostaJSON(resultado);\n      } catch (erroConcertoActualizacion) {\n        return respostaJSON({ ok:false, codigo:'ADMIN_CONCERTOS_UPDATE_EXCEPTION', erro:String(erroConcertoActualizacion && erroConcertoActualizacion.message ? erroConcertoActualizacion.message : erroConcertoActualizacion), detalle:String(erroConcertoActualizacion && erroConcertoActualizacion.stack ? erroConcertoActualizacion.stack : '') });\n      }\n    }\n\n`;
if (!codigo.includes(concertosMarker)) codigo = codigo.replace(anchor, concertosBlock + anchor);

const concertosXestionMarker = "accion === 'gardarConcertoAdministracionPortal'";
const concertosXestionBlock = `    if (accion === 'gardarConcertoAdministracionPortal') {\n      bloqueo.waitLock(10000);\n      return respostaJSON(gardarConcertoAdministracionPortal_(datos));\n    }\n\n    if (accion === 'obterXestionConcertoAdministracionPortal') {\n      return respostaJSON(obterXestionConcertoAdministracionPortal_(datos));\n    }\n\n    if (accion === 'gardarProgramaConcertoAdministracionPortal') {\n      return respostaJSON(gardarProgramaConcertoAdministracionPortal_(datos));\n    }\n\n    if (accion === 'gardarAsistentesConcertoAdministracionPortal') {\n      return respostaJSON(gardarAsistentesConcertoAdministracionPortal_(datos));\n    }\n\n`;
const concertosMedioBlock = `    if (accion === 'actualizarMedioConcertoAdministracionPortal') {\n      bloqueo.waitLock(10000);\n      return respostaJSON(actualizarMedioConcertoAdministracionPortal_(datos));\n    }\n\n`;
if (!codigo.includes(concertosXestionMarker)) codigo = codigo.replace(anchor, concertosXestionBlock + anchor);
if (!codigo.includes("accion === 'actualizarMedioConcertoAdministracionPortal'")) codigo = codigo.replace(anchor, concertosMedioBlock + anchor);

// As escrituras de programa e asistencias son chamadas consecutivas desde a mesma
// finalización e afectan follas distintas. Non deben competir polo bloqueo global
// do dispatcher. Normalizamos tamén dispatchers xa preparados anteriormente.
const bloqueosXestionConcertos = [
  ['gardarProgramaConcertoAdministracionPortal', 'gardarProgramaConcertoAdministracionPortal_'],
  ['gardarAsistentesConcertoAdministracionPortal', 'gardarAsistentesConcertoAdministracionPortal_']
];
for (const [accion, funcion] of bloqueosXestionConcertos) {
  const conBloqueo = `    if (accion === '${accion}') {\n      bloqueo.waitLock(10000);\n      return respostaJSON(${funcion}(datos));\n    }`;
  const senBloqueo = `    if (accion === '${accion}') {\n      return respostaJSON(${funcion}(datos));\n    }`;
  codigo = codigo.replace(conBloqueo, senBloqueo);
}

const required = [
  ensaiosMarker,
  "accion === 'actualizarEnsaioAdministracionPortal'",
  concertosMarker,
  "accion === 'actualizarConcertoAdministracionPortal'",
  concertosXestionMarker,
  "accion === 'obterXestionConcertoAdministracionPortal'",
  "accion === 'gardarProgramaConcertoAdministracionPortal'",
  "accion === 'gardarAsistentesConcertoAdministracionPortal'",
  "accion === 'actualizarMedioConcertoAdministracionPortal'"
];
if (required.some((marker) => !codigo.includes(marker))) {
  fail('A integración administrativa non quedou completa. Non se escribiu o dispatcher.');
}

fs.writeFileSync(codigoPath, codigo, 'utf8');
fs.copyFileSync(concertosSource, path.join(previewDir, 'concertos-administracion.js'));
fs.copyFileSync(ensaiosSource, path.join(previewDir, 'ensaios-administracion.js'));
fs.copyFileSync(asistenciasConcertosSource, path.join(previewDir, 'asistencias-concertos.js'));

console.log('Apps Script PREVIEW preparado con seguridade.');
console.log(`- Script ID verificado: ${PREVIEW_SCRIPT_ID}`);
console.log(`- Dispatcher actualizado: ${path.basename(codigoPath)}`);
console.log('- concertos-administracion.js copiado.');
console.log('- ensaios-administracion.js copiado.');
console.log('- asistencias-concertos.js copiado.');
console.log('- Programa e asistencias de Concertos quedan sen o bloqueo global de 10 s.');
console.log('- Aínda NON se executou clasp push. Revisa e, despois, executa clasp push dentro de apps-script-preview.');
