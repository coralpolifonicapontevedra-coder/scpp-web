import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const productionDir = path.join(root, 'apps-script-production');
const claspPath = path.join(productionDir, '.clasp.json');
const codigoPath = path.join(productionDir, 'Código.js');
const SCRIPT_ID_PRODUCION = '1LeJ91m62gdfm8i1XX9EvtxFMvvhhQhMCN_13iUWgvOHaq7q9LUo-nciV';
const ensaiosSource = path.join(root, 'apps-script', 'ensaios-administracion.gs');
const ensaiosTarget = path.join(productionDir, 'ensaios-administracion.js');
const concertosSource = path.join(root, 'apps-script', 'concertos-administracion.gs');
const concertosTarget = path.join(productionDir, 'concertos-administracion.js');
const concertosEliminarSource = path.join(root, 'apps-script', 'concertos-eliminar.gs');
const concertosEliminarTarget = path.join(productionDir, 'concertos-eliminar.js');
const asistenciasConcertosSource = path.join(root, 'apps-script', 'canonical-2026-08-03', 'asistencias-concertos.gs');
const asistenciasConcertosTarget = path.join(productionDir, 'asistencias-concertos-portal.js');

for (const [file, message] of [
  [claspPath, 'Non se atopou apps-script-production/.clasp.json. Clona primeiro o proxecto SCPP Script de Produción.'],
  [codigoPath, 'Non se atopou apps-script-production/Código.js. Executa antes clasp pull no proxecto de produción.'],
  [ensaiosSource, 'Non se atopou apps-script/ensaios-administracion.gs.'],
  [concertosSource, 'Non se atopou apps-script/concertos-administracion.gs.'],
  [concertosEliminarSource, 'Non se atopou apps-script/concertos-eliminar.gs.'],
  [asistenciasConcertosSource, 'Non se atopou a fonte canónica de asistencias de concertos.']
]) {
  if (!fs.existsSync(file)) throw new Error(message);
}

let clasp;
try {
  clasp = JSON.parse(fs.readFileSync(claspPath, 'utf8'));
} catch {
  throw new Error('apps-script-production/.clasp.json non é un JSON válido. Operación cancelada.');
}
if (String(clasp?.scriptId || '').trim() !== SCRIPT_ID_PRODUCION) {
  throw new Error(`SEGURIDADE: apps-script-production apunta a un Script ID distinto de SCPP Script de Produción. Esperado: ${SCRIPT_ID_PRODUCION}. Non se modificou ningún ficheiro.`);
}

let codigo = fs.readFileSync(codigoPath, 'utf8');
const anchor = "    if (accion === 'gardarAsistenciaEnsaioPortal') {";
if (!codigo.includes(anchor)) {
  throw new Error('Non se atopou o punto seguro de integración no doPost de produción. Non se modificou Código.js.');
}

const ensaiosMarker = "    if (accion === 'listarEnsaiosAdministracionPortal') {";
const ensaiosBlock = `    if (accion === 'listarEnsaiosAdministracionPortal') {\n      try {\n        const resultado = listarEnsaiosAdministracionPortal_(datos);\n        return respostaJSON(resultado);\n      } catch (erroAdminLista) {\n        return respostaJSON({ ok:false, codigo:'ADMIN_ENSAIOS_LIST_EXCEPTION', erro:String(erroAdminLista && erroAdminLista.message ? erroAdminLista.message : erroAdminLista) });\n      }\n    }\n\n    if (accion === 'actualizarEnsaioAdministracionPortal') {\n      try {\n        bloqueo.waitLock(10000);\n        const resultado = actualizarEnsaioAdministracionPortal_(datos);\n        return respostaJSON(resultado);\n      } catch (erroAdminActualizacion) {\n        return respostaJSON({ ok:false, codigo:'ADMIN_ENSAIOS_UPDATE_EXCEPTION', erro:String(erroAdminActualizacion && erroAdminActualizacion.message ? erroAdminActualizacion.message : erroAdminActualizacion), detalle:String(erroAdminActualizacion && erroAdminActualizacion.stack ? erroAdminActualizacion.stack : '') });\n      }\n    }\n\n`;
if (!codigo.includes(ensaiosMarker)) codigo = codigo.replace(anchor, ensaiosBlock + anchor);

