import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const previewDir = path.join(root, 'apps-script-preview');
const codigoPath = path.join(previewDir, 'Código.js');
const ensaiosSource = path.join(root, 'apps-script', 'ensaios-administracion.gs');
const ensaiosTarget = path.join(previewDir, 'ensaios-administracion.js');
const concertosSource = path.join(root, 'apps-script', 'concertos-administracion.gs');
const concertosTarget = path.join(previewDir, 'concertos-administracion.js');
const manifestSource = path.join(root, 'apps-script', 'appsscript.json');
const manifestTarget = path.join(previewDir, 'appsscript.json');

for (const [file, message] of [
  [codigoPath, 'Non se atopou apps-script-preview/Código.js. Executa antes clasp pull no proxecto de probas.'],
  [ensaiosSource, 'Non se atopou apps-script/ensaios-administracion.gs.'],
  [concertosSource, 'Non se atopou apps-script/concertos-administracion.gs.'],
  [manifestSource, 'Non se atopou apps-script/appsscript.json.']
]) {
  if (!fs.existsSync(file)) throw new Error(message);
}

let codigo = fs.readFileSync(codigoPath, 'utf8');
const anchor = "    if (accion === 'gardarAsistenciaEnsaioPortal') {";
if (!codigo.includes(anchor)) throw new Error('Non se atopou o punto seguro de integración no doPost. Non se modificou Código.js.');

const ensaiosMarker = "    if (accion === 'listarEnsaiosAdministracionPortal') {";
const ensaiosBlock = `    if (accion === 'listarEnsaiosAdministracionPortal') {\n      try {\n        const resultado = listarEnsaiosAdministracionPortal_(datos);\n        return respostaJSON(resultado);\n      } catch (erroAdminLista) {\n        return respostaJSON({ ok:false, codigo:'ADMIN_ENSAIOS_LIST_EXCEPTION', erro:String(erroAdminLista && erroAdminLista.message ? erroAdminLista.message : erroAdminLista) });\n      }\n    }\n\n    if (accion === 'actualizarEnsaioAdministracionPortal') {\n      try {\n        bloqueo.waitLock(10000);\n        const resultado = actualizarEnsaioAdministracionPortal_(datos);\n        return respostaJSON(resultado);\n      } catch (erroAdminActualizacion) {\n        return respostaJSON({ ok:false, codigo:'ADMIN_ENSAIOS_UPDATE_EXCEPTION', erro:String(erroAdminActualizacion && erroAdminActualizacion.message ? erroAdminActualizacion.message : erroAdminActualizacion), detalle:String(erroAdminActualizacion && erroAdminActualizacion.stack ? erroAdminActualizacion.stack : '') });\n      }\n    }\n\n`;

if (!codigo.includes(ensaiosMarker)) codigo = codigo.replace(anchor, ensaiosBlock + anchor);

const concertosMarker = "    if (accion === 'listarConcertosAdministracionPortal') {";
const concertosBlock = `    if (accion === 'listarConcertosAdministracionPortal') {\n      try {\n        const resultado = listarConcertosAdministracionPortal_(datos);\n        return respostaJSON(resultado);\n      } catch (erroConcertosLista) {\n        return respostaJSON({ ok:false, codigo:'ADMIN_CONCERTOS_LIST_EXCEPTION', erro:String(erroConcertosLista && erroConcertosLista.message ? erroConcertosLista.message : erroConcertosLista) });\n      }\n    }\n\n    if (accion === 'actualizarConcertoAdministracionPortal') {\n      try {\n        bloqueo.waitLock(10000);\n        const resultado = actualizarConcertoAdministracionPortal_(datos);\n        return respostaJSON(resultado);\n      } catch (erroConcertoActualizacion) {\n        return respostaJSON({ ok:false, codigo:'ADMIN_CONCERTOS_UPDATE_EXCEPTION', erro:String(erroConcertoActualizacion && erroConcertoActualizacion.message ? erroConcertoActualizacion.message : erroConcertoActualizacion), detalle:String(erroConcertoActualizacion && erroConcertoActualizacion.stack ? erroConcertoActualizacion.stack : '') });\n      }\n    }\n\n`;

if (!codigo.includes(concertosMarker)) codigo = codigo.replace(anchor, concertosBlock + anchor);

fs.writeFileSync(codigoPath, codigo, 'utf8');
fs.copyFileSync(ensaiosSource, ensaiosTarget);
fs.copyFileSync(concertosSource, concertosTarget);
fs.copyFileSync(manifestSource, manifestTarget);

console.log('Preview de Apps Script preparado.');
console.log('- Dispatcher administrativo de ensaios e concertos integrado en Código.js');
console.log('- ensaios-administracion.js e concertos-administracion.js copiados ao proxecto clasp');
console.log('- appsscript.json sincronizado desde GitHub');
console.log('Agora revisa os ficheiros locais e só despois executa clasp push.');
