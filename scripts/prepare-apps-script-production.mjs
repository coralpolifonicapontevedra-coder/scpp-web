import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const productionDir = path.join(root, 'apps-script-production');
const codigoPath = path.join(productionDir, 'Código.js');
const ensaiosSource = path.join(root, 'apps-script', 'ensaios-administracion.gs');
const ensaiosTarget = path.join(productionDir, 'ensaios-administracion.js');
const ensaiosAltaSource = path.join(root, 'apps-script', 'ensaios-alta.gs');
const ensaiosAltaTarget = path.join(productionDir, 'ensaios-alta.js');
const concertosSource = path.join(root, 'apps-script', 'concertos-administracion.gs');
const concertosTarget = path.join(productionDir, 'concertos-administracion.js');

for (const [file, message] of [
  [codigoPath, 'Non se atopou apps-script-production/Código.js. Executa antes clasp pull no proxecto de produción.'],
  [ensaiosSource, 'Non se atopou apps-script/ensaios-administracion.gs.'],
  [ensaiosAltaSource, 'Non se atopou apps-script/ensaios-alta.gs.'],
  [concertosSource, 'Non se atopou apps-script/concertos-administracion.gs.']
]) {
  if (!fs.existsSync(file)) throw new Error(message);
}

let codigo = fs.readFileSync(codigoPath, 'utf8');
const anchor = "    if (accion === 'gardarAsistenciaEnsaioPortal') {";
if (!codigo.includes(anchor)) throw new Error('Non se atopou o punto seguro de integración no doPost de produción. Non se modificou Código.js.');

const altaEnsaioMarker = "    if (accion === 'gardarEnsaioPortal') {";
const altaEnsaioBlock = `    if (accion === 'gardarEnsaioPortal') {\n      try {\n        bloqueo.waitLock(10000);\n        const resultado = gardarEnsaioPortal_(datos);\n        return respostaJSON(resultado);\n      } catch (erroAltaEnsaio) {\n        return respostaJSON({ ok:false, codigo:'ENSAIO_CREATE_EXCEPTION', erro:String(erroAltaEnsaio && erroAltaEnsaio.message ? erroAltaEnsaio.message : erroAltaEnsaio) });\n      }\n    }\n\n`;
if (!codigo.includes(altaEnsaioMarker)) codigo = codigo.replace(anchor, altaEnsaioBlock + anchor);

const ensaiosMarker = "    if (accion === 'listarEnsaiosAdministracionPortal') {";
const ensaiosBlock = `    if (accion === 'listarEnsaiosAdministracionPortal') {\n      try { const resultado = listarEnsaiosAdministracionPortal_(datos); return respostaJSON(resultado); }\n      catch (erroAdminLista) { return respostaJSON({ ok:false, codigo:'ADMIN_ENSAIOS_LIST_EXCEPTION', erro:String(erroAdminLista && erroAdminLista.message ? erroAdminLista.message : erroAdminLista) }); }\n    }\n\n    if (accion === 'actualizarEnsaioAdministracionPortal') {\n      try { bloqueo.waitLock(10000); const resultado = actualizarEnsaioAdministracionPortal_(datos); return respostaJSON(resultado); }\n      catch (erroAdminActualizacion) { return respostaJSON({ ok:false, codigo:'ADMIN_ENSAIOS_UPDATE_EXCEPTION', erro:String(erroAdminActualizacion && erroAdminActualizacion.message ? erroAdminActualizacion.message : erroAdminActualizacion) }); }\n    }\n\n`;
if (!codigo.includes(ensaiosMarker)) codigo = codigo.replace(anchor, ensaiosBlock + anchor);

const concertosMarker = "    if (accion === 'listarConcertosAdministracionPortal') {";
const concertosBlock = `    if (accion === 'listarConcertosAdministracionPortal') {\n      try { const resultado = listarConcertosAdministracionPortal_(datos); return respostaJSON(resultado); }\n      catch (erroConcertosLista) { return respostaJSON({ ok:false, codigo:'ADMIN_CONCERTOS_LIST_EXCEPTION', erro:String(erroConcertosLista && erroConcertosLista.message ? erroConcertosLista.message : erroConcertosLista) }); }\n    }\n\n    if (accion === 'crearConcertoAdministracionPortal') {\n      try { bloqueo.waitLock(10000); const resultado = crearConcertoAdministracionPortal_(datos); return respostaJSON(resultado); }\n      catch (erroConcertoAlta) { return respostaJSON({ ok:false, codigo:'ADMIN_CONCERTOS_CREATE_EXCEPTION', erro:String(erroConcertoAlta && erroConcertoAlta.message ? erroConcertoAlta.message : erroConcertoAlta) }); }\n    }\n\n    if (accion === 'actualizarConcertoAdministracionPortal') {\n      try { bloqueo.waitLock(10000); const resultado = actualizarConcertoAdministracionPortal_(datos); return respostaJSON(resultado); }\n      catch (erroConcertoActualizacion) { return respostaJSON({ ok:false, codigo:'ADMIN_CONCERTOS_UPDATE_EXCEPTION', erro:String(erroConcertoActualizacion && erroConcertoActualizacion.message ? erroConcertoActualizacion.message : erroConcertoActualizacion) }); }\n    }\n\n`;
if (!codigo.includes(concertosMarker)) codigo = codigo.replace(anchor, concertosBlock + anchor);

for (const marker of [altaEnsaioMarker, ensaiosMarker, "accion === 'actualizarEnsaioAdministracionPortal'", concertosMarker, "accion === 'crearConcertoAdministracionPortal'", "accion === 'actualizarConcertoAdministracionPortal'"]) {
  if (!codigo.includes(marker)) throw new Error('A integración administrativa non quedou completa. Non se debe executar clasp push. Falta: ' + marker);
}

fs.writeFileSync(codigoPath, codigo, 'utf8');
fs.copyFileSync(ensaiosSource, ensaiosTarget);
fs.copyFileSync(ensaiosAltaSource, ensaiosAltaTarget);
fs.copyFileSync(concertosSource, concertosTarget);

console.log('Produción de Apps Script preparada para altas e administración de Ensaios e Concertos.');
console.log('- Código.js engade só os dispatchers administrativos/alta que falten.');
console.log('- ensaios-administracion.js, ensaios-alta.js e concertos-administracion.js copiados.');
console.log('- Non se modificou appsscript.json nin os módulos normais de Ensaios ou Concertos.');
console.log('Revisa os ficheiros locais e só despois executa clasp push desde apps-script-production.');