const concertosMarker = "    if (accion === 'listarConcertosAdministracionPortal') {";
const concertosBlock = `    if (accion === 'listarConcertosAdministracionPortal') {\n      try {\n        const resultado = listarConcertosAdministracionPortal_(datos);\n        return respostaJSON(resultado);\n      } catch (erroConcertosLista) {\n        return respostaJSON({ ok:false, codigo:'ADMIN_CONCERTOS_LIST_EXCEPTION', erro:String(erroConcertosLista && erroConcertosLista.message ? erroConcertosLista.message : erroConcertosLista) });\n      }\n    }\n\n    if (accion === 'actualizarConcertoAdministracionPortal') {\n      try {\n        bloqueo.waitLock(10000);\n        const resultado = actualizarConcertoAdministracionPortal_(datos);\n        return respostaJSON(resultado);\n      } catch (erroConcertoActualizacion) {\n        return respostaJSON({ ok:false, codigo:'ADMIN_CONCERTOS_UPDATE_EXCEPTION', erro:String(erroConcertoActualizacion && erroConcertoActualizacion.message ? erroConcertoActualizacion.message : erroConcertoActualizacion), detalle:String(erroConcertoActualizacion && erroConcertoActualizacion.stack ? erroConcertoActualizacion.stack : '') });\n      }\n    }\n\n`;
if (!codigo.includes(concertosMarker)) codigo = codigo.replace(anchor, concertosBlock + anchor);

const concertosXestionMarker = "accion === 'gardarConcertoAdministracionPortal'";
const concertosXestionBlock = `    if (accion === 'gardarConcertoAdministracionPortal') {\n      bloqueo.waitLock(10000);\n      return respostaJSON(gardarConcertoAdministracionPortal_(datos));\n    }\n\n    if (accion === 'obterXestionConcertoAdministracionPortal') {\n      return respostaJSON(obterXestionConcertoAdministracionPortal_(datos));\n    }\n\n    if (accion === 'gardarProgramaConcertoAdministracionPortal') {\n      return respostaJSON(gardarProgramaConcertoAdministracionPortal_(datos));\n    }\n\n    if (accion === 'gardarAsistentesConcertoAdministracionPortal') {\n      return respostaJSON(gardarAsistentesConcertoAdministracionPortal_(datos));\n    }\n\n`;
const concertosMedioBlock = `    if (accion === 'actualizarMedioConcertoAdministracionPortal') {\n      bloqueo.waitLock(10000);\n      return respostaJSON(actualizarMedioConcertoAdministracionPortal_(datos));\n    }\n\n`;
const concertosEliminarMarker = "accion === 'eliminarConcertoAdministracionPortal'";
const concertosEliminarBlock = `    if (accion === 'eliminarConcertoAdministracionPortal') {\n      try {\n        bloqueo.waitLock(10000);\n        return respostaJSON(eliminarConcertoAdministracionPortal_(datos));\n      } catch (erroEliminarConcerto) {\n        return respostaJSON({ ok:false, codigo:'ADMIN_CONCERTOS_DELETE_EXCEPTION', erro:String(erroEliminarConcerto && erroEliminarConcerto.message ? erroEliminarConcerto.message : erroEliminarConcerto) });\n      }\n    }\n\n`;

if (!codigo.includes(concertosXestionMarker)) codigo = codigo.replace(anchor, concertosXestionBlock + anchor);
if (!codigo.includes("accion === 'actualizarMedioConcertoAdministracionPortal'")) codigo = codigo.replace(anchor, concertosMedioBlock + anchor);
if (!codigo.includes(concertosEliminarMarker)) codigo = codigo.replace(anchor, concertosEliminarBlock + anchor);

if (!codigo.includes(ensaiosMarker) ||
    !codigo.includes("accion === 'actualizarEnsaioAdministracionPortal'") ||
    !codigo.includes(concertosMarker) ||
    !codigo.includes("accion === 'actualizarConcertoAdministracionPortal'") ||
    !codigo.includes(concertosXestionMarker) ||
    !codigo.includes("accion === 'gardarProgramaConcertoAdministracionPortal'") ||
    !codigo.includes("accion === 'gardarAsistentesConcertoAdministracionPortal'") ||
    !codigo.includes(concertosEliminarMarker)) {
  throw new Error('A integración administrativa non quedou completa. Non se debe executar clasp push.');
}

fs.writeFileSync(codigoPath, codigo, 'utf8');
fs.copyFileSync(ensaiosSource, ensaiosTarget);
fs.copyFileSync(concertosSource, concertosTarget);
fs.copyFileSync(concertosEliminarSource, concertosEliminarTarget);
fs.copyFileSync(asistenciasConcertosSource, asistenciasConcertosTarget);

console.log('Produción de Apps Script preparada con seguridade.');
console.log(`- Script ID verificado: ${SCRIPT_ID_PRODUCION}`);
console.log('- Código.js conserva o dispatcher existente e engade só as accións administrativas que falten.');
console.log('- Programa e asistencias de Concertos quedan sen o bloqueo global de 10 s, igual que na versión validada en Preview.');
console.log('- concertos-eliminar.js habilita a eliminación completa de concerto, programa e asistencias.');
console.log('- ensaios-administracion.js, concertos-administracion.js e asistencias-concertos-portal.js copiados ao proxecto clasp de produción.');
console.log('- Non se modificou appsscript.json nin os módulos normais de Ensaios ou Concertos.');
console.log('- Aínda NON se executou clasp push. Revisa e, despois, executa clasp push dentro de apps-script-production.');
