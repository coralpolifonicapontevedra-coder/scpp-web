import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const productionDir = path.join(root, 'apps-script-production');
const codigoPath = path.join(productionDir, 'Código.js');
const ensaiosSource = path.join(root, 'apps-script', 'ensaios-administracion.gs');
const ensaiosTarget = path.join(productionDir, 'ensaios-administracion.js');
const concertosSource = path.join(root, 'apps-script', 'concertos-administracion.gs');
const concertosTarget = path.join(productionDir, 'concertos-administracion.js');

for (const [file, message] of [
  [codigoPath, 'Non se atopou apps-script-production/Código.js. Executa antes clasp pull no proxecto de produción.'],
  [ensaiosSource, 'Non se atopou apps-script/ensaios-administracion.gs.'],
  [concertosSource, 'Non se atopou apps-script/concertos-administracion.gs.']
]) {
  if (!fs.existsSync(file)) throw new Error(message);
}

let codigo = fs.readFileSync(codigoPath, 'utf8');
const anchor = "    if (accion === 'gardarAsistenciaEnsaioPortal') {";
if (!codigo.includes(anchor)) throw new Error('Non se atopou o punto seguro de integración no doPost. Non se modificou Código.js.');

const ensaiosMarker = "    if (accion === 'listarEnsaiosAdministracionPortal') {";
const ensaiosBlock = `    if (accion === 'listarEnsaiosAdministracionPortal') {\n      try { const resultado = listarEnsaiosAdministracionPortal_(datos); return respostaJSON(resultado); } catch (erro) { return respostaJSON({ ok:false, codigo:'ADMIN_ENSAIOS_LIST_EXCEPTION', erro:String(erro && erro.message ? erro.message : erro) }); }\n    }\n\n    if (accion === 'actualizarEnsaioAdministracionPortal') {\n      try { bloqueo.waitLock(10000); const resultado = actualizarEnsaioAdministracionPortal_(datos); return respostaJSON(resultado); } catch (erro) { return respostaJSON({ ok:false, codigo:'ADMIN_ENSAIOS_UPDATE_EXCEPTION', erro:String(erro && erro.message ? erro.message : erro) }); }\n    }\n\n`;
if (!codigo.includes(ensaiosMarker)) codigo = codigo.replace(anchor, ensaiosBlock + anchor);

const concertosMarker = "    if (accion === 'listarConcertosAdministracionPortal') {";
const concertosBlock = `    if (accion === 'listarConcertosAdministracionPortal') {\n      try { const resultado = listarConcertosAdministracionPortal_(datos); return respostaJSON(resultado); } catch (erro) { return respostaJSON({ ok:false, codigo:'ADMIN_CONCERTOS_LIST_EXCEPTION', erro:String(erro && erro.message ? erro.message : erro) }); }\n    }\n\n    if (accion === 'actualizarConcertoAdministracionPortal') {\n      try { bloqueo.waitLock(10000); const resultado = actualizarConcertoAdministracionPortal_(datos); return respostaJSON(resultado); } catch (erro) { return respostaJSON({ ok:false, codigo:'ADMIN_CONCERTOS_UPDATE_EXCEPTION', erro:String(erro && erro.message ? erro.message : erro) }); }\n    }\n\n    if (accion === 'crearConcertoAdministracionPortal') {\n      try { bloqueo.waitLock(10000); const resultado = crearConcertoAdministracionPortal_(datos); return respostaJSON(resultado); } catch (erro) { return respostaJSON({ ok:false, codigo:'ADMIN_CONCERTOS_CREATE_EXCEPTION', erro:String(erro && erro.message ? erro.message : erro) }); }\n    }\n\n    if (accion === 'eliminarConcertoAdministracionPortal') {\n      try { bloqueo.waitLock(10000); const resultado = eliminarConcertoAdministracionPortal_(datos); return respostaJSON(resultado); } catch (erro) { return respostaJSON({ ok:false, codigo:'ADMIN_CONCERTOS_DELETE_EXCEPTION', erro:String(erro && erro.message ? erro.message : erro) }); }\n    }\n\n`;
if (!codigo.includes(concertosMarker)) codigo = codigo.replace(anchor, concertosBlock + anchor);

const required = [
  "accion === 'listarEnsaiosAdministracionPortal'",
  "accion === 'actualizarEnsaioAdministracionPortal'",
  "accion === 'listarConcertosAdministracionPortal'",
  "accion === 'actualizarConcertoAdministracionPortal'",
  "accion === 'crearConcertoAdministracionPortal'",
  "accion === 'eliminarConcertoAdministracionPortal'"
];
if (required.some((marker) => !codigo.includes(marker))) throw new Error('A integración administrativa non quedou completa. Non se debe executar clasp push.');

fs.writeFileSync(codigoPath, codigo, 'utf8');
fs.copyFileSync(ensaiosSource, ensaiosTarget);
fs.copyFileSync(concertosSource, concertosTarget);

console.log('Apps Script preparado para Administración → Concertos: listar, actualizar, crear e eliminar.');
console.log('Ensaios consérvase sen cambios funcionais.');
console.log('Revisa o destino e desprega primeiro no ambiente Preview; non promover a produción ata validar o circuíto.');
